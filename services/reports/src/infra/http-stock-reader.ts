import { Inject, Injectable, Logger, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AppError, requireEnv } from '@stock/shared';
import { MovementTotal, ProductMovement, StockProduct, StockReader } from '../application/stock-reader';

const TIMEOUT_MS = 5000;
// read at import, so a missing variable stops the service at boot instead of failing the first request
const STOCK_URL = requireEnv('STOCK_URL');

/**
 * Calls the stock service with the caller's own token, so roles are checked there too
 * and this service never needs credentials of its own. Request-scoped for that reason.
 */
@Injectable({ scope: Scope.REQUEST })
export class HttpStockReader extends StockReader {
  private readonly logger = new Logger(HttpStockReader.name);

  constructor(@Inject(REQUEST) private readonly request: { headers: { authorization?: string } }) {
    super();
  }

  findAll() {
    return this.get<StockProduct[]>('/products');
  }

  async findMovementsSince(since: Date) {
    const rows = await this.get<(Omit<ProductMovement, 'createdAt'> & { createdAt: string })[]>(`/movements?since=${since.toISOString()}`);
    return rows.map((m) => ({ ...m, createdAt: new Date(m.createdAt) }));
  }

  movementTotals(since?: Date) {
    return this.get<MovementTotal[]>(since ? `/movements/totals?since=${since.toISOString()}` : '/movements/totals');
  }

  private async get<T>(path: string): Promise<T> {
    const authorization = this.request.headers.authorization ?? '';
    let res: Response;
    try {
      res = await fetch(`${STOCK_URL}${path}`, { headers: { authorization }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      return this.unavailable(`unreachable: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (res.status === 401) throw new AppError('SESSION_INVALID');
    if (res.status === 403) throw new AppError('FORBIDDEN');
    if (!res.ok) return this.unavailable(`answered ${res.status} for ${path}`);
    try {
      return await res.json();
    } catch {
      return this.unavailable(`sent a body that is not JSON for ${path}`);
    }
  }

  private unavailable(reason: string): never {
    this.logger.error(`stock service ${reason}`);
    throw new AppError('STOCK_UNAVAILABLE');
  }
}
