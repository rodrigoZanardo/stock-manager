import { AppError, type MovementType, type StockStatus } from '@stock/shared';

export type { MovementType, StockStatus };



/** What an admin can edit. `maxQuantity: null` means no upper limit. */
export type ProductDetails = { name: string; minQuantity: number; maxQuantity?: number | null };

type ProductProps = { id: string; sku: string; name: string; quantity: number; minQuantity: number; maxQuantity: number | null };

/** Stock rules live here, not in the controller or the database. */
export class Product {
  private constructor(private props: ProductProps) {}

  static create(input: { id: string; sku: string } & ProductDetails): Product {
    const sku = input.sku.trim().toUpperCase();
    if (!/^[A-Z0-9-]{3,32}$/.test(sku)) throw new AppError('SKU_INVALID');
    return new Product({ id: input.id, sku, quantity: 0, ...validDetails(input) });
  }

  /** SKU and quantity are not editable: quantity only changes through movements. Omitting the maximum keeps it; null removes it. */
  update(input: ProductDetails): void {
    // check the value, not the key: validated DTOs carry optional fields as present-but-undefined
    const maxQuantity = input.maxQuantity === undefined ? this.props.maxQuantity : input.maxQuantity;
    Object.assign(this.props, validDetails({ ...input, maxQuantity }));
  }

  static restore(props: ProductProps): Product {
    return new Product({ ...props });
  }

  get id() { return this.props.id; }
  get sku() { return this.props.sku; }
  get name() { return this.props.name; }
  get quantity() { return this.props.quantity; }
  get minQuantity() { return this.props.minQuantity; }
  get maxQuantity() { return this.props.maxQuantity; }
  get isLowStock() { return this.props.quantity <= this.props.minQuantity; }
  get status(): StockStatus {
    if (this.isLowStock) return 'LOW';
    return this.props.maxQuantity !== null && this.props.quantity > this.props.maxQuantity ? 'OVER' : 'OK';
  }

  move(type: MovementType, quantity: number): void {
    if (!Number.isInteger(quantity) || quantity <= 0) throw new AppError('QUANTITY_INVALID');
    if (type === 'OUT' && quantity > this.props.quantity)
      throw new AppError('NOT_ENOUGH_STOCK', { available: this.props.quantity, requested: quantity });
    this.props.quantity += type === 'IN' ? quantity : -quantity;
  }
}

function validDetails(input: ProductDetails) {
  const name = input.name.trim();
  const maxQuantity = input.maxQuantity ?? null;
  if (!name) throw new AppError('PRODUCT_NAME_REQUIRED');
  if (!Number.isInteger(input.minQuantity) || input.minQuantity < 0) throw new AppError('MIN_QUANTITY_INVALID');
  if (maxQuantity !== null && (!Number.isInteger(maxQuantity) || maxQuantity <= input.minQuantity))
    throw new AppError('MAX_QUANTITY_INVALID', { min: input.minQuantity });
  return { name, minQuantity: input.minQuantity, maxQuantity };
}
