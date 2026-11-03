import { ApiProperty, ApiResponse } from '@nestjs/swagger';

/** The body of every error the API returns (see AppErrorFilter). `code` is what clients translate. */
export class ErrorResponse {
  @ApiProperty({ example: 400 }) statusCode!: number;
  @ApiProperty({ example: 'NOT_ENOUGH_STOCK' }) code!: string;
  @ApiProperty({ example: 'Not enough stock: 10 available, 99 requested.' }) message!: string;
  @ApiProperty({ type: Object, example: { available: 10, requested: 99 } }) params!: Record<string, string | number>;
}

/** One documented error response for a status code; the body is always ErrorResponse. */
export const ApiErrorResponse = (status: number, description: string) => ApiResponse({ status, description, type: ErrorResponse });
