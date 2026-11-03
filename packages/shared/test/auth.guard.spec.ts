import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync } from 'crypto';
import { AuthGuard, Public, Roles } from '../src/auth.guard';

const pem = () => generateKeyPairSync('rsa', { modulusLength: 2048, publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });

describe('AuthGuard (RS256, as configured by CoreModule)', () => {
  const keys = pem();
  // the auth service signs with the private key; every service verifies with the public key only
  const issuer = new JwtService({ privateKey: keys.privateKey, signOptions: { algorithm: 'RS256' } });
  const verifier = new JwtService({ publicKey: keys.publicKey, verifyOptions: { algorithms: ['RS256'] } });
  const guard = new AuthGuard(verifier, new Reflector());

  class Routes {
    @Public() open() {}
    any() {}
    @Roles('ADMIN') adminOnly() {}
  }

  const ctx = (handler: keyof Routes, authorization?: string, request: object = { headers: { authorization } }): ExecutionContext =>
    new ExecutionContextHost([request], Routes, Routes.prototype[handler]);
  const bearer = async (role: string) => `Bearer ${await issuer.signAsync({ sub: 'u1', role, email: 'ana@example.com' })}`;

  it('lets public routes through without a token', async () => {
    await expect(guard.canActivate(ctx('open'))).resolves.toBe(true);
  });

  it('rejects a missing token, a token from another key pair and an HS256 token', async () => {
    await expect(guard.canActivate(ctx('any'))).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    const other = new JwtService({ privateKey: pem().privateKey, signOptions: { algorithm: 'RS256' } });
    const forged = await other.signAsync({ sub: 'u1', role: 'ADMIN', email: 'a@b.co' });
    await expect(guard.canActivate(ctx('any', `Bearer ${forged}`))).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    const hs = await new JwtService({ secret: 'guess' }).signAsync({ sub: 'u1', role: 'ADMIN', email: 'a@b.co' });
    await expect(guard.canActivate(ctx('any', `Bearer ${hs}`))).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('rejects a validly signed token without an email or with an unknown role', async () => {
    const noEmail = await issuer.signAsync({ sub: 'u1', role: 'ADMIN' });
    await expect(guard.canActivate(ctx('any', `Bearer ${noEmail}`))).rejects.toMatchObject({ code: 'SESSION_INVALID' });
    await expect(guard.canActivate(ctx('any', await bearer('ROOT')))).rejects.toMatchObject({ code: 'SESSION_INVALID' });
  });

  it('allows an operator on normal routes but not on admin routes', async () => {
    await expect(guard.canActivate(ctx('any', await bearer('OPERATOR')))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('adminOnly', await bearer('OPERATOR')))).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(guard.canActivate(ctx('adminOnly', await bearer('ADMIN')))).resolves.toBe(true);
  });

  it('attaches the caller as request.user', async () => {
    const request: { headers: { authorization: string }; user?: unknown } = { headers: { authorization: await bearer('OPERATOR') } };
    await guard.canActivate(ctx('any', undefined, request));
    expect(request.user).toEqual({ id: 'u1', email: 'ana@example.com', role: 'OPERATOR' });
  });
});
