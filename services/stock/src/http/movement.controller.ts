import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { MOVEMENT_TYPES, type MovementType } from '@stock/shared';
import { IsISO8601, IsOptional } from 'class-validator';
import { ListRecentMovementsUseCase, MovementTotalsUseCase } from '../application/product.use-cases';
import { MovementResponse } from './product.dto';

class SinceQuery {
  @ApiProperty({ example: '2026-10-21T00:00:00Z' }) @IsISO8601() since!: string;
}

class OptionalSinceQuery {
  @ApiPropertyOptional({ example: '2026-10-04T00:00:00Z' }) @IsOptional() @IsISO8601() since?: string;
}

class ProductMovementResponse extends MovementResponse {
  @ApiProperty() productId!: string;
  @ApiProperty() productName!: string;
}

class MovementTotalResponse {
  @ApiProperty() productId!: string;
  @ApiProperty({ enum: MOVEMENT_TYPES }) type!: MovementType;
  @ApiProperty() quantity!: number;
}

/** Read-only endpoints for the reports service. Same token and roles as every other route. */
@ApiTags('movements')
@ApiBearerAuth()
@Controller('movements')
export class MovementController {
  constructor(private readonly recent: ListRecentMovementsUseCase, private readonly totals: MovementTotalsUseCase) {}

  @Get()
  list(@Query() query: SinceQuery): Promise<ProductMovementResponse[]> {
    return this.recent.execute(new Date(query.since));
  }

  @Get('totals')
  sum(@Query() query: OptionalSinceQuery): Promise<MovementTotalResponse[]> {
    return this.totals.execute(query.since ? new Date(query.since) : undefined);
  }
}
