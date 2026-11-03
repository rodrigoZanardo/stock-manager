import { MovementTotal, ProductMovement, StockProduct, StockReader } from '../src/application/stock-reader';

/** In-memory stand-in for the stock service. */
export class FakeStockReader extends StockReader {
  products: StockProduct[] = [];
  movements: ProductMovement[] = [];

  product(p: Partial<StockProduct> & Pick<StockProduct, 'id'>): StockProduct {
    const full: StockProduct = { sku: p.id.toUpperCase(), name: p.id, quantity: 0, minQuantity: 0, maxQuantity: null, status: 'OK', ...p };
    this.products.push(full);
    return full;
  }

  move(productId: string, type: 'IN' | 'OUT', quantity: number, createdAt: Date) {
    this.movements.push({ id: String(this.movements.length), productId, productName: productId, type, quantity, note: null, createdAt });
  }

  async findAll() {
    return this.products;
  }

  async findMovementsSince(since: Date) {
    return this.movements.filter((m) => m.createdAt >= since).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async movementTotals(since?: Date) {
    const totals = new Map<string, MovementTotal>();
    for (const m of this.movements.filter((m) => !since || m.createdAt >= since)) {
      const key = `${m.productId}:${m.type}`;
      const t = totals.get(key) ?? { productId: m.productId, type: m.type, quantity: 0 };
      t.quantity += m.quantity;
      totals.set(key, t);
    }
    return [...totals.values()];
  }
}
