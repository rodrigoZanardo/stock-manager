import { Injectable } from '@nestjs/common';
import { AppError, hasPrismaCode, isOneOf } from '@stock/shared';
import { AuditRecord, OrderLine } from '../application/product-repository';
import { PurchasingRepository } from '../application/purchasing-repository';
import { PURCHASE_STATUSES, PurchaseOrder, PurchaseStatus } from '../domain/purchase-order';
import { Supplier } from '../domain/supplier';
import { Prisma } from '../../generated/prisma';
import { applyMovement, auditData } from './prisma-product.repository';
import { PrismaService } from './prisma.service';

const orderInclude = { supplier: { select: { name: true } }, items: { include: { product: { select: { sku: true, name: true } } } } } as const;
type OrderRow = Prisma.PurchaseOrderGetPayload<{ include: typeof orderInclude }>;

function toOrder(r: OrderRow): PurchaseOrder {
  if (!isOneOf(PURCHASE_STATUSES, r.status)) throw new Error(`Unknown purchase order status in database: ${r.status}`);
  return PurchaseOrder.restore({
    id: r.id,
    number: r.number,
    supplierId: r.supplierId,
    supplierName: r.supplier.name,
    status: r.status,
    createdAt: r.createdAt,
    items: r.items.map((i) => ({ productId: i.productId, sku: i.product.sku, name: i.product.name, quantity: i.quantity, unitCost: i.unitCost })),
  });
}

const itemRows = (o: PurchaseOrder) => o.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: i.unitCost }));
const supplierData = (s: Supplier) => ({ name: s.name, document: s.document, email: s.email, phone: s.phone });

/** Locks the order row for the transaction and refuses when its stored status is not the expected one. */
async function lockStatus(tx: Prisma.TransactionClient, id: string, expected: PurchaseStatus) {
  const rows = await tx.$queryRaw<{ status: string }[]>`SELECT status FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
  const status = rows[0]?.status;
  if (status === undefined) throw new AppError('PURCHASE_ORDER_NOT_FOUND');
  if (status !== expected) throw new AppError('PURCHASE_ORDER_STATUS', { status });
}

@Injectable()
export class PrismaPurchasingRepository extends PurchasingRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findSupplier(id: string) {
    const r = await this.db.supplier.findUnique({ where: { id } });
    return r && Supplier.restore(r);
  }

  async findSupplierByName(name: string) {
    const r = await this.db.supplier.findUnique({ where: { name } });
    return r && Supplier.restore(r);
  }

  async findSuppliers() {
    return (await this.db.supplier.findMany({ orderBy: { name: 'asc' } })).map((r) => Supplier.restore(r));
  }

  async createSupplier(s: Supplier, audit: AuditRecord) {
    await this.nameGuard(s, () =>
      this.db.$transaction([this.db.supplier.create({ data: { id: s.id, ...supplierData(s) } }), this.db.auditEntry.create({ data: auditData(audit) })]));
  }

  async updateSupplier(s: Supplier, audit: AuditRecord) {
    await this.nameGuard(s, () =>
      this.db.$transaction([this.db.supplier.update({ where: { id: s.id }, data: supplierData(s) }), this.db.auditEntry.create({ data: auditData(audit) })]));
  }

  /** Two requests with the same name can both pass the use case's check; the unique index decides. */
  private async nameGuard(s: Supplier, write: () => Promise<unknown>) {
    try {
      await write();
    } catch (e) {
      if (hasPrismaCode(e, 'P2002')) throw new AppError('SUPPLIER_NAME_TAKEN', { name: s.name });
      throw e;
    }
  }

  async deleteSupplier(id: string, audit: AuditRecord) {
    try {
      await this.db.$transaction([this.db.supplier.delete({ where: { id } }), this.db.auditEntry.create({ data: auditData(audit) })]);
    } catch (e) {
      if (hasPrismaCode(e, 'P2003')) throw new AppError('SUPPLIER_HAS_ORDERS');
      throw e;
    }
  }

  async findOrder(id: string) {
    const r = await this.db.purchaseOrder.findUnique({ where: { id }, include: orderInclude });
    return r && toOrder(r);
  }

  async findOrders() {
    return (await this.db.purchaseOrder.findMany({ orderBy: { number: 'desc' }, include: orderInclude })).map(toOrder);
  }

  async createOrder(o: PurchaseOrder, audit: AuditRecord) {
    return this.db.$transaction(async (tx) => {
      const row = await tx.purchaseOrder.create({
        data: { id: o.id, supplierId: o.supplierId, status: o.status, items: { create: itemRows(o) } },
        include: orderInclude,
      });
      await tx.auditEntry.create({ data: auditData({ ...audit, details: { ...audit.details, number: row.number } }) });
      return toOrder(row);
    });
  }

  async updateOrderItems(o: PurchaseOrder, audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      await lockStatus(tx, o.id, 'DRAFT');
      await tx.purchaseOrderItem.deleteMany({ where: { orderId: o.id } });
      await tx.purchaseOrderItem.createMany({ data: itemRows(o).map((i) => ({ ...i, orderId: o.id })) });
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }

  async changeOrderStatus(o: PurchaseOrder, from: PurchaseStatus, audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      await lockStatus(tx, o.id, from);
      await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: o.status } });
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }

  async receiveOrder(o: PurchaseOrder, lines: OrderLine[], audit: AuditRecord) {
    await this.db.$transaction(async (tx) => {
      // the row lock makes a second, concurrent receive wait and then see RECEIVED
      await lockStatus(tx, o.id, 'ORDERED');
      await tx.purchaseOrder.update({ where: { id: o.id }, data: { status: 'RECEIVED' } });
      for (const l of lines) {
        await applyMovement(tx, l.product, { type: 'IN', quantity: l.quantity, note: l.note }, l.audit);
        await tx.product.update({ where: { id: l.product.id }, data: { cost: l.product.cost } });
      }
      await tx.auditEntry.create({ data: auditData(audit) });
    });
  }
}
