import { Injectable } from '@nestjs/common';
import { AppError, DAY_MS } from '@stock/shared';
import { MovementTotal, StockReader, StockStatus } from './stock-reader';

/** Average consumption is measured over this window. */
export const USAGE_WINDOW_DAYS = 30;
/** How many days of consumption the suggested stock should cover. */
export const COVER_DAYS = 30;

export type InventoryRow = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  status: StockStatus;
  totalIn: number;
  totalOut: number;
  /** Units out per day over the last USAGE_WINDOW_DAYS, 2 decimals. */
  avgDailyOut: number;
  /** Days the current stock lasts at that pace; null when nothing goes out. */
  daysOfCover: number | null;
  /** Stock to keep: COVER_DAYS of consumption, never below the minimum nor above the maximum. */
  suggestedQuantity: number;
  /** Units to buy now to reach the suggestion. */
  reorderQuantity: number;
};

/** Indexes totals by product and type; missing pairs count as zero. */
function indexTotals(totals: MovementTotal[]) {
  const sums = new Map<string, number>();
  for (const t of totals) sums.set(`${t.productId}:${t.type}`, (sums.get(`${t.productId}:${t.type}`) ?? 0) + t.quantity);
  return (productId: string, type: MovementTotal['type']) => sums.get(`${productId}:${type}`) ?? 0;
}

@Injectable()
export class GetInventoryUseCase {
  constructor(private readonly stock: StockReader) {}

  async execute(now = new Date()): Promise<InventoryRow[]> {
    const since = new Date(now.getTime() - USAGE_WINDOW_DAYS * DAY_MS);
    const [products, allTimeTotals, recentTotals] = await Promise.all([
      this.stock.findAll(),
      this.stock.movementTotals(),
      this.stock.movementTotals(since),
    ]);

    const allTime = indexTotals(allTimeTotals);
    const recent = indexTotals(recentTotals);

    return products.map((p) => {
      const avgDailyOut = Math.round((recent(p.id, 'OUT') / USAGE_WINDOW_DAYS) * 100) / 100;
      const byUsage = Math.max(p.minQuantity, Math.ceil(avgDailyOut * COVER_DAYS));
      const suggestedQuantity = p.maxQuantity === null ? byUsage : Math.min(byUsage, p.maxQuantity);
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        quantity: p.quantity,
        minQuantity: p.minQuantity,
        maxQuantity: p.maxQuantity,
        status: p.status,
        totalIn: allTime(p.id, 'IN'),
        totalOut: allTime(p.id, 'OUT'),
        avgDailyOut,
        daysOfCover: avgDailyOut > 0 ? Math.floor(p.quantity / avgDailyOut) : null,
        suggestedQuantity,
        reorderQuantity: Math.max(0, suggestedQuantity - p.quantity),
      };
    });
  }
}

export type AnalysisLocale = 'en' | 'pt';

/** Port: writes a restock analysis of the inventory report in the given language. */
export abstract class InventoryAdvisor {
  abstract readonly enabled: boolean;
  abstract analyze(rows: InventoryRow[], locale: AnalysisLocale): Promise<string>;
}

@Injectable()
export class AnalyzeInventoryUseCase {
  constructor(private readonly inventory: GetInventoryUseCase, private readonly advisor: InventoryAdvisor) {}

  async execute(locale: AnalysisLocale): Promise<{ analysis: string; generatedAt: Date }> {
    if (!this.advisor.enabled) throw new AppError('AI_NOT_CONFIGURED');
    // the numbers come from our own report; the model only explains and prioritizes them
    const rows = await this.inventory.execute();
    return { analysis: await this.advisor.analyze(rows, locale), generatedAt: new Date() };
  }
}
