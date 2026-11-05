import { AppError } from '@stock/shared';
import { AdjustLine, InventoryCountRepository } from '../src/application/inventory-count-repository';
import { AuditRecord } from '../src/application/product-repository';
import { InventoryCount } from '../src/domain/inventory-count';
import { InMemoryRepo } from './in-memory-product.repository';

/** Shares the product fake so an apply books its movements where the product tests look. */
export class InMemoryInventoryCountRepo extends InventoryCountRepository {
  counts: InventoryCount[] = [];
  constructor(readonly products: InMemoryRepo) {
    super();
  }
  get audit() { return this.products.audit; }
  // a fresh copy per read, like a database row: a refused change must not stick
  private copy(c: InventoryCount) { return InventoryCount.restore({ id: c.id, number: c.number, status: c.status, items: [...c.items], createdAt: c.createdAt }); }
  async findCount(id: string) {
    const c = this.counts.find((x) => x.id === id);
    return c ? this.copy(c) : null;
  }
  async findCounts() { return [...this.counts].reverse(); }
  async createCount(c: InventoryCount, a: AuditRecord) {
    const saved = InventoryCount.restore({ id: c.id, number: this.counts.length + 1, status: c.status, items: [...c.items], createdAt: c.createdAt });
    this.counts.push(saved);
    this.audit.push({ ...a, details: { ...a.details, number: saved.number } });
    return this.copy(saved);
  }
  private save(c: InventoryCount, a: AuditRecord) {
    const stored = this.counts.find((x) => x.id === c.id);
    if (stored?.status !== 'OPEN') throw new AppError('INVENTORY_COUNT_STATUS', { status: stored?.status ?? 'missing' });
    this.counts = this.counts.map((x) => (x.id === c.id ? this.copy(c) : x));
    this.audit.push(a);
  }
  async saveCounted(c: InventoryCount, a: AuditRecord) { this.save(c, a); }
  async cancelCount(c: InventoryCount, a: AuditRecord) { this.save(c, a); }
  async applyCount(c: InventoryCount, lines: AdjustLine[], a: AuditRecord) {
    this.save(c, a);
    for (const l of lines) await this.products.saveMovement(l.product, { ...l.movement, note: l.note }, l.audit);
  }
}
