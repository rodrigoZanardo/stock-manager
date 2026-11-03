process.env.STOCK_URL = 'http://stock.test';

import { HttpStockReader } from '../src/infra/http-stock-reader';

type Call = { url: string; authorization: string | undefined };

function stubFetch(respond: () => Promise<Response>) {
  const calls: Call[] = [];
  global.fetch = async (input, init) => {
    calls.push({ url: String(input), authorization: new Headers(init?.headers).get('authorization') ?? undefined });
    return respond();
  };
  return calls;
}

const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });
const reader = (authorization?: string) => new HttpStockReader({ headers: { authorization } });

describe('HttpStockReader', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it("forwards the caller's token and parses dates", async () => {
    const calls = stubFetch(json(200, [{ id: '1', productId: 'p', productName: 'P', type: 'IN', quantity: 1, note: null, createdAt: '2026-01-02T00:00:00Z' }]));
    const [m] = await reader('Bearer abc').findMovementsSince(new Date('2026-01-01T00:00:00Z'));
    expect(m?.createdAt).toEqual(new Date('2026-01-02T00:00:00Z'));
    expect(calls).toEqual([{ url: 'http://stock.test/movements?since=2026-01-01T00:00:00.000Z', authorization: 'Bearer abc' }]);
  });

  it('asks for all-time totals without a query string', async () => {
    const calls = stubFetch(json(200, []));
    await reader('Bearer abc').movementTotals();
    expect(calls[0]?.url).toBe('http://stock.test/movements/totals');
  });

  it.each([
    [401, 'SESSION_INVALID'],
    [403, 'FORBIDDEN'],
    [404, 'STOCK_UNAVAILABLE'],
    [500, 'STOCK_UNAVAILABLE'],
  ])('maps status %i to %s', async (status, code) => {
    stubFetch(json(status, {}));
    await expect(reader('Bearer abc').findAll()).rejects.toMatchObject({ code });
  });

  it('maps a network error or timeout, and a body that is not JSON, to STOCK_UNAVAILABLE', async () => {
    stubFetch(async () => { throw new DOMException('timed out', 'TimeoutError'); });
    await expect(reader().findAll()).rejects.toMatchObject({ code: 'STOCK_UNAVAILABLE' });
    stubFetch(async () => new Response('<html>', { status: 200 }));
    await expect(reader().findAll()).rejects.toMatchObject({ code: 'STOCK_UNAVAILABLE' });
  });
});
