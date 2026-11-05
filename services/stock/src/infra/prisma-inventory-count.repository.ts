import { Injectable } from '@nestjs/common';
import { AppError, isOneOf } from '@stock/shared';
import { AdjustLine, InventoryCountRepository } from '../application/inventory-count-repository';
import { AuditRecord } from '../application/product-repository';
import { COUNT_STATUSES, InventoryCount } from '../domain/inventory-count';
import { Prisma } from '../../generated/prisma';
import { auditData } from './prisma-product.repository';
import { PrismaService } from './prisma.service';

const countInclude = { items: { include: { product: { select: { sku: true, name: true, location: true } } } } } as const;
type CountRow = Prisma.InventoryCountGetPayload<{ include: typeof countInclude }>;

function toCount(r: CountRow): InventoryCount {
  if (!isOneOf(COUNT_STATUSES, r.status)) throw new Error(`Unknown inventory count status in database: ${r.status}`);
  return InventoryCount.restore({
    id: r.id,
    number: r.number,
    status: r.status,
    createdAt: r.createdAt,
    items: r.items
      .map((i) => ({ productId: i.productId, sku: i.product.sku, name: i.product.name, location: i.product.location, expected: i.expected, counted: i.counted }))
      .sort((a, b) => (a.location ?? '~').localeCompare(b.location ?? '~') || a.sku.localeCompare(b.sku)),
  });
}

/** Locks the count row for the transaction and refuses when its stored status is not OPEN. */
async function lockOpen(tx: Prisma.TransactionClient, id: string) {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "InventoryCount" WHERE id = ${id} FOR UPDATE`;
  const stored = rows[0]?.status;
  if (stored === undefined) throw new AppError('INVENTORY_COUNT_NOT_FOUND');
  if (stored !== 'OPEN') throw new AppError('INVENTORY_COUNT_STATUS', { status: stored });
}

@Injectable()
export class PrismaInventoryCountRepository extends InventoryCountRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findCount(id: string) {
    const r = await this.db.inventoryCount.findUnique({ where: { id }, include: countInclude });
    return r && toCount(r);
  }

  async findCounts() {
    return (await this.db.inventoryCount.findMany({ orderBy: { number: 'desc' }, include: countInclude })).map(toCount);
  }

  async createCount(c: InventoryCount, audit: AuditRecord) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.inventoryCount.create({
        data: { id: c.id, status: c.status, items: { create: c.items.map((i) => ({ productId: i.productId, expected: i.expected })) } },
        include: countInclude,
      });
      await tx.auditEntry.create({ data: auditData({ ...audit, details: { ...audit.details, number: row.number } }) });
      return toCount(row);
    });
  }

  async saveCounted(c: InventoryCount, audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      await lockOpen(tx, c.id);
      for (const i of c.items) {
        if (i.counted !== null) await tx.inventoryCountItem.update({ where: { countId_productId: { countId: c.id, productId: i.productId } }, data: { counted: i.counted } });
      }
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }

  async cancelCount(c: InventoryCount, audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      await lockOpen(tx, c.id);
      await tx.inventoryCount.update({ where: { id: c.id }, data: { status: 'CANCELLED' } });
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }

  async applyCount(c: InventoryCount, lines: AdjustLine[], audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      // the row lock makes a second, concurrent apply wait and then see APPLIED
      await lockOpen(tx, c.id);
      await tx.inventoryCount.update({ where: { id: c.id }, data: { status: 'APPLIED' } });
      for (const l of lines) {
        const counted = l.product.quantity;
        // conditional update: a movement or reservation since the product was read must not be overwritten
        const updated = await tx.$executeRaw`UPDATE "Product" SET quantity = ${counted} WHERE id = ${l.product.id} AND quantity = ${l.before} AND reserved <= ${counted}`;
        if (updated === 0) throw new AppError('STOCK_CHANGED');
        await tx.movement.create({
          data: { productId: l.product.id, type: l.movement.type, quantity: l.movement.quantity, note: l.note, actorId: l.audit.actor.id, actorEmail: l.audit.actor.email },
        });
        await tx.auditEntry.create({ data: auditData(l.audit) });
      }
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }
}
