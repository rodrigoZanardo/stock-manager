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
import { InventoryCountRepository } from '../src/application/inventory-count-repository';
import {
  ApplyInventoryCountUseCase,
  CancelInventoryCountUseCase,
  EnterCountedUseCase,
  GetInventoryCountUseCase,
  ListInventoryCountsUseCase,
  StartInventoryCountUseCase,
} from '../src/application/inventory-count.use-cases';
import { PurchasingRepository } from '../src/application/purchasing-repository';
import {
  ChangePurchaseOrderStatusUseCase,
  CreatePurchaseOrderUseCase,
  CreateSupplierUseCase,
  DeleteSupplierUseCase,
  GetPurchaseOrderUseCase,
  ListPurchaseOrdersUseCase,
  ListSuppliersUseCase,
  ReceivePurchaseOrderUseCase,
  SuggestPurchaseOrderUseCase,
  UpdatePurchaseOrderItemsUseCase,
  UpdateSupplierUseCase,
} from '../src/application/purchasing.use-cases';
import { InventoryCount } from '../src/domain/inventory-count';
import { Product } from '../src/domain/product';
import { Supplier } from '../src/domain/supplier';
import { AuditController } from '../src/http/audit.controller';
import { InventoryCountController } from '../src/http/inventory-count.controller';
import { MovementController } from '../src/http/movement.controller';
import { ProductController } from '../src/http/product.controller';
import { PurchaseOrderController } from '../src/http/purchase-order.controller';
import { SupplierController } from '../src/http/supplier.controller';
import { InMemoryInventoryCountRepo } from './in-memory-inventory-count.repository';
import { InMemoryRepo } from './in-memory-product.repository';
import { InMemoryPurchasingRepo } from './in-memory-purchasing.repository';

const SECRET = 'test-secret';
const PRODUCT_ID = '6f1c0d2e-0000-4000-8000-000000000001';
const SUPPLIER_ID = '6f1c0d2e-0000-4000-8000-000000000002';
const COUNT_ID = '6f1c0d2e-0000-4000-8000-000000000003';
const repo = new InMemoryRepo();
const purchasing = new InMemoryPurchasingRepo(repo);
const counts = new InMemoryInventoryCountRepo(repo);

@Module({
  imports: [JwtModule.register({ secret: SECRET })],
  controllers: [ProductController, MovementController, AuditController, SupplierController, PurchaseOrderController, InventoryCountController],
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
    { provide: PurchasingRepository, useValue: purchasing },
    CreateSupplierUseCase,
    ListSuppliersUseCase,
    UpdateSupplierUseCase,
    DeleteSupplierUseCase,
    CreatePurchaseOrderUseCase,
    SuggestPurchaseOrderUseCase,
    ListPurchaseOrdersUseCase,
    GetPurchaseOrderUseCase,
    UpdatePurchaseOrderItemsUseCase,
    ChangePurchaseOrderStatusUseCase,
    ReceivePurchaseOrderUseCase,
    { provide: InventoryCountRepository, useValue: counts },
    StartInventoryCountUseCase,
    ListInventoryCountsUseCase,
    GetInventoryCountUseCase,
    EnterCountedUseCase,
    ApplyInventoryCountUseCase,
    CancelInventoryCountUseCase,
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
    purchasing.suppliers = [Supplier.create({ id: SUPPLIER_ID, name: 'Auto Sul' })];
    purchasing.orders = [];
    counts.counts = [InventoryCount.start({ id: COUNT_ID, products: [p] })];
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
    ['POST', '/suppliers', { name: 'Distribuidora Norte' }],
    ['POST', '/purchase-orders', { supplierId: SUPPLIER_ID, items: [{ productId: PRODUCT_ID, quantity: 1, unitCost: 100 }] }],
    ['POST', '/inventory-counts', undefined],
    ['PATCH', `/inventory-counts/${COUNT_ID}`, { items: [{ productId: PRODUCT_ID, counted: 3 }] }],
    ['POST', `/inventory-counts/${COUNT_ID}/apply`, undefined],
    ['POST', `/inventory-counts/${COUNT_ID}/cancel`, undefined],
  ])('refuses a viewer on %s %s', async (method, path, body) => {
    expect(await call(method, path, 'VIEWER', body)).toBe(403);
    expect(repo.items[0]?.quantity).toBe(10);
    expect(repo.audit).toHaveLength(0);
    expect(purchasing.suppliers).toHaveLength(1);
    expect(purchasing.orders).toHaveLength(0);
    expect(counts.counts.map((c) => [c.status, c.items[0]?.counted])).toEqual([['OPEN', null]]);
  });

  it('lets a viewer read suppliers, purchase orders and inventory counts', async () => {
    expect(await call('GET', '/suppliers', 'VIEWER')).toBe(200);
    expect(await call('GET', '/purchase-orders', 'VIEWER')).toBe(200);
    expect(await call('GET', '/inventory-counts', 'VIEWER')).toBe(200);
    expect(await call('GET', `/inventory-counts/${COUNT_ID}`, 'VIEWER')).toBe(200);
  });

  it('lets an operator count and apply', async () => {
    expect(await call('PATCH', `/inventory-counts/${COUNT_ID}`, 'OPERATOR', { items: [{ productId: PRODUCT_ID, counted: 3 }] })).toBe(200);
    expect(await call('POST', `/inventory-counts/${COUNT_ID}/apply`, 'OPERATOR')).toBe(200);
    expect(repo.items[0]?.quantity).toBe(3);
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
