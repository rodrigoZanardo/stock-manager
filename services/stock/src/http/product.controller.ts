import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { type Actor, CurrentUser, Roles } from '@stock/shared';
import {
  CreateProductUseCase,
  DeleteProductUseCase,
  GetProductUseCase,
  ListMovementsUseCase,
  ListProductsUseCase,
  RegisterMovementUseCase,
  UpdateProductUseCase,
} from '../application/product.use-cases';
import { Product } from '../domain/product';
import { CreateProductDto, MovementDto, MovementResponse, ProductResponse, UpdateProductDto } from './product.dto';

const toResponse = (p: Product): ProductResponse => ({
  id: p.id,
  sku: p.sku,
  name: p.name,
  quantity: p.quantity,
  minQuantity: p.minQuantity,
  maxQuantity: p.maxQuantity,
  status: p.status,
});

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
export class ProductController {
  constructor(
    private readonly createProduct: CreateProductUseCase,
    private readonly listProducts: ListProductsUseCase,
    private readonly getProduct: GetProductUseCase,
    private readonly updateProduct: UpdateProductUseCase,
    private readonly deleteProduct: DeleteProductUseCase,
    private readonly registerMovement: RegisterMovementUseCase,
    private readonly listMovements: ListMovementsUseCase,
  ) {}

  @Get()
  async list(): Promise<ProductResponse[]> {
    return (await this.listProducts.execute()).map(toResponse);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<ProductResponse> {
    return toResponse(await this.getProduct.execute(id));
  }

  @Roles('ADMIN')
  @Post()
  async create(@Body() dto: CreateProductDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.createProduct.execute(dto, actor));
  }

  @Roles('ADMIN')
  @Patch(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.updateProduct.execute({ id, ...dto }, actor));
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.deleteProduct.execute(id, actor);
  }

  @Get(':id/movements')
  movements(@Param('id', ParseUUIDPipe) id: string): Promise<MovementResponse[]> {
    return this.listMovements.execute(id);
  }

  @Post(':id/movements')
  async move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MovementDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.registerMovement.execute({ productId: id, ...dto }, actor));
  }
}
