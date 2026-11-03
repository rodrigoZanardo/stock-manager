// Creates the RS256 key pair for local runs: node scripts/dev-keys.mjs <privateDir> [publicDir]
// Only the auth service signs with private.pem; every other service verifies with public.pem.
// Keys are generated on each machine and never committed.
import { generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const privateDir = process.argv[2] ?? '.keys';
const publicDir = process.argv[3] ?? privateDir;
const privatePath = join(privateDir, 'private.pem');
const publicPath = join(publicDir, 'public.pem');

if (existsSync(privatePath) && existsSync(publicPath)) {
  console.log(`keys already in ${privateDir} and ${publicDir}`);
} else {
  mkdirSync(privateDir, { recursive: true });
  mkdirSync(publicDir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  writeFileSync(privatePath, privateKey, { mode: 0o600 });
  writeFileSync(publicPath, publicKey, { mode: 0o644 });
  console.log(`keys written to ${privateDir} (private) and ${publicDir} (public)`);
}
