import { Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { PasswordHasher, TokenPayload, TokenService } from '../application/auth.use-cases';

type Lifetime = NonNullable<JwtSignOptions['expiresIn']>;

/** JWT_EXPIRES_IN as jsonwebtoken accepts it ("8h", "30m", "3600"); a typo fails at startup instead of on every login. */
export function tokenLifetime(value: string): Lifetime {
  if (!isLifetime(value)) throw new Error(`JWT_EXPIRES_IN must look like 8h, 30m or 3600, got "${value}"`);
  return value;
}

function isLifetime(value: string): value is Extract<Lifetime, string> {
  return /^\d+(\.\d+)?\s?(ms|s|m|h|d|w|y)?$/i.test(value);
}

function scryptAsync(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, keylen, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** scrypt from Node's crypto: no native dependency. Stored as "salt:hash". */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(password: string) {
    const salt = randomBytes(16).toString('hex');
    return `${salt}:${(await scryptAsync(password, salt, 64)).toString('hex')}`;
  }

  async verify(password: string, stored: string) {
    const [salt, hash] = stored.split(':');
    if (!salt || !hash) return false;
    const expected = Buffer.from(hash, 'hex');
    // a corrupted row decodes to an empty buffer; scrypt rejects a zero-length key, so fail the login instead of a 500
    if (expected.length === 0) return false;
    return timingSafeEqual(await scryptAsync(password, salt, expected.length), expected);
  }
}

@Injectable()
export class JwtTokenService extends TokenService {
  constructor(private readonly jwt: JwtService) {
    super();
  }

  sign(payload: TokenPayload) {
    return this.jwt.signAsync(payload);
  }
}
