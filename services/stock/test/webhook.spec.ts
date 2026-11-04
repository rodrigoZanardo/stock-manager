import { ApplyDeliveredOrderUseCase } from '../src/application/webhook.use-cases';
import { Product } from '../src/domain/product';
import { MAX_CLOCK_SKEW_SECONDS, signWebhook, verifyWebhook } from '../src/domain/webhook-signature';
import { InMemoryRepo } from './in-memory-product.repository';

describe('webhook signature', () => {
  const secret = 's3cret';
  const rawBody = Buffer.from('{"a":1}');
  const now = 1_800_000_000;
  const ts = String(now);
  const ok = { secret, timestamp: ts, signature: signWebhook(secret, ts, rawBody), rawBody, nowSeconds: now };

  it('accepts a valid signature', () => {
    expect(() => verifyWebhook(ok)).not.toThrow();
  });

  it.each([
    ['wrong secret', { signature: signWebhook('other', ts, rawBody) }],
    ['changed body', { rawBody: Buffer.from('{"a":2}') }],
    ['missing signature', { signature: undefined }],
    ['missing timestamp', { timestamp: undefined }],
    ['short signature', { signature: 'sha256=abc' }],
  ])('refuses %s', (_, change) => {
    expect(() => verifyWebhook({ ...ok, ...change })).toThrow(expect.objectContaining({ code: 'WEBHOOK_SIGNATURE_INVALID' }));
  });

  it('allows exactly 5 minutes of clock difference and refuses one second more, in both directions', () => {
    expect(() => verifyWebhook({ ...ok, nowSeconds: now + MAX_CLOCK_SKEW_SECONDS })).not.toThrow();
    expect(() => verifyWebhook({ ...ok, nowSeconds: now + MAX_CLOCK_SKEW_SECONDS + 1 })).toThrow(expect.objectContaining({ code: 'WEBHOOK_TOO_OLD' }));
    expect(() => verifyWebhook({ ...ok, nowSeconds: now - MAX_CLOCK_SKEW_SECONDS - 1 })).toThrow(expect.objectContaining({ code: 'WEBHOOK_TOO_OLD' }));
  });
});

describe('ApplyDeliveredOrderUseCase', () => {
  let repo: InMemoryRepo;
  let useCase: ApplyDeliveredOrderUseCase;
  const delivered = (eventSeq: string, items: { sku: string; quantity: number }[], orderNumber = 7) =>
    ({ type: 'ORDER_STATUS_CHANGED', toStatus: 'DELIVERED', eventSeq, orderNumber, items });
  const stock = (sku: string) => repo.items.find((p) => p.sku === sku)?.quantity;

  beforeEach(() => {
    repo = new InMemoryRepo();
    useCase = new ApplyDeliveredOrderUseCase(repo);
    for (const [sku, quantity] of [['KB-001', 10], ['MS-001', 3]] as const) {
      const p = Product.create({ id: sku, sku, name: sku, minQuantity: 0 });
      p.move('IN', quantity);
      repo.items.push(p);
    }
  });

  it('ignores events that are not a delivery', async () => {
    expect(await useCase.execute({ ...delivered('1', [{ sku: 'KB-001', quantity: 1 }]), toStatus: 'READY' })).toBe('ignored');
    expect(await useCase.execute({ ...delivered('2', [{ sku: 'KB-001', quantity: 1 }]), type: 'ORDER_CREATED' })).toBe('ignored');
    expect(stock('KB-001')).toBe(10);
  });

  it('lowers the stock of every item and records note and actor', async () => {
    expect(await useCase.execute(delivered('1', [{ sku: 'KB-001', quantity: 4 }, { sku: 'MS-001', quantity: 3 }]))).toBe('processed');
    expect(stock('KB-001')).toBe(6);
    expect(stock('MS-001')).toBe(0);
    expect(repo.movements.map((m) => [m.type, m.note, m.actorEmail])).toEqual([
      ['OUT', 'Order #7 (Live Orders)', 'live-orders@integration'],
      ['OUT', 'Order #7 (Live Orders)', 'live-orders@integration'],
    ]);
  });

  it('adds up the same SKU listed twice', async () => {
    await useCase.execute(delivered('1', [{ sku: 'KB-001', quantity: 2 }, { sku: 'KB-001', quantity: 3 }]));
    expect(stock('KB-001')).toBe(5);
  });

  it('applies the same event once', async () => {
    const event = delivered('9', [{ sku: 'KB-001', quantity: 4 }]);
    expect(await useCase.execute(event)).toBe('processed');
    expect(await useCase.execute(event)).toBe('duplicate');
    expect(stock('KB-001')).toBe(6);
  });

  it('refuses an unknown SKU and changes nothing', async () => {
    await expect(useCase.execute(delivered('1', [{ sku: 'KB-001', quantity: 1 }, { sku: 'NOPE-1', quantity: 1 }])))
      .rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', params: { sku: 'NOPE-1' } });
    expect(repo.movements).toHaveLength(0); // the stock itself is checked against the real database in the integration test
    expect(await repo.isEventProcessed('1')).toBe(false);
  });

  it('refuses when one item lacks stock and changes nothing', async () => {
    await expect(useCase.execute(delivered('1', [{ sku: 'KB-001', quantity: 1 }, { sku: 'MS-001', quantity: 4 }])))
      .rejects.toMatchObject({ code: 'NOT_ENOUGH_STOCK' });
    expect(repo.movements).toHaveLength(0);
    expect(await repo.isEventProcessed('1')).toBe(false);
  });

  it('needs a numeric event sequence for a delivery', async () => {
    await expect(useCase.execute(delivered('', [{ sku: 'KB-001', quantity: 1 }]))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});
