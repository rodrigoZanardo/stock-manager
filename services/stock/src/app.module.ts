import { Module } from '@nestjs/common';
import { CoreModule } from '@stock/shared';
import { ProductRepository } from './application/product-repository';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListAuditUseCase,
  ListMovementsUseCase,
  ListProductsUseCase,
  ListRecentMovementsUseCase,
  MovementTotalsUseCase,
  RegisterMovementUseCase,
  UpdateProductUseCase,
} from './application/product.use-cases';
import { InventoryCountRepository } from './application/inventory-count-repository';
import {
  ApplyInventoryCountUseCase,
  CancelInventoryCountUseCase,
  EnterCountedUseCase,
  GetInventoryCountUseCase,
  ListInventoryCountsUseCase,
  StartInventoryCountUseCase,
} from './application/inventory-count.use-cases';
import { PurchasingRepository } from './application/purchasing-repository';
import {
  ChangePurchaseOrderStatusUseCase,
  CreatePurchaseOrderUseCase,
  CreateSupplierUseCase,
  DeleteSupplierUseCase,
  GetPurchaseOrderUseCase,
  ListPurchaseOrdersUseCase,
  ListSuppliersUseCase,
  ReceivePurchaseOrderUseCase,
  SuggestPurchaseOrderUseCase,
  UpdatePurchaseOrderItemsUseCase,
  UpdateSupplierUseCase,
} from './application/purchasing.use-cases';
import { ApplyOrderEventUseCase } from './application/webhook.use-cases';
import { AuditController } from './http/audit.controller';
import { InventoryCountController } from './http/inventory-count.controller';
import { MovementController } from './http/movement.controller';
import { ProductController } from './http/product.controller';
import { PurchaseOrderController } from './http/purchase-order.controller';
import { SupplierController } from './http/supplier.controller';
import { WebhookController } from './http/webhook.controller';
import { PrismaInventoryCountRepository } from './infra/prisma-inventory-count.repository';
import { PrismaProductRepository } from './infra/prisma-product.repository';
import { PrismaPurchasingRepository } from './infra/prisma-purchasing.repository';
import { PrismaService } from './infra/prisma.service';

@Module({
  imports: [CoreModule],
  controllers: [ProductController, MovementController, AuditController, WebhookController, SupplierController, PurchaseOrderController, InventoryCountController],
  providers: [
    PrismaService,
    { provide: ProductRepository, useClass: PrismaProductRepository },
    CreateProductUseCase,
    ListProductsUseCase,
    GetProductUseCase,
    UpdateProductUseCase,
    DeleteProductUseCase,
    RegisterMovementUseCase,
    ListMovementsUseCase,
    ListRecentMovementsUseCase,
    MovementTotalsUseCase,
    ListAuditUseCase,
    ApplyOrderEventUseCase,
    { provide: PurchasingRepository, useClass: PrismaPurchasingRepository },
    CreateSupplierUseCase,
    ListSuppliersUseCase,
    UpdateSupplierUseCase,
    DeleteSupplierUseCase,
    CreatePurchaseOrderUseCase,
    SuggestPurchaseOrderUseCase,
    ListPurchaseOrdersUseCase,
    GetPurchaseOrderUseCase,
    UpdatePurchaseOrderItemsUseCase,
    ChangePurchaseOrderStatusUseCase,
    ReceivePurchaseOrderUseCase,
    { provide: InventoryCountRepository, useClass: PrismaInventoryCountRepository },
    StartInventoryCountUseCase,
    ListInventoryCountsUseCase,
    GetInventoryCountUseCase,
    EnterCountedUseCase,
    ApplyInventoryCountUseCase,
    CancelInventoryCountUseCase,
  ],
})
export class AppModule {}
