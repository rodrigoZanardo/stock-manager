import { AppError } from '@stock/shared';

export const COUNT_STATUSES = ['OPEN', 'APPLIED', 'CANCELLED'] as const;
export type CountStatus = (typeof COUNT_STATUSES)[number];

/** `expected` is the quantity when the count started; `counted` is null until someone enters it. sku, name and location are for display. */
export type CountItem = { productId: string; sku: string; name: string; location: string | null; expected: number; counted: number | null };
type InventoryCountProps = { id: string; number: number; status: CountStatus; items: CountItem[]; createdAt: Date };

/** OPEN -> APPLIED once, or OPEN -> CANCELLED. Counted quantities change only while OPEN. */
export class InventoryCount {
  private constructor(private props: InventoryCountProps) {}

  /** Snapshot of every product's quantity. `number` is 0 until the database assigns the sequence. */
  static start(input: { id: string; products: { id: string; sku: string; name: string; location: string | null; quantity: number }[] }): InventoryCount {
    if (input.products.length === 0) throw new AppError('INVENTORY_COUNT_EMPTY');
    const items = input.products.map((p) => ({ productId: p.id, sku: p.sku, name: p.name, location: p.location, expected: p.quantity, counted: null }));
    return new InventoryCount({ id: input.id, number: 0, status: 'OPEN', items, createdAt: new Date() });
  }

  static restore(props: InventoryCountProps): InventoryCount {
    return new InventoryCount({ ...props, items: props.items.map((i) => ({ ...i })) });
  }

  get id() { return this.props.id; }
  get number() { return this.props.number; }
  get status() { return this.props.status; }
  get items(): readonly CountItem[] { return this.props.items; }
  get createdAt() { return this.props.createdAt; }

  /** Sets the counted quantity of products in this count; the others keep theirs. The reserved-stock check is on Product.checkCounted. */
  enter(lines: { productId: string; counted: number }[]): void {
    this.expect('OPEN');
    for (const l of lines) {
      const item = this.props.items.find((i) => i.productId === l.productId);
      if (!item) throw new AppError('PRODUCT_NOT_FOUND');
      item.counted = l.counted;
    }
  }

  /** Only counted products are adjusted; a count with nothing entered would change nothing. */
  apply(): CountItem[] {
    this.expect('OPEN');
    const counted = this.props.items.filter((i) => i.counted !== null);
    if (counted.length === 0) throw new AppError('INVENTORY_NOTHING_COUNTED');
    this.props.status = 'APPLIED';
    return counted;
  }

  cancel(): void {
    this.expect('OPEN');
    this.props.status = 'CANCELLED';
  }

  private expect(status: CountStatus) {
    if (this.props.status !== status) throw new AppError('INVENTORY_COUNT_STATUS', { status: this.props.status });
  }
}
