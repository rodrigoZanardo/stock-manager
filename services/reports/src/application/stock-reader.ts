import type { MovementType, StockStatus } from '@stock/shared';

export type { MovementType, StockStatus };

/** What reports read from the stock service. Plain data: the stock rules stay in the stock service. */

export type StockProduct = {
  id: string;
  sku: string;
  name: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  status: StockStatus;
};

export type ProductMovement = {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  quantity: number;
  note: string | null;
  createdAt: Date;
};

export type MovementTotal = { productId: string; type: MovementType; quantity: number };

/** Port: implemented over HTTP in infra, faked in tests. */
export abstract class StockReader {
  abstract findAll(): Promise<StockProduct[]>;
  /** Every product's movements since the date, newest first. */
  abstract findMovementsSince(since: Date): Promise<ProductMovement[]>;
  /** Summed quantity per product and type, optionally only since a date. */
  abstract movementTotals(since?: Date): Promise<MovementTotal[]>;
}
