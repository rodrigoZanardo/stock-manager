import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError, DAY_MS, type Actor, type JsonObject } from '@stock/shared';
import { Role, User } from '../domain/user';

export const AUDIT_ACTIONS = ['USER_CREATED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED'] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** actorEmail without actorId: a failed login keeps the email that was tried. */
export type AuditRecord = { action: AuditAction; details: JsonObject; actorId: string | null; actorEmail: string | null };
export type AuditEntry = AuditRecord & { id: string; createdAt: Date };

export abstract class UserRepository {
  abstract findByEmail(email: string): Promise<User | null>;
  /** Stores the user and its USER_CREATED record atomically. */
  abstract create(user: User, audit: AuditRecord): Promise<void>;
  abstract record(audit: AuditRecord): Promise<void>;
  /** Failed sign-ins for this email since the given time. */
  abstract countFailedLogins(email: string, since: Date): Promise<number>;
  abstract deleteFailedLoginsBefore(before: Date): Promise<void>;
  /** Newest first. */
  abstract findAuditEntries(limit: number): Promise<AuditEntry[]>;
  /** Everyone, by email. Never includes password hashes. */
  abstract findAll(): Promise<{ id: string; email: string; role: Role }[]>;
}

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  abstract verify(password: string, hash: string): Promise<boolean>;
}

export type TokenPayload = { sub: string; role: Role; email: string };

export abstract class TokenService {
  abstract sign(payload: TokenPayload): Promise<string>;
}

@Injectable()
export class CreateUserUseCase {
  constructor(private readonly repo: UserRepository, private readonly hasher: PasswordHasher) {}

  /** `actor` is the admin creating the user; null only for the first admin seeded at startup. */
  async execute(input: { email: string; password: string; role: Role }, actor: Actor | null): Promise<User> {
    User.assertPassword(input.password);
    const passwordHash = await this.hasher.hash(input.password);
    const user = User.create({ id: randomUUID(), email: input.email, role: input.role, passwordHash });
    if (await this.repo.findByEmail(user.email)) throw new AppError('EMAIL_TAKEN', { email: user.email });
    await this.repo.create(user, {
      action: 'USER_CREATED', details: { email: user.email, role: user.role }, actorId: actor?.id ?? null, actorEmail: actor?.email ?? null,
    });
    return user;
  }
}

/** After this many failed sign-ins the account refuses every sign-in for LOCK_MINUTES, even with the right password. */
export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
/** Failed sign-in rows older than this are deleted, so the audit table does not grow forever. */
export const KEEP_FAILED_LOGINS_DAYS = 30;

/** Well-formed hash that matches no password: verifying it costs the same as verifying a real one. */
const UNKNOWN_USER_HASH = `${'0'.repeat(32)}:${'0'.repeat(128)}`;

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly repo: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: { email: string; password: string }): Promise<{ accessToken: string; role: Role }> {
    const email = User.normalizeEmail(input.email);
    // checked before the password, so a locked account does no hashing work and cannot be guessed while locked
    if (await this.repo.countFailedLogins(email, new Date(Date.now() - LOCK_MINUTES * 60_000)) >= MAX_FAILED_LOGINS)
      throw new AppError('TOO_MANY_ATTEMPTS', { minutes: LOCK_MINUTES });
    const user = await this.repo.findByEmail(email);
    // same message and same work for unknown email and wrong password: do not reveal which accounts exist
    const valid = await this.hasher.verify(input.password, user?.passwordHash ?? UNKNOWN_USER_HASH);
    if (!user || !valid) {
      await this.repo.record({ action: 'LOGIN_FAILED', details: {}, actorId: null, actorEmail: email });
      await this.repo.deleteFailedLoginsBefore(new Date(Date.now() - KEEP_FAILED_LOGINS_DAYS * DAY_MS));
      throw new AppError('INVALID_CREDENTIALS');
    }
    await this.repo.record({ action: 'LOGIN_SUCCEEDED', details: {}, actorId: user.id, actorEmail: user.email });
    return { accessToken: await this.tokens.sign({ sub: user.id, role: user.role, email: user.email }), role: user.role };
  }
}

/** Creates a user from env vars at startup (the first admin, or a viewer), so a fresh database works without open sign-up. */
@Injectable()
export class EnsureUserUseCase {
  constructor(private readonly repo: UserRepository, private readonly createUser: CreateUserUseCase) {}

  async execute(email: string, password: string, role: Role): Promise<void> {
    if (await this.repo.findByEmail(User.normalizeEmail(email))) return;
    await this.createUser.execute({ email, password, role }, null);
  }
}

/** Admin view of the team. */
@Injectable()
export class ListUsersUseCase {
  constructor(private readonly repo: UserRepository) {}

  execute() {
    return this.repo.findAll();
  }
}

/** Admin view of sign-ins and user creation, newest first. */
@Injectable()
export class ListAuditUseCase {
  constructor(private readonly repo: UserRepository) {}

  execute(limit: number): Promise<AuditEntry[]> {
    return this.repo.findAuditEntries(limit);
  }
}
