import { Injectable } from '@nestjs/common';
import { AppError, hasPrismaCode, isJsonObject, isMovementType, isOneOf } from '@stock/shared';
import { AUDIT_ACTIONS, AuditEntry, AuditRecord, Movement, OrderLine, ProductRepository } from '../application/product-repository';
import { MovementType, Product } from '../domain/product';
import { Prisma } from '../../generated/prisma';
import { PrismaService } from './prisma.service';

type Row = { id: string; sku: string; name: string; quantity: number; reserved: number; minQuantity: number; maxQuantity: number | null };
const toDomain = (r: Row) => Product.restore(r);
/** The column is a plain string; anything else than IN/OUT means corrupted data, not a user error. */
function toType(type: string): MovementType {
  if (!isMovementType(type)) throw new Error(`Unknown movement type in database: ${type}`);
  return type;
}

type MovementRow = { id: string; type: string; quantity: number; note: string | null; actorEmail: string | null; createdAt: Date };
function toMovement({ id, type, quantity, note, actorEmail, createdAt }: MovementRow): Movement {
  return { id, type: toType(type), quantity, note, actorEmail, createdAt };
}

const auditData = (a: AuditRecord) => ({ action: a.action, productId: a.productId, details: a.details, actorId: a.actor.id, actorEmail: a.actor.email });

type AuditRow = { id: string; action: string; productId: string | null; details: unknown; actorEmail: string; createdAt: Date };
function toAuditEntry({ id, action, productId, details, actorEmail, createdAt }: AuditRow): AuditEntry {
  if (!isOneOf(AUDIT_ACTIONS, action) || !isJsonObject(details)) throw new Error(`Corrupted audit entry in database: ${id}`);
  return { id, action, productId, details, actorEmail, createdAt };
}

/** ProcessedWebhook key that marks an order delivered or cancelled. */
const closedKey = (orderId: string) => `closed:${orderId}`;

@Injectable()
export class PrismaProductRepository extends ProductRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findById(id: string) {
    const r = await this.db.product.findUnique({ where: { id } });
    return r && toDomain(r);
  }

  async findBySku(sku: string) {
    const r = await this.db.product.findUnique({ where: { sku } });
    return r && toDomain(r);
  }

  async findAll() {
    return (await this.db.product.findMany({ orderBy: { name: 'asc' } })).map(toDomain);
  }

  async create(p: Product, audit: AuditRecord) {
    try {
      await this.db.$transaction([
        this.db.product.create({
          data: { id: p.id, sku: p.sku, name: p.name, quantity: p.quantity, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity },
        }),
        this.db.auditEntry.create({ data: auditData(audit) }),
      ]);
    } catch (e) {
      // two requests with the same SKU can both pass the use case's check; the unique index decides
      if (hasPrismaCode(e, 'P2002')) throw new AppError('SKU_TAKEN', { sku: p.sku });
      throw e;
    }
  }

  async update(p: Product, audit: AuditRecord) {
    await this.db.$transaction([
      this.db.product.update({ where: { id: p.id }, data: { name: p.name, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity } }),
      this.db.auditEntry.create({ data: auditData(audit) }),
    ]);
  }

  async delete(id: string, audit: AuditRecord) {
    try {
      await this.db.$transaction([this.db.product.delete({ where: { id } }), this.db.auditEntry.create({ data: auditData(audit) })]);
    } catch (e) {
      // P2003: a movement was saved after the use case checked the history; the foreign key protects it
      if (hasPrismaCode(e, 'P2003')) throw new AppError('PRODUCT_HAS_MOVEMENTS');
      throw e;
    }
  }

  async hasMovements(productId: string) {
    return (await this.db.movement.count({ where: { productId }, take: 1 })) > 0;
  }

  async findMovements(productId: string, limit: number) {
    const rows = await this.db.movement.findMany({ where: { productId }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(toMovement);
  }

  async findMovementsSince(since: Date) {
    const rows = await this.db.movement.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true } } },
    });
    return rows.map((r) => ({ ...toMovement(r), productId: r.productId, productName: r.product.name }));
  }

  async movementTotals(since?: Date) {
    const groups = await this.db.movement.groupBy({
      by: ['productId', 'type'],
      where: since ? { createdAt: { gte: since } } : undefined,
      _sum: { quantity: true },
    });
    return groups.map((g) => ({ productId: g.productId, type: toType(g.type), quantity: g._sum.quantity ?? 0 }));
  }

  async saveMovement(p: Product, m: { type: MovementType; quantity: number; note?: string }, audit: AuditRecord) {
    await this.db.$transaction((tx) => this.applyMovement(tx, p, m, audit));
  }

  async isEventProcessed(eventSeq: string) {
    return (await this.db.processedWebhook.count({ where: { eventSeq } })) > 0;
  }

  async saveOrderReservation(eventSeq: string, order: { id: string; number: number }, lines: OrderLine[]) {
    return this.orderTransaction(eventSeq, order.id, async (tx) => {
      if ((await tx.processedWebhook.count({ where: { eventSeq: closedKey(order.id) } })) > 0) return 'closed' as const;
      for (const l of lines) {
        if (l.quantity > 0) {
          // same guard as a manual OUT: only what is not already held for another order
          const updated = await tx.$executeRaw`UPDATE "Product" SET reserved = reserved + ${l.quantity} WHERE id = ${l.product.id} AND quantity - reserved >= ${l.quantity}`;
          if (updated === 0) throw new AppError('STOCK_CHANGED');
          await tx.reservation.create({ data: { orderId: order.id, productId: l.product.id, quantity: l.quantity, orderNumber: order.number } });
        }
        await tx.auditEntry.create({ data: auditData(l.audit) });
      }
      return 'saved' as const;
    });
  }

  async saveOrderClosing(eventSeq: string, orderId: string, releaseAudit: (r: { productId: string; quantity: number }) => AuditRecord, deliveries: OrderLine[]) {
    const result = await this.orderTransaction(eventSeq, orderId, async (tx) => {
      // a late ORDER_CREATED finds this key and reserves nothing; skipDuplicates: an order can be cancelled after delivery, or the reverse
      await tx.processedWebhook.createMany({ data: [{ eventSeq: closedKey(orderId) }], skipDuplicates: true });
      for (const r of await tx.reservation.findMany({ where: { orderId }, orderBy: { productId: 'asc' } })) {
        await tx.product.update({ where: { id: r.productId }, data: { reserved: { decrement: r.quantity } } });
        await tx.auditEntry.create({ data: auditData(releaseAudit(r)) });
      }
      await tx.reservation.deleteMany({ where: { orderId } });
      for (const l of deliveries) {
        if (l.quantity > 0) await this.applyMovement(tx, l.product, { type: 'OUT', quantity: l.quantity, note: l.note }, l.audit, false);
        else await tx.auditEntry.create({ data: auditData(l.audit) });
      }
      return 'saved' as const;
    });
    return result === 'saved';
  }

  /** Stores the event and runs `work` in one transaction, one order at a time. */
  private async orderTransaction<T>(eventSeq: string, orderId: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T | 'duplicate'> {
    try {
      return await this.db.$transaction(async (tx) => {
        // serializes the events of one order, so a create and a delivery arriving together cannot miss each other
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${orderId}))`;
        await tx.processedWebhook.create({ data: { eventSeq } });
        return work(tx);
      });
    } catch (e) {
      // a parallel request stored the same event first; the unique key decides
      if (hasPrismaCode(e, 'P2002')) return 'duplicate';
      throw e;
    }
  }

  /** `guardReserved`: a user's OUT may not take units held for orders; a delivery is limited by the shelf only. */
  private async applyMovement(tx: Prisma.TransactionClient, p: Product, m: { type: MovementType; quantity: number; note?: string }, audit: AuditRecord, guardReserved = true) {
    const delta = m.type === 'IN' ? m.quantity : -m.quantity;
    const floor = m.type === 'OUT' ? m.quantity : 0;
    // conditional update: guards against two concurrent withdrawals (or a withdrawal and a reservation) both passing the in-memory check
    const updated = await tx.$executeRaw`UPDATE "Product" SET quantity = quantity + ${delta}
      WHERE id = ${p.id} AND quantity - ${guardReserved ? Prisma.sql`reserved` : Prisma.sql`0`} >= ${floor}`;
    if (updated === 0) throw new AppError('STOCK_CHANGED');
    await tx.movement.create({
      data: { productId: p.id, type: m.type, quantity: m.quantity, note: m.note, actorId: audit.actor.id, actorEmail: audit.actor.email },
    });
    await tx.auditEntry.create({ data: auditData(audit) });
  }

  async findAuditEntries(limit: number) {
    return (await this.db.auditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: limit })).map(toAuditEntry);
  }
}
