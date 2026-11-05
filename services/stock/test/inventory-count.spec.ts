import type { Actor } from '@stock/shared';
import {
  ApplyInventoryCountUseCase,
  CancelInventoryCountUseCase,
  EnterCountedUseCase,
  StartInventoryCountUseCase,
} from '../src/application/inventory-count.use-cases';
import { InventoryCount } from '../src/domain/inventory-count';
import { Product } from '../src/domain/product';
import { InMemoryInventoryCountRepo } from './in-memory-inventory-count.repository';
import { InMemoryRepo } from './in-memory-product.repository';

const operator: Actor = { id: 'u2', email: 'op@example.com', role: 'OPERATOR' };

function product(id: string, quantity: number, reserved = 0): Product {
  const p = Product.create({ id, sku: `SKU-${id}`, name: `Part ${id}`, minQuantity: 0 });
  if (quantity > 0) p.move('IN', quantity);
  if (reserved > 0) p.reserve(reserved);
  return p;
}

describe('Product count rules', () => {
  it('books the difference as IN or OUT, or nothing when the count matches', () => {
    const p = product('a', 10);
    expect(p.adjustTo(12)).toEqual({ type: 'IN', quantity: 2 });
    expect(p.adjustTo(7)).toEqual({ type: 'OUT', quantity: 5 });
    expect(p.adjustTo(7)).toBeNull();
    expect(p.quantity).toBe(7);
  });

  it('accepts exactly the reserved units and zero, refuses below reserved and non-integers', () => {
    expect(() => product('a', 10, 4).checkCounted(4)).not.toThrow();
    expect(() => product('a', 10).checkCounted(0)).not.toThrow();
    expect(() => product('a', 10, 4).adjustTo(3)).toThrow(expect.objectContaining({ code: 'COUNTED_BELOW_RESERVED', params: { counted: 3, reserved: 4 } }));
    expect(() => product('a', 10).checkCounted(-1)).toThrow(expect.objectContaining({ code: 'COUNTED_INVALID' }));
    expect(() => product('a', 10).checkCounted(1.5)).toThrow(expect.objectContaining({ code: 'COUNTED_INVALID' }));
  });
});

describe('InventoryCount transitions', () => {
  const start = () => InventoryCount.start({ id: 'c1', products: [{ id: 'a', sku: 'A', name: 'A', location: null, quantity: 3 }] });

  it('refuses to start without products', () => {
    expect(() => InventoryCount.start({ id: 'c1', products: [] })).toThrow(expect.objectContaining({ code: 'INVENTORY_COUNT_EMPTY' }));
  });

  it('refuses to apply with nothing counted, and refuses a product outside the count', () => {
    const c = start();
    expect(() => c.apply()).toThrow(expect.objectContaining({ code: 'INVENTORY_NOTHING_COUNTED' }));
    expect(() => c.enter([{ productId: 'zz', counted: 1 }])).toThrow(expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }));
  });

  it('applies once; a closed count takes no counts, apply or cancel', () => {
    const c = start();
    c.enter([{ productId: 'a', counted: 2 }]);
    c.apply();
    expect(c.status).toBe('APPLIED');
    for (const act of [() => c.apply(), () => c.cancel(), () => c.enter([{ productId: 'a', counted: 1 }])])
      expect(act).toThrow(expect.objectContaining({ code: 'INVENTORY_COUNT_STATUS', params: { status: 'APPLIED' } }));
    const cancelled = start();
    cancelled.cancel();
    expect(() => cancelled.apply()).toThrow(expect.objectContaining({ code: 'INVENTORY_COUNT_STATUS', params: { status: 'CANCELLED' } }));
  });
});

describe('inventory count use cases', () => {
  let products: InMemoryRepo;
  let repo: InMemoryInventoryCountRepo;

  beforeEach(() => {
    products = new InMemoryRepo();
    repo = new InMemoryInventoryCountRepo(products);
    products.items.push(product('a', 10), product('b', 5, 2), product('c', 8));
  });

  const startCount = () => new StartInventoryCountUseCase(repo, products).execute(operator);

  it('snapshots every product, enters some counts and books only the differences with the count number', async () => {
    const count = await startCount();
    expect(count.number).toBe(1);
    expect(count.items.map((i) => [i.productId, i.expected, i.counted])).toEqual([['a', 10, null], ['b', 5, null], ['c', 8, null]]);

    await new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: 'a', counted: 12 }, { productId: 'b', counted: 3 }] }, operator);
    await new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: 'c', counted: 8 }] }, operator);
    products.audit = [];
    const applied = await new ApplyInventoryCountUseCase(repo, products).execute(count.id, operator);

    expect(applied.status).toBe('APPLIED');
    expect(products.items.map((p) => p.quantity)).toEqual([12, 3, 8]);
    expect(products.movements.map((m) => [m.productId, m.type, m.quantity, m.note]).slice(-2)).toEqual([
      ['a', 'IN', 2, 'Inventário #1'],
      ['b', 'OUT', 2, 'Inventário #1'],
    ]);
    expect(products.audit.map((a) => a.action)).toEqual(['INVENTORY_APPLIED', 'STOCK_IN', 'STOCK_OUT']);
    expect(products.audit[0]?.details).toMatchObject({ number: 1, adjusted: 2 });
  });

  it('refuses a count below the reserved units and keeps it out of the count', async () => {
    const count = await startCount();
    await expect(new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: 'b', counted: 1 }] }, operator))
      .rejects.toMatchObject({ code: 'COUNTED_BELOW_RESERVED', params: { counted: 1, reserved: 2 } });
    expect((await repo.findCount(count.id))?.items.find((i) => i.productId === 'b')?.counted).toBeNull();
  });

  it('refuses at apply when reservations grew after the count was entered', async () => {
    const count = await startCount();
    await new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: 'b', counted: 3 }] }, operator);
    products.items[1]?.reserve(2);
    await expect(new ApplyInventoryCountUseCase(repo, products).execute(count.id, operator)).rejects.toMatchObject({ code: 'COUNTED_BELOW_RESERVED' });
    expect((await repo.findCount(count.id))?.status).toBe('OPEN');
  });

  it('cannot apply twice or after a cancel', async () => {
    const first = await startCount();
    await new EnterCountedUseCase(repo, products).execute({ id: first.id, items: [{ productId: 'a', counted: 9 }] }, operator);
    await new ApplyInventoryCountUseCase(repo, products).execute(first.id, operator);
    await expect(new ApplyInventoryCountUseCase(repo, products).execute(first.id, operator)).rejects.toMatchObject({ code: 'INVENTORY_COUNT_STATUS' });
    expect(products.items[0]?.quantity).toBe(9);

    const second = await startCount();
    await new CancelInventoryCountUseCase(repo).execute(second.id, operator);
    await expect(new ApplyInventoryCountUseCase(repo, products).execute(second.id, operator)).rejects.toMatchObject({ code: 'INVENTORY_COUNT_STATUS', params: { status: 'CANCELLED' } });
  });

  it('answers INVENTORY_COUNT_NOT_FOUND for an unknown count', async () => {
    await expect(new ApplyInventoryCountUseCase(repo, products).execute('nope', operator)).rejects.toMatchObject({ code: 'INVENTORY_COUNT_NOT_FOUND' });
  });
});
