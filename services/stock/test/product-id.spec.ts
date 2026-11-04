import { randomUUID } from 'crypto';
import { productId } from '../src/http/product.controller';

describe('product id in the URL', () => {
  it('answers PRODUCT_NOT_FOUND, in the API error format, when the id is not a UUID', async () => {
    await expect(productId.transform('not-a-uuid', { type: 'param' })).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND', kind: 'not_found' });
  });

  it('passes a UUID through unchanged', async () => {
    const id = randomUUID();
    await expect(productId.transform(id, { type: 'param' })).resolves.toBe(id);
  });
});
