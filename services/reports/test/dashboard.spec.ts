import { DASHBOARD_DAYS, GetDashboardUseCase } from '../src/application/dashboard.use-case';
import { FakeStockReader } from './fake-stock-reader';

describe('dashboard', () => {
  it('counts products, low stock and units, and buckets movements by UTC day with no gaps', async () => {
    const stock = new FakeStockReader();
    stock.product({ id: 'kb', quantity: 7, minQuantity: 2 });
    stock.product({ id: 'ms', quantity: 0, minQuantity: 1, status: 'LOW' });
    stock.move('kb', 'IN', 10, new Date('2026-11-02T23:59:00Z'));
    stock.move('kb', 'OUT', 3, new Date('2026-11-03T00:01:00Z'));
    stock.move('kb', 'IN', 5, new Date('2026-01-01T00:00:00Z')); // outside the window

    const d = await new GetDashboardUseCase(stock).execute(new Date('2026-11-03T12:00:00Z'));

    expect(d).toMatchObject({ totalProducts: 2, lowStockProducts: 1, totalUnits: 7 });
    expect(d.daily).toHaveLength(DASHBOARD_DAYS);
    expect(d.daily[0]?.date).toBe('2026-10-21');
    expect(d.daily.slice(-2)).toEqual([
      { date: '2026-11-02', in: 10, out: 0 },
      { date: '2026-11-03', in: 0, out: 3 },
    ]);
    expect(d.recent.map((m) => m.quantity)).toEqual([3, 10]);
  });
});
