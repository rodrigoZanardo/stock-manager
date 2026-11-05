import type { Actor } from '@stock/shared';
import { CreateProductUseCase, RegisterMovementUseCase } from '../src/application/product.use-cases';
import {
  ChangePurchaseOrderStatusUseCase,
  CreatePurchaseOrderUseCase,
  CreateSupplierUseCase,
  DeleteSupplierUseCase,
  ReceivePurchaseOrderUseCase,
  SuggestPurchaseOrderUseCase,
  UpdatePurchaseOrderItemsUseCase,
  UpdateSupplierUseCase,
} from '../src/application/purchasing.use-cases';
import { PurchaseOrder } from '../src/domain/purchase-order';
import { isCnpj, Supplier } from '../src/domain/supplier';
import { InMemoryRepo } from './in-memory-product.repository';
import { InMemoryPurchasingRepo } from './in-memory-purchasing.repository';

const operator: Actor = { id: 'u2', email: 'op@example.com', role: 'OPERATOR' };
const item = { productId: 'p1', sku: 'A-1', name: 'A', quantity: 2, unitCost: 500 };
const draft = () => PurchaseOrder.create({ id: 'o1', supplierId: 's1', supplierName: 'Sul', items: [item] });

describe('CNPJ', () => {
  it.each(['11222333000181', '11444777000161'])('accepts %p', (cnpj) => expect(isCnpj(cnpj)).toBe(true));
  it.each(['11222333000182', '1122233300018', '00000000000000', '1122233300018a'])('rejects %p', (cnpj) => expect(isCnpj(cnpj)).toBe(false));

  it('stores digits only, treats empty as none and refuses a wrong one', () => {
    expect(Supplier.create({ id: '1', name: ' Sul ', document: '11.222.333/0001-81' })).toMatchObject({ name: 'Sul', document: '11222333000181' });
    expect(Supplier.create({ id: '1', name: 'Sul', document: ' ', email: '', phone: '' })).toMatchObject({ document: null, email: null, phone: null });
    expect(() => Supplier.create({ id: '1', name: 'Sul', document: '11.222.333/0001-82' })).toThrow(expect.objectContaining({ code: 'SUPPLIER_DOCUMENT_INVALID' }));
    expect(() => Supplier.create({ id: '1', name: 'Sul', email: 'nope' })).toThrow(expect.objectContaining({ code: 'EMAIL_INVALID' }));
    expect(() => Supplier.create({ id: '1', name: '  ' })).toThrow(expect.objectContaining({ code: 'SUPPLIER_NAME_REQUIRED' }));
  });
});

describe('purchase order transitions', () => {
  it('goes DRAFT -> ORDERED -> RECEIVED and refuses a second receive', () => {
    const o = draft();
    o.send();
    o.receive();
    expect(o.status).toBe('RECEIVED');
    expect(() => o.receive()).toThrow(expect.objectContaining({ code: 'PURCHASE_ORDER_STATUS', params: { status: 'RECEIVED' } }));
    expect(() => o.cancel()).toThrow(expect.objectContaining({ code: 'PURCHASE_ORDER_STATUS' }));
  });

  it('cancels from DRAFT or ORDERED only, and refuses to receive a draft', () => {
    const fromDraft = draft();
    expect(() => fromDraft.receive()).toThrow(expect.objectContaining({ code: 'PURCHASE_ORDER_STATUS' }));
    fromDraft.cancel();
    expect(fromDraft.status).toBe('CANCELLED');
    expect(() => fromDraft.send()).toThrow(expect.objectContaining({ code: 'PURCHASE_ORDER_STATUS' }));
    const ordered = draft();
    ordered.send();
    ordered.cancel();
    expect(ordered.status).toBe('CANCELLED');
  });

  it('edits items only in DRAFT and sums the total in cents', () => {
    const o = draft();
    o.replaceItems([{ ...item, quantity: 3, unitCost: 1999 }, { ...item, productId: 'p2', quantity: 1, unitCost: 0 }]);
    expect(o.total).toBe(5997);
    o.send();
    expect(() => o.replaceItems([item])).toThrow(expect.objectContaining({ code: 'PURCHASE_ORDER_STATUS' }));
  });

  it.each([
    [[], 'PURCHASE_ORDER_EMPTY'],
    [[item, item], 'PURCHASE_ORDER_DUPLICATE_ITEM'],
    [[{ ...item, quantity: 0 }], 'QUANTITY_INVALID'],
    [[{ ...item, unitCost: -1 }], 'COST_INVALID'],
    [[{ ...item, unitCost: 10_000_001 }], 'COST_INVALID'],
  ])('rejects items %j with %s', (items, code) => {
    expect(() => PurchaseOrder.create({ id: 'o1', supplierId: 's1', supplierName: 'Sul', items })).toThrow(expect.objectContaining({ code }));
  });
});

describe('purchasing use cases', () => {
  let products: InMemoryRepo;
  let repo: InMemoryPurchasingRepo;
  let supplierId: string;

  const product = (sku: string, minQuantity: number, extra: { maxQuantity?: number; cost?: number } = {}) =>
    new CreateProductUseCase(products).execute({ sku, name: sku, minQuantity, ...extra }, operator);

  beforeEach(async () => {
    products = new InMemoryRepo();
    repo = new InMemoryPurchasingRepo(products);
    supplierId = (await new CreateSupplierUseCase(repo).execute({ name: 'Auto Sul' }, operator)).id;
  });

  it('refuses a repeated supplier name on create and rename, and keeps a supplier with orders', async () => {
    await expect(new CreateSupplierUseCase(repo).execute({ name: ' Auto Sul ' }, operator)).rejects.toMatchObject({ code: 'SUPPLIER_NAME_TAKEN' });
    const other = await new CreateSupplierUseCase(repo).execute({ name: 'Norte' }, operator);
    await expect(new UpdateSupplierUseCase(repo).execute({ id: other.id, name: 'Auto Sul' }, operator)).rejects.toMatchObject({ code: 'SUPPLIER_NAME_TAKEN' });
    await new UpdateSupplierUseCase(repo).execute({ id: other.id, name: 'Norte', phone: '51 3333' }, operator);
    expect(other.phone).toBe('51 3333');

    const p = await product('A-1', 0);
    await new CreatePurchaseOrderUseCase(repo, products).execute({ supplierId, items: [{ productId: p.id, quantity: 1, unitCost: 0 }] }, operator);
    await expect(new DeleteSupplierUseCase(repo).execute(supplierId, operator)).rejects.toMatchObject({ code: 'SUPPLIER_HAS_ORDERS' });
    await new DeleteSupplierUseCase(repo).execute(other.id, operator);
    expect(repo.suppliers.map((s) => s.name)).toEqual(['Auto Sul']);
  });

  it('refuses unknown suppliers and products', async () => {
    const p = await product('A-1', 0);
    const create = new CreatePurchaseOrderUseCase(repo, products);
    await expect(create.execute({ supplierId: 'nope', items: [{ productId: p.id, quantity: 1, unitCost: 0 }] }, operator)).rejects.toMatchObject({ code: 'SUPPLIER_NOT_FOUND' });
    await expect(create.execute({ supplierId, items: [{ productId: 'nope', quantity: 1, unitCost: 0 }] }, operator)).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('numbers orders in sequence and audits each step', async () => {
    const p = await product('A-1', 0);
    const create = new CreatePurchaseOrderUseCase(repo, products);
    const first = await create.execute({ supplierId, items: [{ productId: p.id, quantity: 1, unitCost: 100 }] }, operator);
    const second = await create.execute({ supplierId, items: [{ productId: p.id, quantity: 2, unitCost: 100 }] }, operator);
    expect([first.number, second.number]).toEqual([1, 2]);
    await new UpdatePurchaseOrderItemsUseCase(repo, products).execute({ id: first.id, items: [{ productId: p.id, quantity: 5, unitCost: 90 }] }, operator);
    await new ChangePurchaseOrderStatusUseCase(repo).execute({ id: first.id, change: 'send' }, operator);
    await new ChangePurchaseOrderStatusUseCase(repo).execute({ id: second.id, change: 'cancel' }, operator);
    expect(repo.audit.map((a) => a.action).filter((a) => a.startsWith('PURCHASE'))).toEqual(
      ['PURCHASE_CREATED', 'PURCHASE_CREATED', 'PURCHASE_UPDATED', 'PURCHASE_ORDERED', 'PURCHASE_CANCELLED']);
    expect(repo.audit.find((a) => a.action === 'PURCHASE_CREATED')?.details).toMatchObject({ number: 1, supplier: 'Auto Sul', total: 100 });
    await expect(new UpdatePurchaseOrderItemsUseCase(repo, products).execute({ id: first.id, items: [{ productId: p.id, quantity: 1, unitCost: 1 }] }, operator))
      .rejects.toMatchObject({ code: 'PURCHASE_ORDER_STATUS' });
  });

  it('receives once: books IN movements, sets cost, and refuses the second time', async () => {
    const a = await product('A-1', 0, { cost: 100 });
    const b = await product('B-1', 0);
    const order = await new CreatePurchaseOrderUseCase(repo, products)
      .execute({ supplierId, items: [{ productId: a.id, quantity: 4, unitCost: 250 }, { productId: b.id, quantity: 1, unitCost: 0 }] }, operator);
    const receive = new ReceivePurchaseOrderUseCase(repo, products);
    await expect(receive.execute(order.id, operator)).rejects.toMatchObject({ code: 'PURCHASE_ORDER_STATUS' });
    await new ChangePurchaseOrderStatusUseCase(repo).execute({ id: order.id, change: 'send' }, operator);

    expect((await receive.execute(order.id, operator)).status).toBe('RECEIVED');
    expect([a.quantity, a.cost, b.quantity, b.cost]).toEqual([4, 250, 1, 0]);
    expect(products.movements.map((m) => [m.productId, m.type, m.quantity, m.note])).toEqual([
      [a.id, 'IN', 4, 'Pedido de compra #1'],
      [b.id, 'IN', 1, 'Pedido de compra #1'],
    ]);
    await expect(receive.execute(order.id, operator)).rejects.toMatchObject({ code: 'PURCHASE_ORDER_STATUS', params: { status: 'RECEIVED' } });
    expect(products.movements).toHaveLength(2);
  });

  it('suggests every product whose available units are below the minimum, up to the maximum or twice the minimum', async () => {
    const withMax = await product('A-1', 5, { maxQuantity: 20, cost: 300 });
    const noMax = await product('B-1', 4);
    const enough = await product('C-1', 2);
    const move = new RegisterMovementUseCase(products);
    await move.execute({ productId: withMax.id, type: 'IN', quantity: 3 }, operator);
    await move.execute({ productId: noMax.id, type: 'IN', quantity: 1 }, operator);
    await move.execute({ productId: enough.id, type: 'IN', quantity: 2 }, operator); // available == minimum: not below
    const order = await new SuggestPurchaseOrderUseCase(repo, products).execute(supplierId, operator);
    expect(order.status).toBe('DRAFT');
    expect(order.items.map((i) => [i.sku, i.quantity, i.unitCost])).toEqual([['A-1', 17, 300], ['B-1', 7, 0]]);
  });

  it('refuses a suggestion when nothing is below its minimum', async () => {
    await product('A-1', 0);
    await expect(new SuggestPurchaseOrderUseCase(repo, products).execute(supplierId, operator)).rejects.toMatchObject({ code: 'PURCHASE_NOTHING_TO_SUGGEST' });
  });
});
