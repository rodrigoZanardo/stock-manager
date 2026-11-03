import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse, AuditQuery, Roles } from '@stock/shared';
import { AUDIT_ACTIONS, type AuditAction } from '../application/product-repository';
import { ListAuditUseCase } from '../application/product.use-cases';

class AuditEntryResponse {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: AUDIT_ACTIONS }) action!: AuditAction;
  @ApiProperty({ type: String, nullable: true, description: 'Kept after the product is deleted.' }) productId!: string | null;
  @ApiProperty({ type: Object, example: { before: { name: 'Keyboard' }, after: { name: 'Wireless keyboard' } } }) details!: object;
  @ApiProperty() actorEmail!: string;
  @ApiProperty() createdAt!: Date;
}

@ApiTags('audit')
@ApiBearerAuth()
@Controller('audit/stock')
export class AuditController {
  constructor(private readonly audit: ListAuditUseCase) {}

  @Roles('ADMIN')
  @Get()
  @ApiOperation({ summary: 'Stock write history, newest first (admin only)' })
  @ApiResponse({ status: 200, type: [AuditEntryResponse] })
  @ApiErrorResponse(400, 'The limit is not a whole number from 1 to 200')
  @ApiErrorResponse(401, 'Missing or expired token')
  @ApiErrorResponse(403, 'The caller is not an admin')
  list(@Query() query: AuditQuery): Promise<AuditEntryResponse[]> {
    return this.audit.execute(query.limit);
  }
}
