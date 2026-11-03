import { CanActivate, ExecutionContext, Injectable, SetMetadata, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppError } from './errors';
import { isRole, type Role } from './contract';

const PUBLIC = 'public';
const ROLES = 'roles';
export const Public = () => SetMetadata(PUBLIC, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

/** Who is calling, taken from the verified token. */
export type Actor = { id: string; email: string; role: Role };

type AuthRequest = { headers: { authorization?: string }; user?: Actor };

/** Global guard: every route needs a valid token unless marked @Public(). Attaches the caller as `request.user`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, targets)) return true;

    const request = ctx.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) throw new AppError('SESSION_INVALID');

    let payload: { sub?: unknown; email?: unknown; role?: unknown };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new AppError('SESSION_INVALID');
    }
    const { sub, email, role } = payload;
    // tokens issued before the email was added to the payload are rejected: the user signs in again
    if (typeof sub !== 'string' || typeof email !== 'string' || typeof role !== 'string' || !isRole(role))
      throw new AppError('SESSION_INVALID');

    const allowed = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES, targets);
    if (allowed && !allowed.includes(role)) throw new AppError('FORBIDDEN');
    request.user = { id: sub, email, role };
    return true;
  }
}

/** The Actor the AuthGuard attached. Only valid on routes that are not @Public(). */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const user = ctx.switchToHttp().getRequest<AuthRequest>().user;
  if (!user) throw new AppError('SESSION_INVALID');
  return user;
});
