import { ArgumentsHost } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { AppErrorFilter } from '../src/app-error.filter';
import { AppError, ErrorCode } from '../src/errors';

function capture(error: AppError) {
  const sent: { status?: number; body?: unknown } = {};
  const response = { status: (n: number) => ((sent.status = n), { json: (body: unknown) => { sent.body = body; } }) };
  const host: ArgumentsHost = new ExecutionContextHost([{}, response]);
  new AppErrorFilter().catch(error, host);
  return sent;
}

describe('AppErrorFilter', () => {
  it('sends code, message and params with the status of the kind', () => {
    expect(capture(new AppError('SKU_TAKEN', { sku: 'A-1' }))).toEqual({
      status: 400,
      body: { statusCode: 400, code: 'SKU_TAKEN', message: 'SKU A-1 already exists.', params: { sku: 'A-1' } },
    });
  });

  it.each<[ErrorCode, number]>([
    ['PRODUCT_NOT_FOUND', 404],
    ['INVALID_CREDENTIALS', 401],
    ['FORBIDDEN', 403],
    ['STOCK_UNAVAILABLE', 503],
  ])('%s -> %i', (code, status) => {
    expect(capture(new AppError(code)).status).toBe(status);
  });
});
