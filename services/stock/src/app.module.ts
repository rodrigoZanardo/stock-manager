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
import { AuditController } from './http/audit.controller';
import { MovementController } from './http/movement.controller';
import { ProductController } from './http/product.controller';
import { PrismaProductRepository } from './infra/prisma-product.repository';
import { PrismaService } from './infra/prisma.service';

@Module({
  imports: [CoreModule],
  controllers: [ProductController, MovementController, AuditController],
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
  ],
})
export class AppModule {}
