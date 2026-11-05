import { InventoryCount } from '../domain/inventory-count';
import { MovementType, Product } from '../domain/product';
import { AuditRecord } from './product-repository';

/** One product's correction: its quantity goes from `before` to `product.quantity` through `movement`. */
export type AdjustLine = { product: Product; before: number; movement: { type: MovementType; quantity: number }; note: string; audit: AuditRecord };

/** Port for inventory counts. Every write also stores its audit record atomically. */
export abstract class InventoryCountRepository {
  abstract findCount(id: string): Promise<InventoryCount | null>;
  /** Newest first. */
  abstract findCounts(): Promise<InventoryCount[]>;
  /** Assigns the next number and returns the stored count; the audit details get that `number` added. */
  abstract createCount(count: InventoryCount, audit: AuditRecord): Promise<InventoryCount>;
  /** Saves the counted quantities only while the stored count is OPEN, else INVENTORY_COUNT_STATUS. */
  abstract saveCounted(count: InventoryCount, audit: AuditRecord): Promise<void>;
  /** OPEN -> CANCELLED, else INVENTORY_COUNT_STATUS. */
  abstract cancelCount(count: InventoryCount, audit: AuditRecord): Promise<void>;
  /**
   * One transaction: OPEN -> APPLIED (else INVENTORY_COUNT_STATUS), then every line's quantity, movement and audit entry.
   * STOCK_CHANGED when a product's quantity is no longer `before` or its reservations grew above the counted quantity.
   */
  abstract applyCount(count: InventoryCount, lines: AdjustLine[], audit: AuditRecord): Promise<void>;
}
