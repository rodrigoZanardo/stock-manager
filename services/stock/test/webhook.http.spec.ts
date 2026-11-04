import { Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { AppErrorFilter, invalidInput } from '@stock/shared';
import { ProductRepository } from '../src/application/product-repository';
import { ApplyDeliveredOrderUseCase } from '../src/application/webhook.use-cases';
import { Product } from '../src/domain/product';
import { signWebhook } from '../src/domain/webhook-signature';
import { WebhookController } from '../src/http/webhook.controller';
import { WebhookSignatureGuard } from '../src/http/webhook-signature.guard';
import { InMemoryRepo } from './in-memory-product.repository';

const SECRET = 'test-secret';
const repo = new InMemoryRepo();

@Module({
  controllers: [WebhookController],
  providers: [
    WebhookSignatureGuard,
    ApplyDeliveredOrderUseCase,
    { provide: ProductRepository, useValue: repo },
    { provide: APP_FILTER, useClass: AppErrorFilter },
  ],
})
class TestModule {}

// the event shape of docs/WEBHOOKS.md in the Live Orders repository, with fields the stock service does not use
const event = (type: string, toStatus: string | undefined, seq = 42) => ({
  seq, type, orderId: '4f1c', fromStatus: 'READY', toStatus, version: 4, actorEmail: 'staff@example.com', createdAt: '2026-11-03T12:00:00.000Z',
  order: { id: '4f1c', number: 7, customerName: 'Ana', status: toStatus ?? 'NEW', items: [{ sku: 'KB-001', name: 'Keyboard', quantity: 3 }] },
});

describe('POST /webhooks/live-orders over HTTP', () => {
  let app: INestApplication;
  let url: string;

  const post = async (body: unknown, opts: { secret?: string; ts?: number; headers?: Record<string, string> } = {}) => {
    const raw = JSON.stringify(body);
    const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
    const res = await fetch(`${url}/webhooks/live-orders`, {
      method: 'POST',
      body: raw,
      headers: { 'content-type': 'application/json', 'x-timestamp': ts, 'x-signature': signWebhook(opts.secret ?? SECRET, ts, raw), ...opts.headers },
    });
    return { status: res.status, body: (await res.json()) as { code?: string } };
  };

  beforeAll(async () => {
    app = await NestFactory.create(TestModule, { rawBody: true, logger: false });
    // same global pipe as startService
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, exceptionFactory: invalidInput }));
    await app.listen(0, '127.0.0.1');
    url = await app.getUrl();
  });

  afterAll(() => app.close());

  beforeEach(() => {
    process.env.LIVE_ORDERS_WEBHOOK_SECRET = SECRET;
    repo.items = [];
    repo.movements = [];
    repo.processed.clear();
    const p = Product.create({ id: 'p1', sku: 'KB-001', name: 'Keyboard', minQuantity: 0 });
    p.move('IN', 10);
    repo.items.push(p);
  });

  it('lowers stock for a signed DELIVERED event once, and a changed X-Event-Seq cannot replay it', async () => {
    const body = event('ORDER_STATUS_CHANGED', 'DELIVERED');
    expect(await post(body, { headers: { 'x-event-seq': '42' } })).toEqual({ status: 200, body: { processed: true } });
    expect(repo.items[0]?.quantity).toBe(7);
    expect(await post(body)).toEqual({ status: 200, body: { duplicate: true } });
    const replay = await post(body, { headers: { 'x-event-seq': '43' } });
    expect([replay.status, replay.body.code]).toEqual([400, 'INVALID_INPUT']);
    expect(repo.items[0]?.quantity).toBe(7);
  });

  it('answers 200 with the shortfall when stock is short', async () => {
    repo.items[0]?.move('OUT', 9);
    expect(await post(event('ORDER_STATUS_CHANGED', 'DELIVERED'))).toEqual({ status: 200, body: { processed: true, shortfalls: [{ sku: 'KB-001', requested: 3, applied: 1 }] } });
    expect(repo.items[0]?.quantity).toBe(0);
  });

  it('refuses a wrong signature', async () => {
    const res = await post(event('ORDER_STATUS_CHANGED', 'DELIVERED'), { secret: 'other' });
    expect([res.status, res.body.code]).toEqual([401, 'WEBHOOK_SIGNATURE_INVALID']);
    expect(repo.movements).toHaveLength(0);
  });

  it('refuses an old timestamp', async () => {
    const res = await post(event('ORDER_STATUS_CHANGED', 'DELIVERED'), { ts: Math.floor(Date.now() / 1000) - 600 });
    expect([res.status, res.body.code]).toEqual([401, 'WEBHOOK_TOO_OLD']);
  });

  it.each([['ORDER_CREATED', undefined], ['ORDER_LATE', undefined], ['ORDER_STATUS_CHANGED', 'READY']])('ignores %s %s', async (type, toStatus) => {
    expect(await post(event(type, toStatus))).toEqual({ status: 200, body: { ignored: true } });
    expect(repo.items[0]?.quantity).toBe(10);
  });

  it('answers 503 until the secret is set', async () => {
    delete process.env.LIVE_ORDERS_WEBHOOK_SECRET;
    const res = await post(event('ORDER_STATUS_CHANGED', 'DELIVERED'));
    expect([res.status, res.body.code]).toEqual([503, 'WEBHOOK_NOT_CONFIGURED']);
  });
});
