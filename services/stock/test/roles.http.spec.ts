import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, NestFactory } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AppErrorFilter, AuthGuard, invalidInput, type Role } from '@stock/shared';
import { ProductRepository } from '../src/application/product-repository';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListAuditUseCase,
  ListMovementsUseCase,
  ListProductsUseCase,
  ListRecentMovementsUseCase,
  MovementTotalsUseCase,
  RegisterMovementUseCase,
  UpdateProductUseCase,
} from '../src/application/product.use-cases';
import { Product } from '../src/domain/product';
import { AuditController } from '../src/http/audit.controller';
import { MovementController } from '../src/http/movement.controller';
import { ProductController } from '../src/http/product.controller';
import { InMemoryRepo } from './in-memory-product.repository';

const SECRET = 'test-secret';
const PRODUCT_ID = '6f1c0d2e-0000-4000-8000-000000000001';
const repo = new InMemoryRepo();

@Module({
  imports: [JwtModule.register({ secret: SECRET })],
  controllers: [ProductController, MovementController, AuditController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppErrorFilter },
    { provide: ProductRepository, useValue: repo },
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    DeleteProductUseCase,
    RegisterMovementUseCase,
    ListMovementsUseCase,
    ListRecentMovementsUseCase,
    MovementTotalsUseCase,
    ListAuditUseCase,
  ],
})
class TestModule {}

describe('role gate over HTTP', () => {
  let app: INestApplication;
  let url: string;
  const jwt = new JwtService({ secret: SECRET });

  const call = async (method: string, path: string, role: Role, body?: unknown): Promise<number> => {
    const token = await jwt.signAsync({ sub: `${role}-1`, role, email: `${role.toLowerCase()}@example.com` });
    const res = await fetch(`${url}${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return res.status;
  };

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { logger: false });
    // same global pipe as startService
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, exceptionFactory: invalidInput }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    repo.items = [];
    repo.movements = [];
    repo.audit = [];
    const p = Product.create({ id: PRODUCT_ID, sku: 'KB-001', name: 'Keyboard', minQuantity: 0 });
    p.move('IN', 10);
    repo.items.push(p);
  });

  const movement = { type: 'OUT', quantity: 1 };
  const since = 'since=2026-01-01T00:00:00Z';

  it('lets a viewer read products', async () => {
    expect(await call('GET', '/products', 'VIEWER')).toBe(200);
    expect(await call('GET', `/products/${PRODUCT_ID}`, 'VIEWER')).toBe(200);
  });

  it.each([
    ['POST', '/products', { sku: 'MS-001', name: 'Mouse', minQuantity: 0 }],
    ['PATCH', `/products/${PRODUCT_ID}`, { name: 'Keyboard 2' }],
    ['DELETE', `/products/${PRODUCT_ID}`, undefined],
    ['GET', `/products/${PRODUCT_ID}/movements`, undefined],
    ['POST', `/products/${PRODUCT_ID}/movements`, movement],
    ['GET', `/movements?${since}`, undefined],
    ['GET', '/movements/totals', undefined],
    ['GET', '/audit/stock', undefined],
  ])('refuses a viewer on %s %s', async (method, path, body) => {
    expect(await call(method, path, 'VIEWER', body)).toBe(403);
    expect(repo.items[0]?.quantity).toBe(10);
    expect(repo.audit).toHaveLength(0);
  });

  it('lets an operator move stock and read movements, but not change products or read the audit', async () => {
    expect(await call('POST', `/products/${PRODUCT_ID}/movements`, 'OPERATOR', movement)).toBe(201);
    expect(repo.items[0]?.quantity).toBe(9);
    expect(await call('GET', `/products/${PRODUCT_ID}/movements`, 'OPERATOR')).toBe(200);
    expect(await call('GET', `/movements?${since}`, 'OPERATOR')).toBe(200);
    expect(await call('POST', '/products', 'OPERATOR', { sku: 'MS-001', name: 'Mouse', minQuantity: 0 })).toBe(403);
    expect(await call('GET', '/audit/stock', 'OPERATOR')).toBe(403);
  });

  it('lets an admin read the audit', async () => {
    expect(await call('GET', '/audit/stock', 'ADMIN')).toBe(200);
  });
});
