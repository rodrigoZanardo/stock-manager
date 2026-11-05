import { PurchaseOrder, PurchaseStatus } from '../domain/purchase-order';
import { Supplier } from '../domain/supplier';
import { AuditRecord, OrderLine } from './product-repository';

/** Port for suppliers and purchase orders. Every write also stores its audit record atomically. */
export abstract class PurchasingRepository {
  abstract findSupplier(id: string): Promise<Supplier | null>;
  abstract findSupplierByName(name: string): Promise<Supplier | null>;
  /** By name. */
  abstract findSuppliers(): Promise<Supplier[]>;
  /** SUPPLIER_NAME_TAKEN when the unique index refuses the name. */
  abstract createSupplier(supplier: Supplier, audit: AuditRecord): Promise<void>;
  abstract updateSupplier(supplier: Supplier, audit: AuditRecord): Promise<void>;
  /** SUPPLIER_HAS_ORDERS when a purchase order points to it. */
  abstract deleteSupplier(id: string, audit: AuditRecord): Promise<void>;

  abstract findOrder(id: string): Promise<PurchaseOrder | null>;
  /** Newest first. */
  abstract findOrders(): Promise<PurchaseOrder[]>;
  /** Assigns the next number and returns the stored order; the audit details get that `number` added. */
  abstract createOrder(order: PurchaseOrder, audit: AuditRecord): Promise<PurchaseOrder>;
  /** Only while the stored order is still DRAFT, else PURCHASE_ORDER_STATUS. */
  abstract updateOrderItems(order: PurchaseOrder, audit: AuditRecord): Promise<void>;
  /** Saves the new status only if the stored one is still `from`, else PURCHASE_ORDER_STATUS. */
  abstract changeOrderStatus(order: PurchaseOrder, from: PurchaseStatus, audit: AuditRecord): Promise<void>;
  /** One transaction: ORDERED -> RECEIVED (else PURCHASE_ORDER_STATUS), then an IN movement and the new cost for every line. */
  abstract receiveOrder(order: PurchaseOrder, lines: OrderLine[], audit: AuditRecord): Promise<void>;
}
