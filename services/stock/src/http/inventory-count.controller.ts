import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { type Actor, ApiErrorResponse, AppError, CurrentUser, Roles } from '@stock/shared';
import {
  ApplyInventoryCountUseCase,
  CancelInventoryCountUseCase,
  EnterCountedUseCase,
  GetInventoryCountUseCase,
  ListInventoryCountsUseCase,
  StartInventoryCountUseCase,
} from '../application/inventory-count.use-cases';
import { InventoryCount } from '../domain/inventory-count';
import { CountedItemsDto, InventoryCountResponse } from './inventory-count.dto';

const countId = new ParseUUIDPipe({ exceptionFactory: () => new AppError('INVENTORY_COUNT_NOT_FOUND') });
const toResponse = (c: InventoryCount): InventoryCountResponse => ({
  id: c.id,
  number: c.number,
  status: c.status,
  items: c.items.map((i) => ({ ...i, difference: i.counted === null ? null : i.counted - i.expected })),
  createdAt: c.createdAt,
});

@ApiTags('inventory-counts')
@ApiBearerAuth()
@Controller('inventory-counts')
export class InventoryCountController {
  constructor(
    private readonly startCount: StartInventoryCountUseCase,
    private readonly listCounts: ListInventoryCountsUseCase,
    private readonly getCount: GetInventoryCountUseCase,
    private readonly enterCounted: EnterCountedUseCase,
    private readonly applyCount: ApplyInventoryCountUseCase,
    private readonly cancelCount: CancelInventoryCountUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List inventory counts, newest first' })
  @ApiResponse({ status: 200, type: [InventoryCountResponse] })
  @ApiErrorResponse(401, 'Missing or expired token')
  async list(): Promise<InventoryCountResponse[]> {
    return (await this.listCounts.execute()).map(toResponse);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one inventory count with expected, counted and difference per product' })
  @ApiResponse({ status: 200, type: InventoryCountResponse })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(404, 'Inventory count not found')
  async get(@Param('id', countId) id: string): Promise<InventoryCountResponse> {
    return toResponse(await this.getCount.execute(id));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post()
  @ApiOperation({ summary: 'Start an OPEN count with a snapshot of every product quantity (admin or operator)' })
  @ApiResponse({ status: 201, type: InventoryCountResponse })
  @ApiErrorResponse(400, 'There are no products')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  async start(@CurrentUser() actor: Actor): Promise<InventoryCountResponse> {
    return toResponse(await this.startCount.execute(actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Patch(':id')
  @ApiOperation({ summary: 'Enter counted quantities for some or all products of an OPEN count (admin or operator)' })
  @ApiResponse({ status: 200, type: InventoryCountResponse })
  @ApiErrorResponse(400, 'The count is closed, or a counted quantity is invalid or below the reserved units')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Inventory count or product not found')
  async enter(@Param('id', countId) id: string, @Body() dto: CountedItemsDto, @CurrentUser() actor: Actor): Promise<InventoryCountResponse> {
    return toResponse(await this.enterCounted.execute({ id, items: dto.items }, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/apply')
  @HttpCode(200)
  @ApiOperation({ summary: 'OPEN -> APPLIED: sets each counted product to its count with an IN or OUT movement "Inventário #N", in one transaction (admin or operator)' })
  @ApiResponse({ status: 200, type: InventoryCountResponse })
  @ApiErrorResponse(400, 'The count is closed, nothing was counted, a count is below the reserved units, or stock changed while applying')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Inventory count not found')
  async apply(@Param('id', countId) id: string, @CurrentUser() actor: Actor): Promise<InventoryCountResponse> {
    return toResponse(await this.applyCount.execute(id, actor));
  }

  @Roles('ADMIN', 'OPERATOR')
  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'OPEN -> CANCELLED without changing stock (admin or operator)' })
  @ApiResponse({ status: 200, type: InventoryCountResponse })
  @ApiErrorResponse(400, 'The count is already applied or cancelled')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is a viewer')
  @ApiErrorResponse(404, 'Inventory count not found')
  async cancel(@Param('id', countId) id: string, @CurrentUser() actor: Actor): Promise<InventoryCountResponse> {
    return toResponse(await this.cancelCount.execute(id, actor));
  }
}
