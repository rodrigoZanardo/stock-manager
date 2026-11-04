import { Body, Controller, Headers, HttpCode, Post, UseGuards, ValidationPipe } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProperty, ApiPropertyOptional, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponse, Public, invalidInput } from '@stock/shared';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ApplyOrderEventUseCase } from '../application/webhook.use-cases';
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
  @ApiProperty({ example: 42, description: 'Covered by the signature; the deduplication key' }) @IsInt() @Min(1) seq!: number;
  @ApiProperty({ example: 'ORDER_STATUS_CHANGED', description: 'ORDER_CREATED reserves, CANCELLED releases, DELIVERED releases and lowers the stock' }) @IsString() type!: string;
  @ApiProperty({ example: '4f1c2b7e-0d1a-4c5e-9f3b-2a6d8e1c0b94', description: 'Unique per order; reservations are kept by it' }) @IsString() @IsNotEmpty() orderId!: string;
  @ApiPropertyOptional({ example: 'DELIVERED' }) @IsOptional() @IsString() toStatus?: string;
  @ApiProperty({ type: OrderDto }) @ValidateNested() @Type(() => OrderDto) order!: OrderDto;
}

class ShortfallDto {
  @ApiProperty({ example: 'KB-001' }) sku!: string;
  @ApiProperty({ example: 5 }) requested!: number;
  @ApiProperty({ example: 2, description: 'What was reserved or taken out: what was left, or 0 for an unknown SKU' }) applied!: number;
}

class WebhookResponse {
  @ApiPropertyOptional({ description: 'The event changes no stock, or an ORDER_CREATED arrived after its order was closed; nothing was done' }) ignored?: true;
  @ApiPropertyOptional({ description: 'This X-Event-Seq was already processed, nothing was done' }) duplicate?: true;
  @ApiPropertyOptional({ description: 'Stock was reserved, released or lowered' }) processed?: true;
  @ApiPropertyOptional({ type: [ShortfallDto], description: 'Items with less stock than ordered, or unknown SKUs; sent only when there are any' })
  shortfalls?: ShortfallDto[];
}

/** Called by Live Orders, not by a user: no token, the HMAC signature is the credential. */
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhookController {
  constructor(private readonly orderEvent: ApplyOrderEventUseCase) {}

  @Public() // signed with LIVE_ORDERS_WEBHOOK_SECRET instead of a JWT
  @UseGuards(WebhookSignatureGuard)
  @Post('live-orders')
  @HttpCode(200)
  @ApiOperation({ summary: 'Live Orders event, once per seq: ORDER_CREATED reserves its SKUs, CANCELLED releases them, DELIVERED releases them and lowers the stock; short stock or an unknown SKU is recorded in shortfalls, not refused' })
  @ApiHeader({ name: 'X-Signature', description: 'sha256=<hex HMAC-SHA256 of "<X-Timestamp>.<raw body>">' })
  @ApiHeader({ name: 'X-Timestamp', description: 'Unix seconds; refused when more than 5 minutes off' })
  @ApiHeader({ name: 'X-Event-Seq', required: false, description: 'Optional; when sent it must equal seq in the body' })
  @ApiResponse({ status: 200, type: WebhookResponse })
  @ApiErrorResponse(400, 'Invalid body, or X-Event-Seq different from seq')
  @ApiErrorResponse(401, 'Signature missing or wrong, or timestamp too old')
  @ApiErrorResponse(503, 'LIVE_ORDERS_WEBHOOK_SECRET is not set')
  async liveOrders(
    // own pipe: the global one rejects unknown fields, and the event has many we do not use
    @Body(new ValidationPipe({ whitelist: true, exceptionFactory: invalidInput, expectedType: LiveOrdersEventDto })) event: Readonly<LiveOrdersEventDto>, // Readonly<> makes the design type Object, so the global strict pipe skips it
    @Headers('x-event-seq') headerSeq?: string,
  ): Promise<WebhookResponse> {
    const result = await this.orderEvent.execute({
      type: event.type,
      toStatus: event.toStatus,
      eventSeq: event.seq,
      headerSeq,
      orderId: event.orderId,
      orderNumber: event.order.number,
      items: event.order.items,
    });
    return typeof result === 'string' ? { [result]: true } : result;
  }
}
