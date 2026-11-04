import { AuditRecord, ProductMovement, ProductRepository } from '../src/application/product-repository';
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
  async saveOrderDelivery(seq: string, note: string, lines: { product: Product; quantity: number; audit: AuditRecord }[]) {
    if (this.processed.has(seq)) return false;
    this.processed.add(seq);
    for (const l of lines) await this.saveMovement(l.product, { type: 'OUT', quantity: l.quantity, note }, l.audit);
    return true;
  }
  async findAuditEntries(limit: number) {
    return this.audit.map((a, i) => ({ id: String(i), action: a.action, productId: a.productId, details: a.details, actorEmail: a.actor.email, createdAt: new Date() }))
      .reverse().slice(0, limit);
  }
}
