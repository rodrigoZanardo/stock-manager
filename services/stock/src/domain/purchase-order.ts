import { AppError } from '@stock/shared';
import { MAX_CENTS } from './product';

export const PURCHASE_STATUSES = ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

/** `sku` and `name` are copies for display; the rules only use productId, quantity and unitCost (cents). */
export type PurchaseItem = { productId: string; sku: string; name: string; quantity: number; unitCost: number };
type PurchaseOrderProps = { id: string; number: number; supplierId: string; supplierName: string; status: PurchaseStatus; items: PurchaseItem[]; createdAt: Date };

/** DRAFT -> ORDERED -> RECEIVED; DRAFT or ORDERED -> CANCELLED. Items change only in DRAFT. */
export class PurchaseOrder {
  private constructor(private props: PurchaseOrderProps) {}

  /** `number` is 0 until the database assigns the sequence. */
  static create(input: { id: string; supplierId: string; supplierName: string; items: PurchaseItem[] }): PurchaseOrder {
    return new PurchaseOrder({ ...input, number: 0, status: 'DRAFT', items: validItems(input.items), createdAt: new Date() });
  }

  static restore(props: PurchaseOrderProps): PurchaseOrder {
    return new PurchaseOrder({ ...props, items: [...props.items] });
  }

  get id() { return this.props.id; }
  get number() { return this.props.number; }
  get supplierId() { return this.props.supplierId; }
  get supplierName() { return this.props.supplierName; }
  get status() { return this.props.status; }
  get items(): readonly PurchaseItem[] { return this.props.items; }
  get createdAt() { return this.props.createdAt; }
  get total() { return this.props.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0); }

  replaceItems(items: PurchaseItem[]): void {
    this.expect('DRAFT');
    this.props.items = validItems(items);
  }

  send(): void {
    this.expect('DRAFT');
    this.props.status = 'ORDERED';
  }

  receive(): void {
    this.expect('ORDERED');
    this.props.status = 'RECEIVED';
  }

  cancel(): void {
    if (this.props.status !== 'ORDERED') this.expect('DRAFT');
    this.props.status = 'CANCELLED';
  }

  private expect(status: PurchaseStatus) {
    if (this.props.status !== status) throw new AppError('PURCHASE_ORDER_STATUS', { status: this.props.status });
  }
}

function validItems(items: PurchaseItem[]): PurchaseItem[] {
  if (items.length === 0) throw new AppError('PURCHASE_ORDER_EMPTY');
  if (new Set(items.map((i) => i.productId)).size !== items.length) throw new AppError('PURCHASE_ORDER_DUPLICATE_ITEM');
  for (const i of items) {
    if (!Number.isInteger(i.quantity) || i.quantity <= 0) throw new AppError('QUANTITY_INVALID');
    if (!Number.isInteger(i.unitCost) || i.unitCost < 0 || i.unitCost > MAX_CENTS) throw new AppError('COST_INVALID', { max: MAX_CENTS });
  }
  return [...items];
}
