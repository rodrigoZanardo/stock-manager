import { Body, Controller, Headers, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse, Public, invalidInput } from '@stock/shared';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApplyDeliveredOrderUseCase } from '../application/webhook.use-cases';
import { WebhookSignatureGuard } from './webhook-signature.guard';

class OrderItemDto {
  @ApiProperty({ example: 'KB-001' }) @IsString() @IsNotEmpty() sku!: string;
  @ApiProperty({ example: 'Mechanical keyboard' }) @IsString() name!: string;
  @ApiProperty({ example: 2 }) @IsInt() @Min(1) quantity!: number;
}

class OrderDto {
  @ApiProperty({ example: 7 }) @IsInt() number!: number;
  @ApiProperty({ type: [OrderItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => OrderItemDto) items!: OrderItemDto[];
}

/** Only the fields we use; the rest of the Live Orders event is dropped, not rejected. */
class LiveOrdersEventDto {
  @ApiProperty({ example: 'ORDER_STATUS_CHANGED' }) @IsString() type!: string;
  @ApiPropertyOptional({ example: 'DELIVERED' }) @IsOptional() @IsString() toStatus?: string;
  @ApiProperty({ type: OrderDto }) @ValidateNested() @Type(() => OrderDto) order!: OrderDto;
}

class WebhookResponse {
  @ApiPropertyOptional({ description: 'The event is not a delivery, nothing was done' }) ignored?: true;
  @ApiPropertyOptional({ description: 'This X-Event-Seq was already processed, nothing was done' }) duplicate?: true;
  @ApiPropertyOptional({ description: 'Stock was lowered' }) processed?: true;
}

/** Called by Live Orders, not by a user: no token, the HMAC signature is the credential. */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly delivered: ApplyDeliveredOrderUseCase) {}

  @Public() // signed with LIVE_ORDERS_WEBHOOK_SECRET instead of a JWT
  @UseGuards(WebhookSignatureGuard)
  @Post('live-orders')
  @HttpCode(200)
  @ApiOperation({ summary: 'Live Orders event: a delivered order lowers the stock of its SKUs, once per event' })
  @ApiHeader({ name: 'X-Signature', description: 'sha256=<hex HMAC-SHA256 of "<X-Timestamp>.<raw body>">' })
  @ApiHeader({ name: 'X-Timestamp', description: 'Unix seconds; refused when more than 5 minutes off' })
  @ApiHeader({ name: 'X-Event-Seq', description: 'Event sequence number; the same value again changes nothing' })
  @ApiResponse({ status: 200, type: WebhookResponse })
  @ApiErrorResponse(400, 'Invalid body or X-Event-Seq, or not enough stock')
  @ApiErrorResponse(401, 'Signature missing or wrong, or timestamp too old')
  @ApiErrorResponse(404, 'An item SKU is not a product')
  @ApiErrorResponse(503, 'LIVE_ORDERS_WEBHOOK_SECRET is not set')
  async liveOrders(
    // own pipe: the global one rejects unknown fields, and the event has many we do not use
    @Body(new ValidationPipe({ whitelist: true, exceptionFactory: invalidInput, expectedType: LiveOrdersEventDto })) event: LiveOrdersEventDto,
    @Headers('x-event-seq') eventSeq?: string,
  ): Promise<WebhookResponse> {
    const result = await this.delivered.execute({
      type: event.type,
      toStatus: event.toStatus,
      eventSeq,
      orderNumber: event.order.number,
      items: event.order.items,
    });
    return { [result]: true };
  }
}
