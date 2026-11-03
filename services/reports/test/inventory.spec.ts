import { AnalyzeInventoryUseCase, GetInventoryUseCase, InventoryAdvisor } from '../src/application/inventory.use-case';
import { FakeStockReader } from './fake-stock-reader';

const NOW = new Date('2026-11-03T12:00:00Z');
const DAYS_AGO = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

describe('inventory report', () => {
  it('sums all-time in/out, averages the last 30 days and suggests stock for 30 days', async () => {
    const stock = new FakeStockReader();
    stock.product({ id: 'kb', quantity: 20, minQuantity: 5 });
    stock.move('kb', 'IN', 100, DAYS_AGO(5));
    stock.move('kb', 'OUT', 60, DAYS_AGO(2));
    stock.move('kb', 'OUT', 20, DAYS_AGO(300)); // counts in totals, not in the 30-day average

    const [row] = await new GetInventoryUseCase(stock).execute(NOW);

    expect(row).toMatchObject({ quantity: 20, totalIn: 100, totalOut: 80, avgDailyOut: 2, daysOfCover: 10, suggestedQuantity: 60, reorderQuantity: 40 });
  });

  it('never suggests below the minimum nor above the maximum, and has no cover without consumption', async () => {
    const idle = new FakeStockReader();
    idle.product({ id: 'idle', minQuantity: 5 });
    const [idleRow] = await new GetInventoryUseCase(idle).execute(NOW);
    expect(idleRow).toMatchObject({ avgDailyOut: 0, daysOfCover: null, suggestedQuantity: 5, reorderQuantity: 5 });

    const capped = new FakeStockReader();
    capped.product({ id: 'capped', minQuantity: 1, maxQuantity: 30 });
    capped.move('capped', 'OUT', 90, DAYS_AGO(1));
    const [cappedRow] = await new GetInventoryUseCase(capped).execute(NOW);
    expect(cappedRow).toMatchObject({ avgDailyOut: 3, suggestedQuantity: 30 });
  });
});

describe('inventory analysis', () => {
  class FakeAdvisor extends InventoryAdvisor {
    calls: { rows: number; locale: string }[] = [];
    constructor(readonly enabled: boolean) { super(); }
    async analyze(rows: unknown[], locale: 'en' | 'pt') { this.calls.push({ rows: rows.length, locale }); return 'ok'; }
  }

  const withOneProduct = () => {
    const stock = new FakeStockReader();
    stock.product({ id: 'kb', minQuantity: 1 });
    return new GetInventoryUseCase(stock);
  };

  it('sends the computed report in the chosen language', async () => {
    const advisor = new FakeAdvisor(true);
    const result = await new AnalyzeInventoryUseCase(withOneProduct(), advisor).execute('pt');
    expect(result.analysis).toBe('ok');
    expect(advisor.calls).toEqual([{ rows: 1, locale: 'pt' }]);
  });

  it('refuses with AI_NOT_CONFIGURED when there is no API key', async () => {
    await expect(new AnalyzeInventoryUseCase(withOneProduct(), new FakeAdvisor(false)).execute('en')).rejects.toMatchObject({ code: 'AI_NOT_CONFIGURED' });
  });
});
