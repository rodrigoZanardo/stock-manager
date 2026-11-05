import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, ApiErrorResponse, AppError, CurrentUser, Roles } from '@stock/shared';
import {
  ChangePurchaseOrderStatusUseCase,
  CreatePurchaseOrderUseCase,
  GetPurchaseOrderUseCase,
  ListPurchaseOrdersUseCase,
  ReceivePurchaseOrderUseCase,
  SuggestPurchaseOrderUseCase,
  UpdatePurchaseOrderItemsUseCase,
} from '../application/purchasing.use-cases';
import { PurchaseOrder } from '../domain/purchase-order';
import { CreatePurchaseOrderDto, PurchaseItemsDto, PurchaseOrderResponse, SuggestPurchaseOrderDto } from './purchasing.dto';

const orderId = new ParseUUIDPipe({ exceptionFactory: () => new AppError('PURCHASE_ORDER_NOT_FOUND') });
const toResponse = (o: PurchaseOrder): PurchaseOrderResponse => ({
  id: o.id,
  number: o.number,
  supplierId: o.supplierId,
  supplierName: o.supplierName,
  status: o.status,
  items: o.items.map((i) => ({ ...i })),
  total: o.total,
  createdAt: o.createdAt,
});

@ApiTags('purchase-orders')
@ApiBearerAuth()
@Controller('purchase-orders')
export class PurchaseOrderController {
  constructor(
    private readonly createOrder: CreatePurchaseOrderUseCase,
    private readonly suggestOrder: SuggestPurchaseOrderUseCase,
    private readonly listOrders: ListPurchaseOrdersUseCase,
    private readonly getOrder: GetPurchaseOrderUseCase,
    private readonly updateItems: UpdatePurchaseOrderItemsUseCase,
    private readonly changeStatus: ChangePurchaseOrderStatusUseCase,
    private readonly receiveOrder: ReceivePurchaseOrderUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List purchase orders, newest first' })
  @ApiResponse({ status: 200, type: [PurchaseOrderResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(): Promise<PurchaseOrderResponse[]> {
    return (await this.listOrders.execute()).map(toResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one purchase order' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponse })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(404, 'Purchase order not found')
  async get(@Param('id', orderId) id: string): Promise<PurchaseOrderResponse> {
    return toResponse(await this.getOrder.execute(id));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  @ApiOperation({ summary: 'Create a DRAFT purchase order (admin or operator)' })
  @ApiResponse({ status: 201, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'Invalid input, no items, a repeated product, or an invalid quantity or cost')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Supplier or product not found')
  async create(@Body() dto: CreatePurchaseOrderDto, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.createOrder.execute(dto, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post('suggest')
  @ApiOperation({ summary: 'Create a DRAFT with every product whose available units are below the minimum, up to the maximum (admin or operator)' })
  @ApiResponse({ status: 201, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'No product is below its minimum')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Supplier not found')
  async suggest(@Body() dto: SuggestPurchaseOrderDto, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.suggestOrder.execute(dto.supplierId, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch(':id')
  @ApiOperation({ summary: 'Replace the items of a DRAFT (admin or operator)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'The order is not a draft, or the items are invalid')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Purchase order or product not found')
  async update(@Param('id', orderId) id: string, @Body() dto: PurchaseItemsDto, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.updateItems.execute({ id, items: dto.items }, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/send')
  @HttpCode(200)
  @ApiOperation({ summary: 'DRAFT -> ORDERED (admin or operator)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'The order is not a draft')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Purchase order not found')
  async send(@Param('id', orderId) id: string, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.changeStatus.execute({ id, change: 'send' }, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'DRAFT or ORDERED -> CANCELLED (admin or operator)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'The order is already received or cancelled')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Purchase order not found')
  async cancel(@Param('id', orderId) id: string, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.changeStatus.execute({ id, change: 'cancel' }, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/receive')
  @HttpCode(200)
  @ApiOperation({ summary: 'ORDERED -> RECEIVED: books an IN movement per item and sets each product cost, in one transaction (admin or operator)' })
  @ApiResponse({ status: 200, type: PurchaseOrderResponse })
  @ApiErrorResponse(400, 'The order is not ORDERED (for example, already received)')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Purchase order not found')
  async receive(@Param('id', orderId) id: string, @CurrentUser() actor: Actor): Promise<PurchaseOrderResponse> {
    return toResponse(await this.receiveOrder.execute(id, actor));
  }
}
