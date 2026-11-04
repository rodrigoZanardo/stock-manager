import { Logger } from '@nestjs/common';
import { AppError } from '@stock/shared';
import { ApplyOrderEventUseCase } from '../src/application/webhook.use-cases';
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

describe('ApplyOrderEventUseCase', () => {
  let repo: InMemoryRepo;
  let useCase: ApplyOrderEventUseCase;
  const delivered = (eventSeq: number, items: { sku: string; quantity: number }[], orderNumber = 7) =>
    ({ type: 'ORDER_STATUS_CHANGED', toStatus: 'DELIVERED', eventSeq, orderId: 'order-1', orderNumber, items });
  const stock = (sku: string) => repo.items.find((p) => p.sku === sku)?.quantity;

  beforeEach(() => {
    repo = new InMemoryRepo();
    useCase = new ApplyOrderEventUseCase(repo);
    for (const [sku, quantity] of [['KB-001', 10], ['MS-001', 3]] as const) {
      const p = Product.create({ id: sku, sku, name: sku, minQuantity: 0 });
      p.move('IN', quantity);
      repo.items.push(p);
    }
  });

  it('ignores events that are not a delivery', async () => {
    expect(await useCase.execute({ ...delivered(1, [{ sku: 'KB-001', quantity: 1 }]), toStatus: 'READY' })).toBe('ignored');
    expect(await useCase.execute({ ...delivered(2, [{ sku: 'KB-001', quantity: 1 }]), type: 'ORDER_LATE', toStatus: undefined })).toBe('ignored');
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
    const real = repo.saveOrderClosing.bind(repo);
    let failures = 1;
    repo.saveOrderClosing = async (...args) => {
      if (failures-- > 0) throw new AppError('STOCK_CHANGED');
      return real(...args);
    };
    expect(await useCase.execute(delivered(1, [{ sku: 'KB-001', quantity: 1 }]))).toEqual({ processed: true });
    expect(repo.movements).toHaveLength(1);

    failures = 2;
    await expect(useCase.execute(delivered(2, [{ sku: 'KB-001', quantity: 1 }]))).rejects.toMatchObject({ code: 'STOCK_CHANGED' });
  });

  describe('reservations', () => {
    const created = (eventSeq: number, items: { sku: string; quantity: number }[], orderId = 'order-1') =>
      ({ type: 'ORDER_CREATED', eventSeq, orderId, orderNumber: 7, items });
    const status = (toStatus: string, eventSeq: number, items: { sku: string; quantity: number }[], orderId = 'order-1') =>
      ({ type: 'ORDER_STATUS_CHANGED', toStatus, eventSeq, orderId, orderNumber: 7, items });
    const product = (sku: string) => repo.items.find((p) => p.sku === sku);
    const levels = (sku: string) => [product(sku)?.quantity, product(sku)?.reserved, product(sku)?.available];

    it('ORDER_CREATED reserves without moving physical stock, and audits it', async () => {
      expect(await useCase.execute(created(1, [{ sku: 'KB-001', quantity: 4 }]))).toEqual({ processed: true });
      expect(levels('KB-001')).toEqual([10, 4, 6]);
      expect(repo.movements).toHaveLength(0);
      expect(repo.audit.map((a) => [a.action, a.details])).toEqual([
        ['STOCK_RESERVED', { quantity: 4, note: 'Order #7 (Live Orders)', orderId: 'order-1', reservedAfter: 4 }],
      ]);
    });

    it('reserves only what is available and records the shortfall; an unknown SKU is skipped and logged', async () => {
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      await useCase.execute(created(1, [{ sku: 'MS-001', quantity: 2 }], 'other'));
      expect(await useCase.execute(created(2, [{ sku: 'MS-001', quantity: 5 }, { sku: 'NOPE-1', quantity: 1 }])))
        .toEqual({ processed: true, shortfalls: [{ sku: 'MS-001', requested: 5, applied: 1 }, { sku: 'NOPE-1', requested: 1, applied: 0 }] });
      expect(levels('MS-001')).toEqual([3, 3, 0]);
      expect(repo.audit[1]?.details).toMatchObject({ quantity: 1, requested: 5, shortfall: 4 });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('Order #7 (order-1): unknown SKU NOPE-1'));
      warn.mockRestore();
    });

    it('CANCELLED releases the reservation', async () => {
      await useCase.execute(created(1, [{ sku: 'KB-001', quantity: 4 }]));
      expect(await useCase.execute(status('CANCELLED', 2, [{ sku: 'KB-001', quantity: 4 }]))).toEqual({ processed: true });
      expect(levels('KB-001')).toEqual([10, 0, 10]);
      expect(repo.audit.at(-1)).toMatchObject({ action: 'STOCK_RELEASED', productId: 'KB-001', details: { quantity: 4, orderId: 'order-1' } });
    });

    it('DELIVERED releases the reservation and lowers the physical stock, even into units reserved by other orders', async () => {
      await useCase.execute(created(1, [{ sku: 'MS-001', quantity: 2 }]));
      await useCase.execute(created(2, [{ sku: 'MS-001', quantity: 1 }], 'other'));
      expect(await useCase.execute(status('DELIVERED', 3, [{ sku: 'MS-001', quantity: 3 }]))).toEqual({ processed: true });
      expect(levels('MS-001')).toEqual([0, 1, 0]);
      expect(repo.audit.slice(-2).map((a) => a.action)).toEqual(['STOCK_RELEASED', 'STOCK_OUT']);
    });

    it('a late ORDER_CREATED after its order was closed reserves nothing', async () => {
      await useCase.execute(status('DELIVERED', 5, [{ sku: 'KB-001', quantity: 2 }]));
      expect(await useCase.execute(created(4, [{ sku: 'KB-001', quantity: 2 }]))).toBe('ignored');
      expect(levels('KB-001')).toEqual([8, 0, 8]);
      expect(repo.audit.map((a) => a.action)).toEqual(['STOCK_OUT']);
    });

    it('applies the same ORDER_CREATED once', async () => {
      await useCase.execute(created(1, [{ sku: 'KB-001', quantity: 4 }]));
      expect(await useCase.execute(created(1, [{ sku: 'KB-001', quantity: 4 }]))).toBe('duplicate');
      expect(levels('KB-001')).toEqual([10, 4, 6]);
    });
  });
});
