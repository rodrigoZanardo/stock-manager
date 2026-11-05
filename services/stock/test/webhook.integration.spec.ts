import { randomUUID } from 'crypto';
import { ApplyOrderEventUseCase, LIVE_ORDERS_ACTOR } from '../src/application/webhook.use-cases';
import { Product } from '../src/domain/product';
import { PrismaProductRepository } from '../src/infra/prisma-product.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL).
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Live Orders delivery on a real database', () => {
  let db: PrismaService;
  let useCase: ApplyOrderEventUseCase;
  const delivered = (eventSeq: number, items: { sku: string; quantity: number }[]) =>
    ({ type: 'ORDER_STATUS_CHANGED', toStatus: 'DELIVERED', eventSeq, orderId: 'order-1', orderNumber: 7, items });
  const stock = async (sku: string) => (await db.product.findUnique({ where: { sku } }))?.quantity;
  const reserved = async (sku: string) => (await db.product.findUnique({ where: { sku } }))?.reserved;
  const created = (eventSeq: number, items: { sku: string; quantity: number }[]) =>
    ({ type: 'ORDER_CREATED', eventSeq, orderId: 'order-1', orderNumber: 7, items });
  const cancelled = (eventSeq: number) => ({ type: 'ORDER_STATUS_CHANGED', toStatus: 'CANCELLED', eventSeq, orderId: 'order-1', orderNumber: 7, items: [] });

  beforeAll(async () => {
    db = new PrismaService();
    useCase = new ApplyOrderEventUseCase(new PrismaProductRepository(db));
    await db.$connect();
  });

  beforeEach(async () => {
    await db.processedWebhook.deleteMany();
    await db.reservation.deleteMany();
    await db.movement.deleteMany();
    await db.auditEntry.deleteMany();
    await db.product.deleteMany();
    await db.product.createMany({
      data: [
        { id: randomUUID(), sku: 'KB-001', name: 'Keyboard', quantity: 10 },
        { id: randomUUID(), sku: 'MS-001', name: 'Mouse', quantity: 3 },
      ],
    });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('lowers every item once, with note and actor', async () => {
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 4 }, { sku: 'MS-001', quantity: 1 }]))).toEqual({ processed: true });
    expect([await stock('KB-001'), await stock('MS-001')]).toEqual([6, 2]);
    const rows = await db.movement.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.note === 'Order #7 (Live Orders)' && m.actorEmail === 'live-orders@integration')).toBe(true);
  });

  it('two parallel requests with the same event change the stock once', async () => {
    const event = delivered(5, [{ sku: 'KB-001', quantity: 4 }]);
    const results = await Promise.all([useCase.execute(event), useCase.execute(event)]);
    expect(results.map((r) => (typeof r === 'string' ? r : 'processed')).sort()).toEqual(['duplicate', 'processed']);
    expect(await stock('KB-001')).toBe(6);
    expect(await db.movement.count()).toBe(1);
  });

  it('takes out only what is left when an item is short, and skips an unknown SKU', async () => {
    expect(await useCase.execute(delivered(6, [{ sku: 'KB-001', quantity: 1 }, { sku: 'MS-001', quantity: 4 }, { sku: 'NOPE-1', quantity: 1 }])))
      .toEqual({ processed: true, shortfalls: [{ sku: 'MS-001', requested: 4, applied: 3 }, { sku: 'NOPE-1', requested: 1, applied: 0 }] });
    expect(await stock('KB-001')).toBe(9);
    expect(await stock('MS-001')).toBe(0);
    expect(await db.movement.count()).toBe(2);
    expect(await db.processedWebhook.count({ where: { eventSeq: '6' } })).toBe(1);
  });

  it('create then cancel holds the stock and gives it back', async () => {
    expect(await useCase.execute(created(10, [{ sku: 'KB-001', quantity: 4 }, { sku: 'MS-001', quantity: 5 }])))
      .toEqual({ processed: true, shortfalls: [{ sku: 'MS-001', requested: 5, applied: 3 }] });
    expect([await stock('KB-001'), await reserved('KB-001'), await reserved('MS-001')]).toEqual([10, 4, 3]);
    expect(await db.reservation.count()).toBe(2);
    expect(await useCase.execute(cancelled(11))).toEqual({ processed: true });
    expect([await stock('KB-001'), await reserved('KB-001'), await reserved('MS-001'), await db.reservation.count()]).toEqual([10, 0, 0, 0]);
    expect((await db.auditEntry.findMany()).map((a) => a.action).sort()).toEqual(['STOCK_RELEASED', 'STOCK_RELEASED', 'STOCK_RESERVED', 'STOCK_RESERVED']);
  });

  it('create then deliver releases the reservation and lowers the stock', async () => {
    await useCase.execute(created(10, [{ sku: 'KB-001', quantity: 4 }]));
    expect(await useCase.execute(delivered(11, [{ sku: 'KB-001', quantity: 4 }]))).toEqual({ processed: true });
    expect([await stock('KB-001'), await reserved('KB-001'), await db.reservation.count()]).toEqual([6, 0, 0]);
  });

  it('a delivery that arrives before its ORDER_CREATED leaves nothing reserved', async () => {
    await useCase.execute(delivered(11, [{ sku: 'KB-001', quantity: 4 }]));
    expect(await useCase.execute(created(10, [{ sku: 'KB-001', quantity: 4 }]))).toBe('ignored');
    expect([await stock('KB-001'), await reserved('KB-001'), await db.reservation.count()]).toEqual([6, 0, 0]);
  });

  it('a manual OUT cannot take reserved units', async () => {
    await useCase.execute(created(10, [{ sku: 'MS-001', quantity: 2 }]));
    const repo = new PrismaProductRepository(db);
    const product = await repo.findBySku('MS-001');
    if (!product) throw new Error('seeded product missing');
    expect(product.available).toBe(1);
    // the in-memory check passes on a stale copy; the database guard still refuses
    const stale = Product.restore({ id: product.id, sku: product.sku, name: product.name, quantity: 3, reserved: 0, minQuantity: 0, maxQuantity: null, location: null });
    stale.move('OUT', 2);
    await expect(repo.saveMovement(stale, { type: 'OUT', quantity: 2 }, { action: 'STOCK_OUT', productId: product.id, details: {}, actor: LIVE_ORDERS_ACTOR }))
      .rejects.toMatchObject({ code: 'STOCK_CHANGED' });
    expect(await stock('MS-001')).toBe(3);
  });
});
