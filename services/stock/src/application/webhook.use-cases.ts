import { Injectable } from '@nestjs/common';
import { AppError, type Actor } from '@stock/shared';
import { ProductRepository } from './product-repository';

/** shortcut: OPERATOR is the closest existing role; give integrations their own role if they ever need different rights */
export const LIVE_ORDERS_ACTOR: Actor = { id: 'live-orders', email: 'live-orders@integration', role: 'OPERATOR' };

type DeliveredEvent = {
  type: string;
  toStatus?: string;
  /** From the signed body: the only sequence number the signature covers. */
  eventSeq: number;
  /** The X-Event-Seq header, unsigned; it must agree with the body when sent. */
  headerSeq?: string;
  orderNumber: number;
  items: { sku: string; quantity: number }[];
};

@Injectable()
export class ApplyDeliveredOrderUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(e: DeliveredEvent): Promise<'ignored' | 'duplicate' | 'processed'> {
    if (e.headerSeq !== undefined && e.headerSeq !== String(e.eventSeq))
      throw new AppError('INVALID_INPUT', { details: 'X-Event-Seq must match seq in the body' });
    if (e.type !== 'ORDER_STATUS_CHANGED' || e.toStatus !== 'DELIVERED') return 'ignored';
    const eventSeq = String(e.eventSeq);
    if (await this.repo.isEventProcessed(eventSeq)) return 'duplicate';
    try {
      return await this.apply(e, eventSeq);
    } catch (err) {
      // a different order took the same stock between our read and our write; read again once
      if (err instanceof AppError && err.code === 'STOCK_CHANGED') return this.apply(e, eventSeq);
      throw err;
    }
  }

  private async apply(e: DeliveredEvent, eventSeq: string): Promise<'duplicate' | 'processed'> {

    // one line per SKU, sorted so two orders never lock the same products in opposite order
    const wanted = new Map<string, number>();
    for (const { sku, quantity } of e.items) wanted.set(sku, (wanted.get(sku) ?? 0) + quantity);
    const note = `Order #${e.orderNumber} (Live Orders)`;
    const lines = [];
    for (const [sku, quantity] of [...wanted].sort(([a], [b]) => a.localeCompare(b))) {
      const product = await this.repo.findBySku(sku);
      if (!product) throw new AppError('PRODUCT_NOT_FOUND', { sku });
      product.move('OUT', quantity);
      const details = { quantity, note, quantityAfter: product.quantity };
      lines.push({ product, quantity, audit: { action: 'STOCK_OUT' as const, productId: product.id, details, actor: LIVE_ORDERS_ACTOR } });
    }
    return (await this.repo.saveOrderDelivery(eventSeq, note, lines)) ? 'processed' : 'duplicate';
  }
}
