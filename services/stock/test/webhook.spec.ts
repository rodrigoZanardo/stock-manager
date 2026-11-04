import { AppError } from '@stock/shared';
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
  const delivered = (eventSeq: number, items: { sku: string; quantity: number }[], orderNumber = 7) =>
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
    expect(await useCase.execute({ ...delivered(1, [{ sku: 'KB-001', quantity: 1 }]), toStatus: 'READY' })).toBe('ignored');
    expect(await useCase.execute({ ...delivered(2, [{ sku: 'KB-001', quantity: 1 }]), type: 'ORDER_CREATED' })).toBe('ignored');
    expect(stock('KB-001')).toBe(10);
  });

  it('lowers the stock of every item and records note and actor', async () => {
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 4 }, { sku: 'MS-001', quantity: 3 }]))).toEqual({ processed: true });
    expect(stock('KB-001')).toBe(6);
    expect(stock('MS-001')).toBe(0);
    expect(repo.movements.map((m) => [m.type, m.note, m.actorEmail])).toEqual([
      ['OUT', 'Order #7 (Live Orders)', 'live-orders@integration'],
      ['OUT', 'Order #7 (Live Orders)', 'live-orders@integration'],
    ]);
  });

  it('adds up the same SKU listed twice', async () => {
    await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 2 }, { sku: 'KB-001', quantity: 3 }]));
    expect(stock('KB-001')).toBe(5);
  });

  it('applies the same event once', async () => {
    const event = delivered(9, [{ sku: 'KB-001', quantity: 4 }]);
    expect(await useCase.execute(event)).toEqual({ processed: true });
    expect(await useCase.execute(event)).toBe('duplicate');
    expect(stock('KB-001')).toBe(6);
  });

  it('takes out what is left when stock is short, and records the shortfall', async () => {
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 1 }, { sku: 'MS-001', quantity: 5 }])))
      .toEqual({ processed: true, shortfalls: [{ sku: 'MS-001', requested: 5, applied: 3 }] });
    expect(stock('KB-001')).toBe(9);
    expect(stock('MS-001')).toBe(0);
    expect(repo.movements.map((m) => [m.productId, m.quantity, m.note])).toEqual([
      ['KB-001', 1, 'Order #7 (Live Orders)'],
      ['MS-001', 3, 'Order #7 (Live Orders) — short 2'],
    ]);
    expect(repo.audit[1]?.details).toMatchObject({ quantity: 3, requested: 5, shortfall: 2, quantityAfter: 0 });
  });

  it('records no movement for a line with zero stock but lists it in the audit', async () => {
    repo.items[1]?.move('OUT', 3);
    expect(await useCase.execute(delivered(1, [{ sku: 'MS-001', quantity: 2 }])))
      .toEqual({ processed: true, shortfalls: [{ sku: 'MS-001', requested: 2, applied: 0 }] });
    expect(repo.movements).toHaveLength(0);
    expect(repo.audit.map((a) => [a.action, a.productId, a.details])).toEqual([
      ['STOCK_OUT', 'MS-001', { quantity: 0, note: 'Order #7 (Live Orders) — short 2', quantityAfter: 0, requested: 2, shortfall: 2 }],
    ]);
    expect(await useCase.execute(delivered(1, [{ sku: 'MS-001', quantity: 2 }]))).toBe('duplicate');
  });

  it('skips an unknown SKU, applies the rest and lists it', async () => {
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 1 }, { sku: 'NOPE-1', quantity: 2 }])))
      .toEqual({ processed: true, shortfalls: [{ sku: 'NOPE-1', requested: 2, applied: 0 }] });
    expect(stock('KB-001')).toBe(9);
    expect(repo.movements).toHaveLength(1);
    expect(await repo.isEventProcessed('1')).toBe(true);
  });

  it('keeps the plain note and no shortfall details when everything is in stock', async () => {
    expect(await useCase.execute(delivered(1, [{ sku: 'MS-001', quantity: 3 }]))).toEqual({ processed: true });
    expect(repo.audit[0]?.details).toEqual({ quantity: 3, note: 'Order #7 (Live Orders)', quantityAfter: 0 });
  });

  it('refuses an X-Event-Seq header that differs from the signed seq, so the replay key cannot be changed', async () => {
    const event = delivered(5, [{ sku: 'KB-001', quantity: 1 }]);
    await expect(useCase.execute({ ...event, headerSeq: '6' })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(await useCase.execute({ ...event, headerSeq: '5' })).toEqual({ processed: true });
    expect(repo.movements).toHaveLength(1);
  });

  it('retries once when the stock changed under the write, and gives up on the second failure', async () => {
    const real = repo.saveOrderDelivery.bind(repo);
    let failures = 1;
    repo.saveOrderDelivery = async (...args) => {
      if (failures-- > 0) throw new AppError('STOCK_CHANGED');
      return real(...args);
    };
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 1 }]))).toEqual({ processed: true });
    expect(repo.movements).toHaveLength(1);

    failures = 2;
    await expect(useCase.execute(delivered(2, [{ sku: 'KB-001', quantity: 1 }]))).rejects.toMatchObject({ code: 'STOCK_CHANGED' });
  });
});
