import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readKey } from '../src/env';

describe('readKey', () => {
  const saved = { ...process.env };

  afterEach(() => {
    process.env = { ...saved };
  });

  it('reads the key from the value variable, turning escaped line breaks back into new lines', () => {
    process.env.TEST_KEY = '-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----';
    delete process.env.TEST_KEY_FILE;
    expect(readKey('TEST_KEY_FILE', 'TEST_KEY')).toBe('-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----');
  });

  it('reads the key from the file when the value variable is not set', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'key-')), 'public.pem');
    writeFileSync(path, 'from-file');
    process.env.TEST_KEY_FILE = path;
    delete process.env.TEST_KEY;
    expect(readKey('TEST_KEY_FILE', 'TEST_KEY')).toBe('from-file');
  });

  it('fails when neither the value nor the file is configured', () => {
    delete process.env.TEST_KEY;
    delete process.env.TEST_KEY_FILE;
    expect(() => readKey('TEST_KEY_FILE', 'TEST_KEY')).toThrow('Missing environment variable TEST_KEY_FILE');
  });
});
