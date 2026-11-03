import { Injectable } from '@nestjs/common';
import { DAY_MS } from '@stock/shared';
import { ProductMovement, StockReader } from './stock-reader';

export const DASHBOARD_DAYS = 14;
const RECENT_LIMIT = 10;

export type Dashboard = {
  totalProducts: number;
  lowStockProducts: number;
  totalUnits: number;
  daily: { date: string; in: number; out: number }[];
  recent: ProductMovement[];
};

const day = (d: Date) => d.toISOString().slice(0, 10);

@Injectable()
export class GetDashboardUseCase {
  constructor(private readonly stock: StockReader) {}

  /** Days are UTC calendar days; the window ends today and has no gaps. */
  async execute(now = new Date()): Promise<Dashboard> {
    const start = new Date(Date.parse(day(now)) - (DASHBOARD_DAYS - 1) * DAY_MS);
    // shortcut: aggregates in memory, fine for a 14-day window; move to SQL GROUP BY if volume grows
    const [products, movements] = await Promise.all([this.stock.findAll(), this.stock.findMovementsSince(start)]);

    const daily = Array.from({ length: DASHBOARD_DAYS }, (_, i) => ({ date: day(new Date(start.getTime() + i * DAY_MS)), in: 0, out: 0 }));
    const byDate = new Map(daily.map((d) => [d.date, d]));
    for (const m of movements) {
      const bucket = byDate.get(day(m.createdAt));
      if (bucket) bucket[m.type === 'IN' ? 'in' : 'out'] += m.quantity;
    }

    return {
      totalProducts: products.length,
      lowStockProducts: products.filter((p) => p.status === 'LOW').length,
      totalUnits: products.reduce((sum, p) => sum + p.quantity, 0),
      daily,
      recent: movements.slice(0, RECENT_LIMIT),
    };
  }
}
