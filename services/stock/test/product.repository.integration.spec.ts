import { randomUUID } from 'crypto';
import type { Actor } from '@stock/shared';
import { PrismaProductRepository } from '../src/infra/prisma-product.repository';
import { PrismaService } from '../src/infra/prisma.service';
import { Product } from '../src/domain/product';

// Runs only with a real database (CI sets DATABASE_URL); the unit tests cover the rules without one.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('PrismaProductRepository on a real database', () => {
  const admin: Actor = { id: 'admin-1', email: 'admin@example.com', role: 'ADMIN' };
  const audit = (productId: string, action: 'STOCK_IN' | 'STOCK_OUT') => ({ action, productId, details: {}, actor: admin });
  let db: PrismaService;
  let repo: PrismaProductRepository;

  beforeAll(async () => {
    db = new PrismaService();
    repo = new PrismaProductRepository(db);
    await db.$connect();
  });

  beforeEach(async () => {
    await db.reservation.deleteMany();
    await db.movement.deleteMany();
    await db.auditEntry.deleteMany();
    await db.product.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  it('refuses a withdrawal from a stale copy: the database guard, not the in-memory check, stops it', async () => {
    const product = Product.create({ id: randomUUID(), sku: 'RACE-01', name: 'Race', minQuantity: 0 });
    await repo.create(product, audit(product.id, 'STOCK_IN'));
    await repo.saveMovement(product, { type: 'IN', quantity: 10 }, audit(product.id, 'STOCK_IN'));

    // two copies that both still see 10 units, as two requests reading at the same moment would
    const first = await repo.findById(product.id);
    const second = await repo.findById(product.id);
    if (!first || !second) throw new Error('product was not saved');
    await repo.saveMovement(first, { type: 'OUT', quantity: 6 }, audit(product.id, 'STOCK_OUT'));

    await expect(repo.saveMovement(second, { type: 'OUT', quantity: 6 }, audit(product.id, 'STOCK_OUT')))
      .rejects.toMatchObject({ code: 'STOCK_CHANGED' });
    expect((await repo.findById(product.id))?.quantity).toBe(4);
    expect(await db.movement.count({ where: { productId: product.id, type: 'OUT' } })).toBe(1);
  });
});
