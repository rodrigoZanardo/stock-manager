import { AppError } from '../src/errors';

describe('AppError', () => {
  it('fills placeholders, keeps unknown ones visible, and renders 0', () => {
    expect(new AppError('SKU_TAKEN', { sku: 'KB-1' }).message).toBe('SKU KB-1 already exists.');
    expect(new AppError('SKU_TAKEN').message).toBe('SKU {sku} already exists.');
    expect(new AppError('NOT_ENOUGH_STOCK', { available: 0, requested: 3 }).message).toBe('Not enough stock: 0 available, 3 requested.');
  });

  it('carries the kind used for the HTTP status', () => {
    expect(new AppError('PRODUCT_NOT_FOUND').kind).toBe('not_found');
  });
});
