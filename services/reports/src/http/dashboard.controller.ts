import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse, MOVEMENT_TYPES, type MovementType } from '@stock/shared';
import { GetDashboardUseCase } from '../application/dashboard.use-case';

class DailyTotals {
  @ApiProperty({ example: '2026-11-03' }) date!: string;
  @ApiProperty() in!: number;
  @ApiProperty() out!: number;
}

class RecentMovement {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: MOVEMENT_TYPES }) type!: MovementType;
  @ApiProperty() quantity!: number;
  @ApiProperty({ type: String, nullable: true }) note!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
}

class DashboardResponse {
  @ApiProperty() totalProducts!: number;
  @ApiProperty() lowStockProducts!: number;
  @ApiProperty() totalUnits!: number;
  @ApiProperty({ type: [DailyTotals] }) daily!: DailyTotals[];
  @ApiProperty({ type: [RecentMovement] }) recent!: RecentMovement[];
}

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: GetDashboardUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard numbers and the last 14 days of stock in and out (any role)' })
  @ApiResponse({ status: 200, type: DashboardResponse })
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(503, 'The stock service is unavailable')
  get(): Promise<DashboardResponse> {
    return this.dashboard.execute();
  }
}
