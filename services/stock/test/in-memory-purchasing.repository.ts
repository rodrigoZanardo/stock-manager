import { AppError } from '@stock/shared';
import { AuditRecord, OrderLine } from '../src/application/product-repository';
import { PurchasingRepository } from '../src/application/purchasing-repository';
import { PurchaseOrder, PurchaseStatus } from '../src/domain/purchase-order';
import { Supplier } from '../src/domain/supplier';
import { InMemoryRepo } from './in-memory-product.repository';

/** Shares the product fake so a receive books its movements where the product tests look. */
export class InMemoryPurchasingRepo extends PurchasingRepository {
  suppliers: Supplier[] = [];
  orders: PurchaseOrder[] = [];
  /** Stored status per order id, as the database would hold it. */
  stored = new Map<string, PurchaseStatus>();
  constructor(readonly products: InMemoryRepo) {
    super();
  }
  get audit() { return this.products.audit; }
  async findSupplier(id: string) { return this.suppliers.find((s) => s.id === id) ?? null; }
  async findSupplierByName(name: string) { return this.suppliers.find((s) => s.name === name) ?? null; }
  async findSuppliers() { return this.suppliers; }
  async createSupplier(s: Supplier, a: AuditRecord) { this.suppliers.push(s); this.audit.push(a); }
  async updateSupplier(_: Supplier, a: AuditRecord) { this.audit.push(a); }
  async deleteSupplier(id: string, a: AuditRecord) {
    if (this.orders.some((o) => o.supplierId === id)) throw new AppError('SUPPLIER_HAS_ORDERS');
    this.suppliers = this.suppliers.filter((s) => s.id !== id);
    this.audit.push(a);
  }
  async findOrder(id: string) {
    const o = this.orders.find((x) => x.id === id);
    // a fresh copy per read, like a database row: a refused change must not stick
    return o ? PurchaseOrder.restore({ id: o.id, number: o.number, supplierId: o.supplierId, supplierName: o.supplierName, status: this.stored.get(o.id) ?? o.status, items: [...o.items], createdAt: o.createdAt }) : null;
  }
  async findOrders() { return [...this.orders].reverse(); }
  async createOrder(o: PurchaseOrder, a: AuditRecord) {
    const saved = PurchaseOrder.restore({ id: o.id, number: this.orders.length + 1, supplierId: o.supplierId, supplierName: o.supplierName, status: o.status, items: [...o.items], createdAt: o.createdAt });
    this.orders.push(saved);
    this.stored.set(o.id, o.status);
    this.audit.push({ ...a, details: { ...a.details, number: saved.number } });
    return saved;
  }
  private save(o: PurchaseOrder, from: PurchaseStatus, a: AuditRecord) {
    const status = this.stored.get(o.id);
    if (status !== from) throw new AppError('PURCHASE_ORDER_STATUS', { status: status ?? 'missing' });
    this.orders = this.orders.map((x) => (x.id === o.id ? o : x));
    this.stored.set(o.id, o.status);
    this.audit.push(a);
  }
  async updateOrderItems(o: PurchaseOrder, a: AuditRecord) { this.save(o, 'DRAFT', a); }
  async changeOrderStatus(o: PurchaseOrder, from: PurchaseStatus, a: AuditRecord) { this.save(o, from, a); }
  async receiveOrder(o: PurchaseOrder, lines: OrderLine[], a: AuditRecord) {
    this.save(o, 'ORDERED', a);
    for (const l of lines) await this.products.saveMovement(l.product, { type: 'IN', quantity: l.quantity, note: l.note }, l.audit);
  }
}
