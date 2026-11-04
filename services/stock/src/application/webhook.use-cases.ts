import { Injectable, Logger } from '@nestjs/common';
import { AppError, type Actor } from '@stock/shared';
import { Product } from '../domain/product';
import { OrderLine, ProductRepository } from './product-repository';

/** shortcut: OPERATOR is the closest existing role; give integrations their own role if they ever need different rights */
export const LIVE_ORDERS_ACTOR: Actor = { id: 'live-orders', email: 'live-orders@integration', role: 'OPERATOR' };

type OrderEvent = {
  type: string;
  toStatus?: string;
  /** From the signed body: the only sequence number the signature covers. */
  eventSeq: number;
  /** The X-Event-Seq header, unsigned; it must agree with the body when sent. */
  headerSeq?: string;
  /** Unique per order; the number restarts every business day, so reservations are keyed by this. */
  orderId: string;
  orderNumber: number;
  items: { sku: string; quantity: number }[];
};

export type Shortfall = { sku: string; requested: number; applied: number };
type Processed = { processed: true; shortfalls?: Shortfall[] };

/**
 * ORDER_CREATED reserves the items, CANCELLED releases them, DELIVERED releases them and lowers the stock.
 * The order was already accepted in Live Orders, so nothing is refused for stock: each SKU takes what exists and the rest is a shortfall.
 */
@Injectable()
export class ApplyOrderEventUseCase {
  private readonly logger = new Logger(ApplyOrderEventUseCase.name);

  constructor(private readonly repo: ProductRepository) {}

  async execute(e: OrderEvent): Promise<'ignored' | 'duplicate' | Processed> {
    if (e.headerSeq !== undefined && e.headerSeq !== String(e.eventSeq))
      throw new AppError('INVALID_INPUT', { details: 'X-Event-Seq must match seq in the body' });
    const kind = e.type === 'ORDER_CREATED' ? 'reserve'
      : e.type === 'ORDER_STATUS_CHANGED' && e.toStatus === 'DELIVERED' ? 'deliver'
      : e.type === 'ORDER_STATUS_CHANGED' && e.toStatus === 'CANCELLED' ? 'cancel'
      : null;
    if (!kind) return 'ignored';
    const eventSeq = String(e.eventSeq);
    if (await this.repo.isEventProcessed(eventSeq)) return 'duplicate';
    try {
      return await this.apply(kind, e, eventSeq);
    } catch (err) {
      // a different order took the same stock between our read and our write; read again once
      if (err instanceof AppError && err.code === 'STOCK_CHANGED') return this.apply(kind, e, eventSeq);
      throw err;
    }
  }

  private async apply(kind: 'reserve' | 'deliver' | 'cancel', e: OrderEvent, eventSeq: string): Promise<'ignored' | 'duplicate' | Processed> {
    const note = `Order #${e.orderNumber} (Live Orders)`;
    if (kind === 'cancel') {
      const saved = await this.repo.saveOrderClosing(eventSeq, e.orderId, this.releaseAudit(e, note), []);
      return saved ? { processed: true } : 'duplicate';
    }
    const lines: OrderLine[] = [];
    const shortfalls: Shortfall[] = [];
    for (const [sku, requested] of wanted(e.items)) {
      const product = await this.repo.findBySku(sku);
      if (!product) {
        this.logger.warn(`Order #${e.orderNumber} (${e.orderId}): unknown SKU ${sku}, skipped`);
        shortfalls.push({ sku, requested, applied: 0 });
        continue;
      }
      // this order's own reservation is released in the same transaction, so a delivery is limited by the shelf only
      const quantity = Math.min(requested, kind === 'reserve' ? product.available : product.quantity);
      const shortfall = requested - quantity;
      if (shortfall) shortfalls.push({ sku, requested, applied: quantity });
      lines.push(kind === 'reserve' ? reserveLine(product, quantity, note, shortfall, e.orderId) : deliverLine(product, quantity, note, shortfall));
    }
    let result: 'saved' | 'duplicate' | 'closed';
    if (kind === 'reserve') result = await this.repo.saveOrderReservation(eventSeq, { id: e.orderId, number: e.orderNumber }, lines);
    else result = (await this.repo.saveOrderClosing(eventSeq, e.orderId, this.releaseAudit(e, note), lines)) ? 'saved' : 'duplicate';
    if (result === 'duplicate') return 'duplicate';
    // the order was delivered or cancelled before this late ORDER_CREATED arrived: holding stock now would never be released
    if (result === 'closed') return 'ignored';
    return shortfalls.length ? { processed: true, shortfalls } : { processed: true };
  }

  private releaseAudit(e: OrderEvent, note: string) {
    return ({ productId, quantity }: { productId: string; quantity: number }) => ({
      action: 'STOCK_RELEASED' as const, productId, details: { quantity, note, orderId: e.orderId }, actor: LIVE_ORDERS_ACTOR,
    });
  }
}

function reserveLine(product: Product, quantity: number, note: string, shortfall: number, orderId: string): OrderLine {
  if (quantity > 0) product.reserve(quantity);
  const lineNote = shortfall ? `${note} — short ${shortfall}` : note;
  const details = { quantity, note: lineNote, orderId, reservedAfter: product.reserved, ...(shortfall ? { requested: quantity + shortfall, shortfall } : {}) };
  return { product, quantity, note: lineNote, audit: { action: 'STOCK_RESERVED', productId: product.id, details, actor: LIVE_ORDERS_ACTOR } };
}

function deliverLine(product: Product, quantity: number, note: string, shortfall: number): OrderLine {
  if (quantity > 0) product.ship(quantity);
  const lineNote = shortfall ? `${note} — short ${shortfall}` : note;
  const details = { quantity, note: lineNote, quantityAfter: product.quantity, ...(shortfall ? { requested: quantity + shortfall, shortfall } : {}) };
  return { product, quantity, note: lineNote, audit: { action: 'STOCK_OUT', productId: product.id, details, actor: LIVE_ORDERS_ACTOR } };
}

/** One line per SKU, sorted so two orders never lock the same products in opposite order. */
function wanted(items: { sku: string; quantity: number }[]): [string, number][] {
  const sum = new Map<string, number>();
  for (const { sku, quantity } of items) sum.set(sku, (sum.get(sku) ?? 0) + quantity);
  return [...sum].sort(([a], [b]) => a.localeCompare(b));
}
