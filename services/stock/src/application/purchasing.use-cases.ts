import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError, type Actor } from '@stock/shared';
import { Product } from '../domain/product';
import { PurchaseItem, PurchaseOrder } from '../domain/purchase-order';
import { Supplier, SupplierDetails } from '../domain/supplier';
import { OrderLine, ProductRepository } from './product-repository';
import { PurchasingRepository } from './purchasing-repository';

const supplierDetails = (s: Supplier) => ({ name: s.name, document: s.document, email: s.email, phone: s.phone });

async function supplierOrThrow(repo: PurchasingRepository, id: string): Promise<Supplier> {
  const supplier = await repo.findSupplier(id);
  if (!supplier) throw new AppError('SUPPLIER_NOT_FOUND');
  return supplier;
}

async function orderOrThrow(repo: PurchasingRepository, id: string): Promise<PurchaseOrder> {
  const order = await repo.findOrder(id);
  if (!order) throw new AppError('PURCHASE_ORDER_NOT_FOUND');
  return order;
}

async function checkNameFree(repo: PurchasingRepository, supplier: Supplier) {
  const other = await repo.findSupplierByName(supplier.name);
  if (other && other.id !== supplier.id) throw new AppError('SUPPLIER_NAME_TAKEN', { name: supplier.name });
}

@Injectable()
export class CreateSupplierUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  async execute(input: SupplierDetails, actor: Actor): Promise<Supplier> {
    const supplier = Supplier.create({ id: randomUUID(), ...input });
    await checkNameFree(this.repo, supplier);
    await this.repo.createSupplier(supplier, { action: 'SUPPLIER_CREATED', productId: null, details: { id: supplier.id, ...supplierDetails(supplier) }, actor });
    return supplier;
  }
}

@Injectable()
export class ListSuppliersUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  execute() {
    return this.repo.findSuppliers();
  }
}

@Injectable()
export class UpdateSupplierUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  async execute(input: { id: string } & SupplierDetails, actor: Actor): Promise<Supplier> {
    const supplier = await supplierOrThrow(this.repo, input.id);
    const before = supplierDetails(supplier);
    supplier.update(input);
    await checkNameFree(this.repo, supplier);
    await this.repo.updateSupplier(supplier, { action: 'SUPPLIER_UPDATED', productId: null, details: { id: supplier.id, before, after: supplierDetails(supplier) }, actor });
    return supplier;
  }
}

@Injectable()
export class DeleteSupplierUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  async execute(id: string, actor: Actor): Promise<void> {
    const supplier = await supplierOrThrow(this.repo, id);
    await this.repo.deleteSupplier(id, { action: 'SUPPLIER_DELETED', productId: null, details: { id, name: supplier.name }, actor });
  }
}

export type ItemInput = { productId: string; quantity: number; unitCost: number };

/** Turns request lines into items, refusing unknown products. */
async function toItems(products: ProductRepository, lines: ItemInput[]): Promise<PurchaseItem[]> {
  const items: PurchaseItem[] = [];
  for (const l of lines) {
    const p = await products.findById(l.productId);
    if (!p) throw new AppError('PRODUCT_NOT_FOUND');
    items.push({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost, sku: p.sku, name: p.name });
  }
  return items;
}

const orderDetails = (o: PurchaseOrder) => ({
  id: o.id,
  number: o.number,
  supplier: o.supplierName,
  total: o.total,
  items: o.items.map((i) => ({ sku: i.sku, quantity: i.quantity, unitCost: i.unitCost })),
});

async function createDraft(repo: PurchasingRepository, supplierId: string, items: PurchaseItem[], actor: Actor): Promise<PurchaseOrder> {
  const supplier = await supplierOrThrow(repo, supplierId);
  const order = PurchaseOrder.create({ id: randomUUID(), supplierId, supplierName: supplier.name, items });
  return repo.createOrder(order, { action: 'PURCHASE_CREATED', productId: null, details: orderDetails(order), actor });
}

@Injectable()
export class CreatePurchaseOrderUseCase {
  constructor(private readonly repo: PurchasingRepository, private readonly products: ProductRepository) {}

  async execute(input: { supplierId: string; items: ItemInput[] }, actor: Actor): Promise<PurchaseOrder> {
    return createDraft(this.repo, input.supplierId, await toItems(this.products, input.items), actor);
  }
}

/** Units to buy so the product reaches its maximum (twice its minimum when it has none); 0 when available is not below the minimum. */
export function suggestedQuantity(p: Product): number {
  if (p.available >= p.minQuantity) return 0;
  return Math.max(0, (p.maxQuantity ?? p.minQuantity * 2) - p.quantity);
}

/** A DRAFT for the supplier with every product whose available units are below the minimum, at its last cost. */
@Injectable()
export class SuggestPurchaseOrderUseCase {
  constructor(private readonly repo: PurchasingRepository, private readonly products: ProductRepository) {}

  async execute(supplierId: string, actor: Actor): Promise<PurchaseOrder> {
    const items = (await this.products.findAll())
      .map((p) => ({ productId: p.id, sku: p.sku, name: p.name, quantity: suggestedQuantity(p), unitCost: p.cost ?? 0 }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) throw new AppError('PURCHASE_NOTHING_TO_SUGGEST');
    return createDraft(this.repo, supplierId, items, actor);
  }
}

@Injectable()
export class ListPurchaseOrdersUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  execute() {
    return this.repo.findOrders();
  }
}

@Injectable()
export class GetPurchaseOrderUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  execute(id: string) {
    return orderOrThrow(this.repo, id);
  }
}

@Injectable()
export class UpdatePurchaseOrderItemsUseCase {
  constructor(private readonly repo: PurchasingRepository, private readonly products: ProductRepository) {}

  async execute(input: { id: string; items: ItemInput[] }, actor: Actor): Promise<PurchaseOrder> {
    const order = await orderOrThrow(this.repo, input.id);
    order.replaceItems(await toItems(this.products, input.items));
    await this.repo.updateOrderItems(order, { action: 'PURCHASE_UPDATED', productId: null, details: orderDetails(order), actor });
    return order;
  }
}

/** send: DRAFT -> ORDERED; cancel: DRAFT or ORDERED -> CANCELLED. */
@Injectable()
export class ChangePurchaseOrderStatusUseCase {
  constructor(private readonly repo: PurchasingRepository) {}

  async execute(input: { id: string; change: 'send' | 'cancel' }, actor: Actor): Promise<PurchaseOrder> {
    const order = await orderOrThrow(this.repo, input.id);
    const from = order.status;
    if (input.change === 'send') order.send();
    else order.cancel();
    const action = input.change === 'send' ? 'PURCHASE_ORDERED' : 'PURCHASE_CANCELLED';
    await this.repo.changeOrderStatus(order, from, { action, productId: null, details: { id: order.id, number: order.number, supplier: order.supplierName }, actor });
    return order;
  }
}

/** Books every item into stock and sets each product's cost to what was paid. */
@Injectable()
export class ReceivePurchaseOrderUseCase {
  constructor(private readonly repo: PurchasingRepository, private readonly products: ProductRepository) {}

  async execute(id: string, actor: Actor): Promise<PurchaseOrder> {
    const order = await orderOrThrow(this.repo, id);
    order.receive();
    const note = `Pedido de compra #${order.number}`;
    const lines: OrderLine[] = [];
    for (const item of order.items) {
      const product = await this.products.findById(item.productId);
      if (!product) throw new AppError('PRODUCT_NOT_FOUND');
      product.move('IN', item.quantity);
      product.setCost(item.unitCost);
      const details = { quantity: item.quantity, note, quantityAfter: product.quantity, cost: item.unitCost };
      lines.push({ product, quantity: item.quantity, note, audit: { action: 'STOCK_IN', productId: product.id, details, actor } });
    }
    await this.repo.receiveOrder(order, lines, { action: 'PURCHASE_RECEIVED', productId: null, details: orderDetails(order), actor });
    return order;
  }
}
