import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Roles, STOCK_STATUSES, type StockStatus } from '@stock/shared';
import { IsIn } from 'class-validator';
import { AnalyzeInventoryUseCase, GetInventoryUseCase, InventoryAdvisor, InventoryRow, USAGE_WINDOW_DAYS } from '../application/inventory.use-case';

class InventoryRowResponse {
  @ApiProperty() productId!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() name!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() minQuantity!: number;
  @ApiProperty({ type: Number, nullable: true }) maxQuantity!: number | null;
  @ApiProperty({ enum: STOCK_STATUSES }) status!: StockStatus;
  @ApiProperty() totalIn!: number;
  @ApiProperty() totalOut!: number;
  @ApiProperty({ description: `Units out per day, last ${USAGE_WINDOW_DAYS} days` }) avgDailyOut!: number;
  @ApiProperty({ type: Number, nullable: true }) daysOfCover!: number | null;
  @ApiProperty() suggestedQuantity!: number;
  @ApiProperty() reorderQuantity!: number;
}

class InventoryResponse {
  @ApiProperty({ description: 'Whether AI analysis is available on this server' }) aiEnabled!: boolean;
  @ApiProperty({ type: [InventoryRowResponse] }) rows!: InventoryRow[];
}

class AnalyzeDto {
  @ApiProperty({ enum: ['en', 'pt'] }) @IsIn(['en', 'pt']) locale!: 'en' | 'pt';
}

class AnalysisResponse {
  @ApiProperty() analysis!: string;
  @ApiProperty() generatedAt!: Date;
}

@ApiTags('inventory')
@ApiBearerAuth()
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: GetInventoryUseCase,
    private readonly analyzer: AnalyzeInventoryUseCase,
    private readonly advisor: InventoryAdvisor,
  ) {}

  @Get()
  async get(): Promise<InventoryResponse> {
    return { aiEnabled: this.advisor.enabled, rows: await this.inventory.execute() };
  }

  /** Admin only: every call spends API tokens. */
  @Roles('ADMIN')
  @Post('analysis')
  @HttpCode(200)
  analyze(@Body() dto: AnalyzeDto): Promise<AnalysisResponse> {
    return this.analyzer.execute(dto.locale);
  }
}
