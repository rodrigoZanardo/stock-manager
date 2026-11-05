import { randomUUID } from 'crypto';
import type { Actor } from '@stock/shared';
import {
  ChangePurchaseOrderStatusUseCase,
  CreatePurchaseOrderUseCase,
  CreateSupplierUseCase,
  ReceivePurchaseOrderUseCase,
} from '../src/application/purchasing.use-cases';
import { PrismaProductRepository } from '../src/infra/prisma-product.repository';
import { PrismaPurchasingRepository } from '../src/infra/prisma-purchasing.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL).
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('purchase order receive on a real database', () => {
  const operator: Actor = { id: 'op-1', email: 'op@example.com', role: 'OPERATOR' };
  let db: PrismaService;
  let products: PrismaProductRepository;
  let repo: PrismaPurchasingRepository;

  beforeAll(async () => {
    db = new PrismaService();
    products = new PrismaProductRepository(db);
    repo = new PrismaPurchasingRepository(db);
    await db.$connect();
  });

  beforeEach(async () => {
    await db.purchaseOrderItem.deleteMany();
    await db.purchaseOrder.deleteMany();
    await db.supplier.deleteMany();
    await db.reservation.deleteMany();
    await db.movement.deleteMany();
    await db.auditEntry.deleteMany();
    await db.product.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('books stock and cost once; a stale second receive is refused by the stored status', async () => {
    const id = randomUUID();
    await db.product.create({ data: { id, sku: 'FO-1001', name: 'Filtro de óleo', quantity: 2, cost: 1000 } });
    const supplier = await new CreateSupplierUseCase(repo).execute({ name: 'Auto Sul' }, operator);
    const order = await new CreatePurchaseOrderUseCase(repo, products).execute({ supplierId: supplier.id, items: [{ productId: id, quantity: 10, unitCost: 1250 }] }, operator);
    await new ChangePurchaseOrderStatusUseCase(repo).execute({ id: order.id, change: 'send' }, operator);

    // both copies read ORDERED, as two clicks at the same moment would
    const receive = new ReceivePurchaseOrderUseCase(repo, products);
    const stale = await repo.findOrder(order.id);
    await receive.execute(order.id, operator);
    if (!stale) throw new Error('order was not saved');
    stale.receive();
    await expect(repo.receiveOrder(stale, [], { action: 'PURCHASE_RECEIVED', productId: null, details: {}, actor: operator }))
      .rejects.toMatchObject({ code: 'PURCHASE_ORDER_STATUS' });

    const stored = await db.product.findUnique({ where: { id } });
    expect([stored?.quantity, stored?.cost]).toEqual([12, 1250]);
    expect(await db.movement.findMany({ where: { productId: id }, select: { type: true, quantity: true, note: true } }))
      .toEqual([{ type: 'IN', quantity: 10, note: `Pedido de compra #${order.number}` }]);
    expect((await db.purchaseOrder.findUnique({ where: { id: order.id } }))?.status).toBe('RECEIVED');
  });
});
