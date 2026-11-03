import { ScryptPasswordHasher } from '../src/infra/auth.services';

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('verifies the right password, rejects a wrong one, and salts every hash', async () => {
    const hash = await hasher.hash('pw12345678');
    await expect(hasher.verify('pw12345678', hash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-pass', hash)).resolves.toBe(false);
    expect(await hasher.hash('pw12345678')).not.toBe(hash);
  });

  it.each(['', 'abc', 'salt:', 'salt:zz', 'salt:abc'])('returns false, never throws, for a malformed stored hash %p', async (stored) => {
    await expect(hasher.verify('x', stored)).resolves.toBe(false);
  });
});
