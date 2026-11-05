import { randomUUID } from 'crypto';
import type { Actor } from '@stock/shared';
import { ApplyInventoryCountUseCase, EnterCountedUseCase, StartInventoryCountUseCase } from '../src/application/inventory-count.use-cases';
import { PrismaInventoryCountRepository } from '../src/infra/prisma-inventory-count.repository';
import { PrismaProductRepository } from '../src/infra/prisma-product.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL).
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('inventory count apply on a real database', () => {
  const operator: Actor = { id: 'op-1', email: 'op@example.com', role: 'OPERATOR' };
  let db: PrismaService;
  let products: PrismaProductRepository;
  let repo: PrismaInventoryCountRepository;

  beforeAll(async () => {
    db = new PrismaService();
    products = new PrismaProductRepository(db);
    repo = new PrismaInventoryCountRepository(db);
    await db.$connect();
  });

  beforeEach(async () => {
    await db.inventoryCount.deleteMany();
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

  it('sets the counted quantities with movements and audit, once; a stale second apply is refused by the stored status', async () => {
    const a = randomUUID();
    const b = randomUUID();
    await db.product.createMany({ data: [{ id: a, sku: 'FO-1', name: 'Filtro', quantity: 10 }, { id: b, sku: 'VE-1', name: 'Vela', quantity: 4, reserved: 1 }] });
    const count = await new StartInventoryCountUseCase(repo, products).execute(operator);
    await new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: a, counted: 7 }, { productId: b, counted: 6 }] }, operator);

    // both read OPEN, as two clicks at the same moment would
    const apply = new ApplyInventoryCountUseCase(repo, products);
    const results = await Promise.allSettled([apply.execute(count.id, operator), apply.execute(count.id, operator)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);

    expect((await db.product.findMany({ orderBy: { sku: 'asc' } })).map((p) => [p.sku, p.quantity])).toEqual([['FO-1', 7], ['VE-1', 6]]);
    const movements = await db.movement.findMany({ orderBy: { quantity: 'asc' } });
    expect(movements.map((m) => [m.type, m.quantity, m.note])).toEqual([['IN', 2, `Inventário #${count.number}`], ['OUT', 3, `Inventário #${count.number}`]]);
    expect(await db.auditEntry.count({ where: { action: 'INVENTORY_APPLIED' } })).toBe(1);
    expect((await repo.findCount(count.id))?.status).toBe('APPLIED');
  });

  it('refuses with STOCK_CHANGED when stock moved after the product was read, and writes nothing', async () => {
    const a = randomUUID();
    await db.product.create({ data: { id: a, sku: 'FO-2', name: 'Filtro', quantity: 10 } });
    const count = await new StartInventoryCountUseCase(repo, products).execute(operator);
    await new EnterCountedUseCase(repo, products).execute({ id: count.id, items: [{ productId: a, counted: 8 }] }, operator);
    const stale = await repo.findCount(count.id);
    const product = await products.findById(a);
    if (!stale || !product) throw new Error('setup failed');
    const before = product.quantity;
    const movement = product.adjustTo(8);
    if (!movement) throw new Error('setup failed');
    await db.product.update({ where: { id: a }, data: { quantity: 11 } });
    stale.apply();

    const audit = { action: 'STOCK_OUT' as const, productId: a, details: {}, actor: operator };
    await expect(repo.applyCount(stale, [{ product, before, movement, note: 'x', audit }], { ...audit, action: 'INVENTORY_APPLIED' }))
      .rejects.toMatchObject({ code: 'STOCK_CHANGED' });
    expect((await db.product.findUniqueOrThrow({ where: { id: a } })).quantity).toBe(11);
    expect((await repo.findCount(count.id))?.status).toBe('OPEN');
  });
});
