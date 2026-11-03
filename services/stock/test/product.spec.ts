import type { Actor } from '@stock/shared';
import {
  CreateProductUseCase,
  HISTORY_LIMIT,
  ListAuditUseCase,
  DeleteProductUseCase,
  ListMovementsUseCase,
  RegisterMovementUseCase,
  UpdateProductUseCase,
} from '../src/application/product.use-cases';
import { Product } from '../src/domain/product';
import { InMemoryRepo } from './in-memory-product.repository';

const admin: Actor = { id: 'u1', email: 'admin@example.com', role: 'ADMIN' };

describe('product CRUD', () => {
  let repo: InMemoryRepo;
  let create: CreateProductUseCase;

  beforeEach(() => {
    repo = new InMemoryRepo();
    create = new CreateProductUseCase(repo);
  });

  it('updates name and minimum but keeps SKU and quantity', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 2 }, admin);
    const after = await new UpdateProductUseCase(repo).execute({ id: p.id, name: ' Wireless keyboard ', minQuantity: 0 }, admin);
    expect(after.name).toBe('Wireless keyboard');
    expect(after.minQuantity).toBe(0);
    expect(after.sku).toBe('KB-001');
  });

  it('keeps the maximum when an update leaves it out, and removes it on null', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 2, maxQuantity: 40 }, admin);
    const update = new UpdateProductUseCase(repo);
    expect((await update.execute({ id: p.id, name: 'Keyboard', minQuantity: 3 }, admin)).maxQuantity).toBe(40);
    // what the HTTP layer actually passes when the field is left out
    expect((await update.execute({ id: p.id, name: 'Keyboard', minQuantity: 3, maxQuantity: undefined }, admin)).maxQuantity).toBe(40);
    expect((await update.execute({ id: p.id, name: 'Keyboard', minQuantity: 3, maxQuantity: null }, admin)).maxQuantity).toBeNull();
  });

  it('rejects an empty name or negative minimum on update', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 2 }, admin);
    const update = new UpdateProductUseCase(repo);
    await expect(update.execute({ id: p.id, name: '  ', minQuantity: 1 }, admin)).rejects.toMatchObject({ code: 'PRODUCT_NAME_REQUIRED' });
    await expect(update.execute({ id: p.id, name: 'Ok', minQuantity: -1 }, admin)).rejects.toMatchObject({ code: 'MIN_QUANTITY_INVALID' });
    expect(p.name).toBe('Keyboard');
    await expect(update.execute({ id: 'nope', name: 'Ok', minQuantity: 1 }, admin)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('deletes a product with no history, refuses one with movements', async () => {
    const del = new DeleteProductUseCase(repo);
    const fresh = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    const used = await create.execute({ sku: 'MS-001', name: 'Mouse', minQuantity: 0 }, admin);
    await new RegisterMovementUseCase(repo).execute({ productId: used.id, type: 'IN', quantity: 1 }, admin);
    await del.execute(fresh.id, admin);
    await expect(del.execute(used.id, admin)).rejects.toMatchObject({ code: 'PRODUCT_HAS_MOVEMENTS' });
    expect(repo.items.map((p) => p.sku)).toEqual(['MS-001']);
  });

  it('lists movements newest first', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    const move = new RegisterMovementUseCase(repo);
    await move.execute({ productId: p.id, type: 'IN', quantity: 5 }, admin);
    await move.execute({ productId: p.id, type: 'OUT', quantity: 2, note: 'sold' }, admin);
    const list = await new ListMovementsUseCase(repo).execute(p.id);
    expect(list.map((m) => m.type)).toEqual(['OUT', 'IN']);
    await expect(new ListMovementsUseCase(repo).execute('nope')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('shows only the newest movements up to the history limit', async () => {
    const p = await create.execute({ sku: 'KB-002', name: 'Keyboard', minQuantity: 0 }, admin);
    const move = new RegisterMovementUseCase(repo);
    for (let i = 1; i <= HISTORY_LIMIT + 1; i++) await move.execute({ productId: p.id, type: 'IN', quantity: i }, admin);
    const list = await new ListMovementsUseCase(repo).execute(p.id);
    expect(list).toHaveLength(HISTORY_LIMIT);
    expect(list[0]?.quantity).toBe(HISTORY_LIMIT + 1);
  });
});

describe('stock rules', () => {
  let repo: InMemoryRepo;
  let create: CreateProductUseCase;
  let move: RegisterMovementUseCase;

  beforeEach(() => {
    repo = new InMemoryRepo();
    create = new CreateProductUseCase(repo);
    move = new RegisterMovementUseCase(repo);
  });

  it('creates a product with zero stock and a normalized SKU', async () => {
    const p = await create.execute({ sku: ' kb-001 ', name: 'Keyboard', minQuantity: 2 }, admin);
    expect(p.sku).toBe('KB-001');
    expect(p.quantity).toBe(0);
    expect(p.isLowStock).toBe(true);
  });

  it('rejects a duplicate SKU', async () => {
    await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    await expect(create.execute({ sku: 'kb-001', name: 'Other', minQuantity: 0 }, admin)).rejects.toMatchObject({ code: 'SKU_TAKEN', params: { sku: 'KB-001' } });
  });

  it('adds and removes stock and records each movement', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 2 }, admin);
    await move.execute({ productId: p.id, type: 'IN', quantity: 10 }, admin);
    const after = await move.execute({ productId: p.id, type: 'OUT', quantity: 7 }, admin);
    expect(after.quantity).toBe(3);
    expect(after.isLowStock).toBe(false);
    expect(repo.movements).toHaveLength(2);
  });

  it('never lets stock go negative', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    await move.execute({ productId: p.id, type: 'IN', quantity: 3 }, admin);
    await expect(move.execute({ productId: p.id, type: 'OUT', quantity: 4 }, admin)).rejects.toMatchObject({ code: 'NOT_ENOUGH_STOCK', params: { available: 3, requested: 4 }, message: 'Not enough stock: 3 available, 4 requested.' });
    expect(p.quantity).toBe(3);
  });

  it('rejects zero, fractional and unknown products', async () => {
    const p = await create.execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    await expect(move.execute({ productId: p.id, type: 'IN', quantity: 0 }, admin)).rejects.toMatchObject({ code: 'QUANTITY_INVALID' });
    await expect(move.execute({ productId: p.id, type: 'IN', quantity: 1.5 }, admin)).rejects.toMatchObject({ code: 'QUANTITY_INVALID' });
    await expect(move.execute({ productId: 'nope', type: 'IN', quantity: 1 }, admin)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});

describe('SKU rules', () => {
  const create = (sku: string) => new CreateProductUseCase(new InMemoryRepo()).execute({ sku, name: 'Item', minQuantity: 0 }, admin);

  it.each(['ab', 'a'.repeat(33), 'AB_1', 'AB 1', '   '])('rejects %p', async (sku) => {
    await expect(create(sku)).rejects.toMatchObject({ code: 'SKU_INVALID' });
  });

  it('accepts 3 and 32 characters and normalizes case and spaces', async () => {
    expect((await create('abc')).sku).toBe('ABC');
    expect((await create('a'.repeat(32))).sku).toBe('A'.repeat(32));
    expect((await create(' ab-1 ')).sku).toBe('AB-1');
  });
});

describe('product limits', () => {
  it('reports LOW, OK and OVER against min and max', () => {
    const at = (quantity: number) => Product.restore({ id: '1', sku: 'A-1', name: 'A', quantity, minQuantity: 2, maxQuantity: 10 }).status;
    expect([at(2), at(3), at(10), at(11)]).toEqual(['LOW', 'OK', 'OK', 'OVER']);
  });

  it('LOW at zero stock with minimum zero, so an empty shelf is always flagged', () => {
    expect(Product.restore({ id: '1', sku: 'A-1', name: 'A', quantity: 0, minQuantity: 0, maxQuantity: null }).status).toBe('LOW');
  });

  it('accepts a maximum below the current stock on update and then reports OVER', async () => {
    const repo = new InMemoryRepo();
    const p = await new CreateProductUseCase(repo).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 1 }, admin);
    await new RegisterMovementUseCase(repo).execute({ productId: p.id, type: 'IN', quantity: 20 }, admin);
    const after = await new UpdateProductUseCase(repo).execute({ id: p.id, name: 'Keyboard', minQuantity: 1, maxQuantity: 10 }, admin);
    expect(after.status).toBe('OVER');
  });

  it('takes out exactly the whole stock', async () => {
    const repo = new InMemoryRepo();
    const p = await new CreateProductUseCase(repo).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    const move = new RegisterMovementUseCase(repo);
    await move.execute({ productId: p.id, type: 'IN', quantity: 5 }, admin);
    expect((await move.execute({ productId: p.id, type: 'OUT', quantity: 5 }, admin)).quantity).toBe(0);
  });

  it.each([2.5, 5, 3])('rejects a maximum of %p when the minimum is 5', async (maxQuantity) => {
    await expect(new CreateProductUseCase(new InMemoryRepo()).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 5, maxQuantity }, admin))
      .rejects.toMatchObject({ code: 'MAX_QUANTITY_INVALID' });
  });

  it('rejects a maximum that is not above the minimum', async () => {
    await expect(new CreateProductUseCase(new InMemoryRepo()).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 5, maxQuantity: 5 }, admin))
      .rejects.toMatchObject({ code: 'MAX_QUANTITY_INVALID', params: { min: 5 } });
  });
});

describe('audit trail', () => {
  const operator: Actor = { id: 'u2', email: 'op@example.com', role: 'OPERATOR' };
  let repo: InMemoryRepo;

  beforeEach(() => {
    repo = new InMemoryRepo();
  });

  it('records each product write once with its actor and details', async () => {
    const p = await new CreateProductUseCase(repo).execute({ sku: 'kb-001', name: 'Keyboard', minQuantity: 2 }, admin);
    expect(repo.audit).toEqual([{
      action: 'PRODUCT_CREATED', productId: p.id, actor: admin,
      details: { sku: 'KB-001', name: 'Keyboard', minQuantity: 2, maxQuantity: null, quantity: 0 },
    }]);

    await new UpdateProductUseCase(repo).execute({ id: p.id, name: 'Wireless keyboard', minQuantity: 3, maxQuantity: 40 }, admin);
    expect(repo.audit[1]).toEqual({
      action: 'PRODUCT_UPDATED', productId: p.id, actor: admin,
      details: {
        before: { name: 'Keyboard', minQuantity: 2, maxQuantity: null },
        after: { name: 'Wireless keyboard', minQuantity: 3, maxQuantity: 40 },
      },
    });

    await new DeleteProductUseCase(repo).execute(p.id, admin);
    expect(repo.audit[2]).toEqual({ action: 'PRODUCT_DELETED', productId: p.id, actor: admin, details: { sku: 'KB-001', name: 'Wireless keyboard' } });
    expect(repo.audit).toHaveLength(3);
  });

  it('records stock in and out with the operator and the quantity after', async () => {
    const p = await new CreateProductUseCase(repo).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    const move = new RegisterMovementUseCase(repo);
    await move.execute({ productId: p.id, type: 'IN', quantity: 10 }, operator);
    await move.execute({ productId: p.id, type: 'OUT', quantity: 4, note: 'sold' }, operator);
    expect(repo.audit.slice(1)).toEqual([
      { action: 'STOCK_IN', productId: p.id, actor: operator, details: { quantity: 10, note: null, quantityAfter: 10 } },
      { action: 'STOCK_OUT', productId: p.id, actor: operator, details: { quantity: 4, note: 'sold', quantityAfter: 6 } },
    ]);
    expect(repo.movements.map((m) => m.actorEmail)).toEqual(['op@example.com', 'op@example.com']);
  });

  it('records nothing when a write is rejected', async () => {
    const p = await new CreateProductUseCase(repo).execute({ sku: 'KB-001', name: 'Keyboard', minQuantity: 0 }, admin);
    await expect(new RegisterMovementUseCase(repo).execute({ productId: p.id, type: 'OUT', quantity: 1 }, operator)).rejects.toMatchObject({ code: 'NOT_ENOUGH_STOCK' });
    await expect(new UpdateProductUseCase(repo).execute({ id: p.id, name: ' ', minQuantity: 0 }, admin)).rejects.toMatchObject({ code: 'PRODUCT_NAME_REQUIRED' });
    expect(repo.audit).toHaveLength(1);
  });

  it('lists entries newest first, up to the limit', async () => {
    const create = new CreateProductUseCase(repo);
    for (const sku of ['A-1', 'B-1', 'C-1']) await create.execute({ sku, name: sku, minQuantity: 0 }, admin);
    const list = await new ListAuditUseCase(repo).execute(2);
    expect(list.map((e) => e.details['sku'])).toEqual(['C-1', 'B-1']);
    expect(list[0]?.actorEmail).toBe('admin@example.com');
  });
});
