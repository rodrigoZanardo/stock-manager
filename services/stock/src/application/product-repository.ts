import type { Actor, JsonObject } from '@stock/shared';
import { MovementType, Product } from '../domain/product';

export type Movement = { id: string; type: MovementType; quantity: number; note: string | null; actorEmail: string | null; createdAt: Date };
export type MovementTotal = { productId: string; type: MovementType; quantity: number };
export type ProductMovement = Movement & { productId: string; productName: string };

export const AUDIT_ACTIONS = ['PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'STOCK_IN', 'STOCK_OUT'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** What a write records next to its change, in the same transaction. */
export type AuditRecord = { action: AuditAction; productId: string; details: JsonObject; actor: Actor };
export type AuditEntry = { id: string; action: AuditAction; productId: string | null; details: JsonObject; actorEmail: string; createdAt: Date };

/** Port: the application depends on this, infra implements it. Every write also stores its audit record atomically. */
export abstract class ProductRepository {
  abstract findById(id: string): Promise<Product | null>;
  abstract findBySku(sku: string): Promise<Product | null>;
  abstract findAll(): Promise<Product[]>;
  abstract create(product: Product, audit: AuditRecord): Promise<void>;
  abstract update(product: Product, audit: AuditRecord): Promise<void>;
  abstract delete(id: string, audit: AuditRecord): Promise<void>;
  abstract hasMovements(productId: string): Promise<boolean>;
  /** Newest first, at most `limit`. */
  abstract findMovements(productId: string, limit: number): Promise<Movement[]>;
  /** Every product's movements since the date, newest first. */
  abstract findMovementsSince(since: Date): Promise<ProductMovement[]>;
  /** Summed quantity per product and type, optionally only since a date. */
  abstract movementTotals(since?: Date): Promise<MovementTotal[]>;
  /** Must update the quantity and record the movement atomically. */
  abstract saveMovement(product: Product, movement: { type: MovementType; quantity: number; note?: string }, audit: AuditRecord): Promise<void>;
  /** Newest first. */
  abstract findAuditEntries(limit: number): Promise<AuditEntry[]>;
}
