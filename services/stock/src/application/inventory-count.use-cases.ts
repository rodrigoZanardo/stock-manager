import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError, type Actor } from '@stock/shared';
import { InventoryCount } from '../domain/inventory-count';
import { AdjustLine, InventoryCountRepository } from './inventory-count-repository';
import { ProductRepository } from './product-repository';

async function countOrThrow(repo: InventoryCountRepository, id: string): Promise<InventoryCount> {
  const count = await repo.findCount(id);
  if (!count) throw new AppError('INVENTORY_COUNT_NOT_FOUND');
  return count;
}

const countRef = (c: InventoryCount) => ({ id: c.id, number: c.number });

/** Snapshot of every product's current quantity. */
@Injectable()
export class StartInventoryCountUseCase {
  constructor(private readonly repo: InventoryCountRepository, private readonly products: ProductRepository) {}

  async execute(actor: Actor): Promise<InventoryCount> {
    const count = InventoryCount.start({ id: randomUUID(), products: await this.products.findAll() });
    return this.repo.createCount(count, { action: 'INVENTORY_STARTED', productId: null, details: { id: count.id, products: count.items.length }, actor });
  }
}

@Injectable()
export class ListInventoryCountsUseCase {
  constructor(private readonly repo: InventoryCountRepository) {}

  execute() {
    return this.repo.findCounts();
  }
}

@Injectable()
export class GetInventoryCountUseCase {
  constructor(private readonly repo: InventoryCountRepository) {}

  execute(id: string) {
    return countOrThrow(this.repo, id);
  }
}

/** Enters counted quantities for some or all products; refuses one below what is reserved for orders. */
@Injectable()
export class EnterCountedUseCase {
  constructor(private readonly repo: InventoryCountRepository, private readonly products: ProductRepository) {}

  async execute(input: { id: string; items: { productId: string; counted: number }[] }, actor: Actor): Promise<InventoryCount> {
    const count = await countOrThrow(this.repo, input.id);
    for (const l of input.items) {
      const product = await this.products.findById(l.productId);
      if (!product) throw new AppError('PRODUCT_NOT_FOUND');
      product.checkCounted(l.counted);
    }
    count.enter(input.items);
    const items = count.items.filter((i) => input.items.some((l) => l.productId === i.productId)).map((i) => ({ sku: i.sku, expected: i.expected, counted: i.counted }));
    await this.repo.saveCounted(count, { action: 'INVENTORY_COUNTED', productId: null, details: { ...countRef(count), items }, actor });
    return count;
  }
}

/** Sets every counted product to its counted quantity with an IN or OUT movement for the difference, in one transaction. */
@Injectable()
export class ApplyInventoryCountUseCase {
  constructor(private readonly repo: InventoryCountRepository, private readonly products: ProductRepository) {}

  async execute(id: string, actor: Actor): Promise<InventoryCount> {
    const count = await countOrThrow(this.repo, id);
    const note = `Inventário #${count.number}`;
    const lines: AdjustLine[] = [];
    for (const item of count.apply()) {
      const product = await this.products.findById(item.productId);
      if (!product) throw new AppError('PRODUCT_NOT_FOUND');
      const before = product.quantity;
      // shortcut: counted - current, not counted - expected; units moved after the count started are treated as already counted
      const movement = item.counted === null ? null : product.adjustTo(item.counted);
      if (!movement) continue;
      const details = { quantity: movement.quantity, note, quantityAfter: product.quantity };
      lines.push({ product, before, movement, note, audit: { action: movement.type === 'IN' ? 'STOCK_IN' : 'STOCK_OUT', productId: product.id, details, actor } });
    }
    await this.repo.applyCount(count, lines, { action: 'INVENTORY_APPLIED', productId: null, details: { ...countRef(count), adjusted: lines.length }, actor });
    return count;
  }
}

@Injectable()
export class CancelInventoryCountUseCase {
  constructor(private readonly repo: InventoryCountRepository) {}

  async execute(id: string, actor: Actor): Promise<InventoryCount> {
    const count = await countOrThrow(this.repo, id);
    count.cancel();
    await this.repo.cancelCount(count, { action: 'INVENTORY_CANCELLED', productId: null, details: countRef(count), actor });
    return count;
  }
}
