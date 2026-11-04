import { randomUUID } from 'crypto';
import { ApplyDeliveredOrderUseCase } from '../src/application/webhook.use-cases';
import { PrismaProductRepository } from '../src/infra/prisma-product.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL).
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('Live Orders delivery on a real database', () => {
  let db: PrismaService;
  let useCase: ApplyDeliveredOrderUseCase;
  const delivered = (eventSeq: number, items: { sku: string; quantity: number }[]) =>
    ({ type: 'ORDER_STATUS_CHANGED', toStatus: 'DELIVERED', eventSeq, orderNumber: 7, items });
  const stock = async (sku: string) => (await db.product.findUnique({ where: { sku } }))?.quantity;

  beforeAll(async () => {
    db = new PrismaService();
    useCase = new ApplyDeliveredOrderUseCase(new PrismaProductRepository(db));
    await db.$connect();
  });

  beforeEach(async () => {
    await db.processedWebhook.deleteMany();
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
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 4 }, { sku: 'MS-001', quantity: 1 }]))).toBe('processed');
    expect([await stock('KB-001'), await stock('MS-001')]).toEqual([6, 2]);
    const rows = await db.movement.findMany();
    expect(rows).toHaveLength(2);
    expect(rows.every((m) => m.note === 'Order #7 (Live Orders)' && m.actorEmail === 'live-orders@integration')).toBe(true);
  });

  it('two parallel requests with the same event change the stock once', async () => {
    const event = delivered(5, [{ sku: 'KB-001', quantity: 4 }]);
    const results = await Promise.all([useCase.execute(event), useCase.execute(event)]);
    expect(results.sort()).toEqual(['duplicate', 'processed']);
    expect(await stock('KB-001')).toBe(6);
    expect(await db.movement.count()).toBe(1);
  });

  it('writes nothing when the second item lacks stock, and the event can be retried later', async () => {
    await expect(useCase.execute(delivered(6, [{ sku: 'KB-001', quantity: 1 }, { sku: 'MS-001', quantity: 4 }])))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_STOCK' });
    expect(await stock('KB-001')).toBe(10);
    expect(await db.movement.count()).toBe(0);
    expect(await db.processedWebhook.count()).toBe(0);
  });

  it('refuses an unknown SKU and writes nothing', async () => {
    await expect(useCase.execute(delivered(8, [{ sku: 'KB-001', quantity: 1 }, { sku: 'NOPE-1', quantity: 1 }])))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    expect(await stock('KB-001')).toBe(10);
    expect(await db.processedWebhook.count()).toBe(0);
  });
});
