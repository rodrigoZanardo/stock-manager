import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError, type Actor } from '@stock/shared';
import { MovementType, Product, ProductDetails } from '../domain/product';
import { AuditEntry, Movement, ProductRepository } from './product-repository';

@Injectable()
export class CreateProductUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(input: { sku: string } & ProductDetails, actor: Actor): Promise<Product> {
    const product = Product.create({ id: randomUUID(), ...input });
    if (await this.repo.findBySku(product.sku)) throw new AppError('SKU_TAKEN', { sku: product.sku });
    const details = { sku: product.sku, ...editable(product), quantity: product.quantity };
    await this.repo.create(product, { action: 'PRODUCT_CREATED', productId: product.id, details, actor });
    return product;
  }
}

@Injectable()
export class ListProductsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute() {
    return this.repo.findAll();
  }
}

const editable = (p: Product) => ({ name: p.name, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity });

async function getOrThrow(repo: ProductRepository, id: string): Promise<Product> {
  const product = await repo.findById(id);
  if (!product) throw new AppError('PRODUCT_NOT_FOUND');
  return product;
}

@Injectable()
export class GetProductUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute(id: string): Promise<Product> {
    return getOrThrow(this.repo, id);
  }
}

@Injectable()
export class UpdateProductUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(input: { id: string } & ProductDetails, actor: Actor): Promise<Product> {
    const product = await getOrThrow(this.repo, input.id);
    const before = editable(product);
    product.update(input);
    const details = { before, after: editable(product) };
    await this.repo.update(product, { action: 'PRODUCT_UPDATED', productId: product.id, details, actor });
    return product;
  }
}

@Injectable()
export class DeleteProductUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    const product = await getOrThrow(this.repo, id);
    // deleting would erase the audit trail of stock movements
    if (await this.repo.hasMovements(id)) throw new AppError('PRODUCT_HAS_MOVEMENTS');
    await this.repo.delete(id, { action: 'PRODUCT_DELETED', productId: id, details: { sku: product.sku, name: product.name }, actor });
  }
}

/** The product page shows the newest movements only; the whole history of a busy product would be too much for one page. */
export const HISTORY_LIMIT = 200;

@Injectable()
export class ListMovementsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(productId: string): Promise<Movement[]> {
    await getOrThrow(this.repo, productId);
    return this.repo.findMovements(productId, HISTORY_LIMIT);
  }
}

@Injectable()
export class RegisterMovementUseCase {
  constructor(private readonly repo: ProductRepository) {}

  async execute(input: { productId: string; type: MovementType; quantity: number; note?: string }, actor: Actor): Promise<Product> {
    const product = await getOrThrow(this.repo, input.productId);
    product.move(input.type, input.quantity);
    // shortcut: quantityAfter is this request's view; a concurrent IN on the same product can make it stale, read it back in the transaction if that matters
    const details = { quantity: input.quantity, note: input.note ?? null, quantityAfter: product.quantity };
    await this.repo.saveMovement(product, input, { action: input.type === 'IN' ? 'STOCK_IN' : 'STOCK_OUT', productId: product.id, details, actor });
    return product;
  }
}

/** Read side used by the reports service: every product's movements since a date, newest first. */
@Injectable()
export class ListRecentMovementsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute(since: Date) {
    return this.repo.findMovementsSince(since);
  }
}

/** Read side used by the reports service: summed quantity per product and type. */
@Injectable()
export class MovementTotalsUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute(since?: Date) {
    return this.repo.movementTotals(since);
  }
}

/** Admin view of who changed what, newest first. */
@Injectable()
export class ListAuditUseCase {
  constructor(private readonly repo: ProductRepository) {}

  execute(limit: number): Promise<AuditEntry[]> {
    return this.repo.findAuditEntries(limit);
  }
}
