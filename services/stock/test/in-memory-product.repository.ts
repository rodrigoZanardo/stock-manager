import { AuditRecord, OrderLine, ProductMovement, ProductRepository } from '../src/application/product-repository';
import { MovementType, Product } from '../src/domain/product';

export class InMemoryRepo extends ProductRepository {
  items: Product[] = [];
  movements: ProductMovement[] = [];
  audit: AuditRecord[] = [];
  async movementTotals(since?: Date) {
    const totals = new Map<string, { productId: string; type: MovementType; quantity: number }>();
    for (const m of this.movements.filter((m) => !since || m.createdAt >= since)) {
      const key = `${m.productId}:${m.type}`;
      const t = totals.get(key) ?? { productId: m.productId, type: m.type, quantity: 0 };
      t.quantity += m.quantity;
      totals.set(key, t);
    }
    return [...totals.values()];
  }
  async hasMovements(productId: string) { return this.movements.some((m) => m.productId === productId); }
  async findMovementsSince(since: Date) { return this.movements.filter((m) => m.createdAt >= since).reverse(); }
  async findById(id: string) { return this.items.find((p) => p.id === id) ?? null; }
  async findBySku(sku: string) { return this.items.find((p) => p.sku === sku) ?? null; }
  async findAll() { return this.items; }
  async create(p: Product, a: AuditRecord) { this.items.push(p); this.audit.push(a); }
  async update(_: Product, a: AuditRecord) { this.audit.push(a); }
  async delete(id: string, a: AuditRecord) { this.items = this.items.filter((p) => p.id !== id); this.audit.push(a); }
  async findMovements(productId: string, limit: number) { return this.movements.filter((m) => m.productId === productId).reverse().slice(0, limit); }
  async saveMovement(p: Product, m: { type: MovementType; quantity: number; note?: string }, a: AuditRecord) {
    this.movements.push({ id: String(this.movements.length), productId: p.id, productName: p.name, note: m.note ?? null, actorEmail: a.actor.email, createdAt: new Date(), type: m.type, quantity: m.quantity });
    this.audit.push(a);
  }
  processed = new Set<string>();
  async isEventProcessed(seq: string) { return this.processed.has(seq); }
  /** orderId -> productId -> quantity */
  reservations = new Map<string, Map<string, number>>();
  async saveOrderReservation(seq: string, order: { id: string; number: number }, lines: OrderLine[]) {
    if (this.processed.has(seq)) return 'duplicate' as const;
    this.processed.add(seq);
    if (this.processed.has(`closed:${order.id}`)) { for (const l of lines) if (l.quantity > 0) l.product.release(l.quantity); return 'closed' as const; }
    const held = this.reservations.get(order.id) ?? new Map<string, number>();
    for (const l of lines) {
      if (l.quantity > 0) held.set(l.product.id, l.quantity);
      this.audit.push(l.audit);
    }
    this.reservations.set(order.id, held);
    return 'saved' as const;
  }
  async saveOrderClosing(seq: string, orderId: string, releaseAudit: (r: { productId: string; quantity: number }) => AuditRecord, deliveries: OrderLine[]) {
    if (this.processed.has(seq)) return false;
    this.processed.add(seq);
    this.processed.add(`closed:${orderId}`);
    for (const [productId, quantity] of this.reservations.get(orderId) ?? []) {
      this.items.find((p) => p.id === productId)?.release(quantity);
      this.audit.push(releaseAudit({ productId, quantity }));
    }
    this.reservations.delete(orderId);
    for (const l of deliveries) {
      if (l.quantity > 0) await this.saveMovement(l.product, { type: 'OUT', quantity: l.quantity, note: l.note }, l.audit);
      else this.audit.push(l.audit);
    }
    return true;
  }
  async findAuditEntries(limit: number) {
    return this.audit.map((a, i) => ({ id: String(i), action: a.action, productId: a.productId, details: a.details, actorEmail: a.actor.email, createdAt: new Date() }))
      .reverse().slice(0, limit);
  }
}
