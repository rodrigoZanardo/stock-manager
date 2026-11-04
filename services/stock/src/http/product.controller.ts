import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, ApiErrorResponse, AppError, CurrentUser, Roles } from '@stock/shared';
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

/** A malformed id cannot match a product: answer like a missing one, in the API error format. */
export const productId = new ParseUUIDPipe({ exceptionFactory: () => new AppError('PRODUCT_NOT_FOUND') });

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
  @ApiOperation({ summary: 'List products with their stock status, by name' })
  @ApiResponse({ status: 200, type: [ProductResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(): Promise<ProductResponse[]> {
    return (await this.listProducts.execute()).map(toResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one product' })
  @ApiResponse({ status: 200, type: ProductResponse })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(404, 'Product not found')
  async get(@Param('id', productId) id: string): Promise<ProductResponse> {
    return toResponse(await this.getProduct.execute(id));
  }

  @Roles('ADMIN')
  @Post()
  @ApiOperation({ summary: 'Create a product with zero stock (admin only)' })
  @ApiResponse({ status: 201, type: ProductResponse, description: 'Product created' })
  @ApiErrorResponse(400, 'Invalid input, or the SKU is already used')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  async create(@Body() dto: CreateProductDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.createProduct.execute(dto, actor));
  }

  @Roles('ADMIN')
  @Patch(':id')
  @ApiOperation({ summary: 'Change name and minimum or maximum (admin only). The SKU and the quantity do not change here.' })
  @ApiResponse({ status: 200, type: ProductResponse })
  @ApiErrorResponse(400, 'Invalid input, or the maximum is not above the minimum')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  @ApiErrorResponse(404, 'Product not found')
  async update(@Param('id', productId) id: string, @Body() dto: UpdateProductDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.updateProduct.execute({ id, ...dto }, actor));
  }

  @Roles('ADMIN')
  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a product that has no stock movements (admin only)' })
  @ApiResponse({ status: 204, description: 'Deleted' })
  @ApiErrorResponse(400, 'The product has stock movements, so it cannot be deleted')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  @ApiErrorResponse(404, 'Product not found')
  remove(@Param('id', productId) id: string, @CurrentUser() actor: Actor): Promise<void> {
    return this.deleteProduct.execute(id, actor);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Get(':id/movements')
  @ApiOperation({ summary: 'Movement history of a product, newest first, at most 200 entries (not for viewers)' })
  @ApiResponse({ status: 200, type: [MovementResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Product not found')
  movements(@Param('id', productId) id: string): Promise<MovementResponse[]> {
    return this.listMovements.execute(id);
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/movements')
  @ApiOperation({ summary: 'Register a stock movement: IN adds units, OUT removes them (admin or operator)' })
  @ApiResponse({ status: 201, type: ProductResponse, description: 'Movement registered; returns the product with its new quantity' })
  @ApiErrorResponse(400, 'Quantity is not a whole number above zero, there is not enough stock, or the stock changed while saving')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Product not found')
  async move(@Param('id', productId) id: string, @Body() dto: MovementDto, @CurrentUser() actor: Actor): Promise<ProductResponse> {
    return toResponse(await this.registerMovement.execute({ productId: id, ...dto }, actor));
  }
}
