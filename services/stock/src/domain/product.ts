import { AppError, type MovementType, type StockStatus } from '@stock/shared';

export type { MovementType, StockStatus };

/** What an admin can edit. `maxQuantity: null` means no upper limit; `location: null` (or empty) means no bin location. Money is in cents. */
export type ProductDetails = { name: string; minQuantity: number; maxQuantity?: number | null; location?: string | null; price?: number | null; cost?: number | null };

/** Highest price or cost in cents: R$ 100.000,00. */
export const MAX_CENTS = 10_000_000;

/** `reserved`: units promised to open Live Orders orders; still on the shelf, but not free to take. */
type ProductProps = { id: string; sku: string; name: string; quantity: number; reserved: number; minQuantity: number; maxQuantity: number | null; location: string | null; price: number | null; cost: number | null };

/** Stock rules live here, not in the controller or the database. */
export class Product {
  private constructor(private props: ProductProps) {}

  static create(input: { id: string; sku: string } & ProductDetails): Product {
    const sku = input.sku.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(sku)) throw new AppError('SKU_INVALID');
    return new Product({ id: input.id, sku, quantity: 0, reserved: 0, ...validDetails(input) });
  }

  /** SKU and quantity are not editable: quantity only changes through movements. Omitting the maximum or location keeps it; null removes it. */
  update(input: ProductDetails): void {
    // check the value, not the key: validated DTOs carry optional fields as present-but-undefined
    const maxQuantity = input.maxQuantity === undefined ? this.props.maxQuantity : input.maxQuantity;
    const location = input.location === undefined ? this.props.location : input.location;
    const price = input.price === undefined ? this.props.price : input.price;
    const cost = input.cost === undefined ? this.props.cost : input.cost;
    Object.assign(this.props, validDetails({ ...input, maxQuantity, location, price, cost }));
  }

  static restore(props: ProductProps): Product {
    return new Product({ ...props });
  }

  get id() { return this.props.id; }
  get sku() { return this.props.sku; }
  get name() { return this.props.name; }
  get quantity() { return this.props.quantity; }
  get reserved() { return this.props.reserved; }
  /** Never below zero: a delivery may take reserved units of other orders when the shelf is short. */
  get available() { return Math.max(0, this.props.quantity - this.props.reserved); }
  get minQuantity() { return this.props.minQuantity; }
  get maxQuantity() { return this.props.maxQuantity; }
  get location() { return this.props.location; }
  get price() { return this.props.price; }
  get cost() { return this.props.cost; }
  // physical quantity on purpose: reserved units are still on the shelf, and a cancel gives them back, so restocking follows what is there
  get isLowStock() { return this.props.quantity <= this.props.minQuantity; }
  get status(): StockStatus {
    if (this.isLowStock) return 'LOW';
    return this.props.maxQuantity !== null && this.props.quantity > this.props.maxQuantity ? 'OVER' : 'OK';
  }

  /** A user's movement: OUT may not take units reserved for orders. */
  move(type: MovementType, quantity: number): void {
    checkQuantity(quantity);
    if (type === 'OUT' && quantity > this.available)
      throw new AppError('NOT_ENOUGH_STOCK', { available: this.available, requested: quantity });
    this.props.quantity += type === 'IN' ? quantity : -quantity;
  }

  /** A delivered order: the goods already left, so only the physical stock limits it. Call release() for its own reservation first. */
  ship(quantity: number): void {
    checkQuantity(quantity);
    if (quantity > this.props.quantity) throw new AppError('NOT_ENOUGH_STOCK', { available: this.props.quantity, requested: quantity });
    this.props.quantity -= quantity;
  }

  reserve(quantity: number): void {
    checkQuantity(quantity);
    if (quantity > this.available) throw new AppError('NOT_ENOUGH_STOCK', { available: this.available, requested: quantity });
    this.props.reserved += quantity;
  }

  /** A received purchase sets the last purchase cost. */
  setCost(cost: number): void {
    this.props.cost = validCents(cost, 'COST_INVALID');
  }

  /** A stock count may not leave fewer units than are held for orders. */
  checkCounted(counted: number): void {
    if (!Number.isInteger(counted) || counted < 0) throw new AppError('COUNTED_INVALID');
    if (counted < this.props.reserved) throw new AppError('COUNTED_BELOW_RESERVED', { counted, reserved: this.props.reserved });
  }

  /** Sets the quantity to what was counted; returns the movement that books the difference, or null when there is none. */
  adjustTo(counted: number): { type: MovementType; quantity: number } | null {
    this.checkCounted(counted);
    const difference = counted - this.props.quantity;
    this.props.quantity = counted;
    if (difference === 0) return null;
    return { type: difference > 0 ? 'IN' : 'OUT', quantity: Math.abs(difference) };
  }

  release(quantity: number): void {
    this.props.reserved = Math.max(0, this.props.reserved - quantity);
  }
}

function checkQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError('QUANTITY_INVALID');
}

function validDetails(input: ProductDetails) {
  const name = input.name.trim();
  const maxQuantity = input.maxQuantity ?? null;
  if (!name) throw new AppError('PRODUCT_NAME_REQUIRED');
  if (!Number.isInteger(input.minQuantity) || input.minQuantity < 0) throw new AppError('MIN_QUANTITY_INVALID');
  if (maxQuantity !== null && (!Number.isInteger(maxQuantity) || maxQuantity <= input.minQuantity))
    throw new AppError('MAX_QUANTITY_INVALID', { min: input.minQuantity });
  const price = input.price == null ? null : validCents(input.price, 'PRICE_INVALID');
  const cost = input.cost == null ? null : validCents(input.cost, 'COST_INVALID');
  return { name, minQuantity: input.minQuantity, maxQuantity, location: validLocation(input.location), price, cost };
}

function validCents(value: number, code: 'PRICE_INVALID' | 'COST_INVALID'): number {
  if (!Number.isInteger(value) || value < 0 || value > MAX_CENTS) throw new AppError(code, { max: MAX_CENTS });
  return value;
}

/** Bin location R<street>-B<block>-A<floor>-P<position>-N<level>, e.g. R01-B03-A04-P060-N1. Empty means none. */
function validLocation(location: string | null | undefined): string | null {
  const value = location?.trim().toUpperCase();
  if (!value) return null;
  if (!/^R\d{2}-B\d{2}-A\d{2}-P\d{3}-N\d$/.test(value)) throw new AppError('PRODUCT_LOCATION_INVALID');
  return value;
}
