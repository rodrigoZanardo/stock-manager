import type { Actor } from '@stock/shared';
import {
  AuditRecord,
  CreateUserUseCase,
  EnsureUserUseCase,
  ListUsersUseCase,
  LoginUseCase,
  TokenPayload,
  TokenService,
  UserRepository,
} from '../src/application/auth.use-cases';
import { User } from '../src/domain/user';
import { ScryptPasswordHasher } from '../src/infra/auth.services';

class InMemoryUsers extends UserRepository {
  items: User[] = [];
  audit: AuditRecord[] = [];
  failures: { email: string | null; at: Date }[] = [];
  async findByEmail(email: string) { return this.items.find((u) => u.email === email) ?? null; }
  async findAll() {
    return this.items.map((u) => ({ id: u.id, email: u.email, role: u.role })).sort((a, b) => a.email.localeCompare(b.email));
  }
  async create(u: User, a: AuditRecord) { this.items.push(u); this.audit.push(a); }
  async record(a: AuditRecord) {
    this.audit.push(a);
    if (a.action === 'LOGIN_FAILED') this.failures.push({ email: a.actorEmail, at: new Date() });
  }
  async countFailedLogins(email: string, since: Date) {
    return this.failures.filter((f) => f.email === email && f.at >= since).length;
  }
  async deleteFailedLoginsBefore(before: Date) {
    this.failures = this.failures.filter((f) => f.at >= before);
  }
  async findAuditEntries(limit: number) {
    return this.audit.map((a, i) => ({ ...a, id: String(i), createdAt: new Date() })).reverse().slice(0, limit);
  }
}

class FakeTokens extends TokenService {
  async sign(p: TokenPayload) { return `${p.sub}|${p.role}|${p.email}`; }
}

const admin: Actor = { id: 'a1', email: 'admin@example.com', role: 'ADMIN' };

describe('users and login', () => {
  let repo: InMemoryUsers;
  let createUser: CreateUserUseCase;
  let login: LoginUseCase;

  beforeEach(() => {
    repo = new InMemoryUsers();
    const hasher = new ScryptPasswordHasher();
    createUser = new CreateUserUseCase(repo, hasher);
    login = new LoginUseCase(repo, hasher, new FakeTokens());
  });

  it('stores a normalized email and never the plain password', async () => {
    const u = await createUser.execute({ email: ' Ana@Example.com ', password: 'secret-123', role: 'OPERATOR' }, admin);
    expect(u.email).toBe('ana@example.com');
    expect(u.passwordHash).not.toContain('secret-123');
  });

  it('rejects a short password, a bad email and a duplicate email', async () => {
    await expect(createUser.execute({ email: 'a@b.co', password: '1234567', role: 'OPERATOR' }, admin)).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT', params: { min: 8 } });
    await expect(createUser.execute({ email: 'not-an-email', password: '12345678', role: 'OPERATOR' }, admin)).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
    await createUser.execute({ email: 'a@b.co', password: '12345678', role: 'OPERATOR' }, admin);
    await expect(createUser.execute({ email: 'A@B.CO', password: '12345678', role: 'ADMIN' }, admin)).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
  });

  it('logs in with the right password, case-insensitive email', async () => {
    const u = await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    await expect(login.execute({ email: 'ANA@example.com', password: 'secret-123' }))
      .resolves.toEqual({ accessToken: `${u.id}|ADMIN|ana@example.com`, role: 'ADMIN' });
  });

  it('verifies a password even for an unknown email, so timing does not reveal accounts', async () => {
    const verified: string[] = [];
    class SpyHasher extends ScryptPasswordHasher {
      async verify(password: string, hash: string) {
        verified.push(hash);
        return super.verify(password, hash);
      }
    }
    await expect(new LoginUseCase(repo, new SpyHasher(), new FakeTokens()).execute({ email: 'nobody@example.com', password: 'secret-123' }))
      .rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(verified).toHaveLength(1);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    await expect(login.execute({ email: 'ana@example.com', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', kind: 'unauthorized' });
    await expect(login.execute({ email: 'bob@example.com', password: 'secret-123' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS', kind: 'unauthorized' });
  });

  it('creates the first admin once and keeps it on restart', async () => {
    const ensure = new EnsureUserUseCase(repo, createUser);
    await ensure.execute('admin@example.com', 'change-me-please', 'ADMIN');
    await ensure.execute('Admin@example.com', 'change-me-please', 'ADMIN');
    expect(repo.items).toHaveLength(1);
    expect(repo.items[0]?.role).toBe('ADMIN');
  });

  it('seeds a viewer that signs in with the VIEWER role', async () => {
    await new EnsureUserUseCase(repo, createUser).execute('viewer@example.com', 'viewer-pass-1', 'VIEWER');
    await expect(login.execute({ email: 'viewer@example.com', password: 'viewer-pass-1' })).resolves.toMatchObject({ role: 'VIEWER' });
  });

  it('records who created a user, and no actor for the seeded first admin', async () => {
    await new EnsureUserUseCase(repo, createUser).execute('Root@example.com', 'change-me-please', 'ADMIN');
    await createUser.execute({ email: 'op@example.com', password: 'secret-123', role: 'OPERATOR' }, admin);
    expect(repo.audit).toEqual([
      { action: 'USER_CREATED', details: { email: 'root@example.com', role: 'ADMIN' }, actorId: null, actorEmail: null },
      { action: 'USER_CREATED', details: { email: 'op@example.com', role: 'OPERATOR' }, actorId: 'a1', actorEmail: 'admin@example.com' },
    ]);
  });

  it('records a successful login with the user and a failed one with the attempted email', async () => {
    const u = await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'OPERATOR' }, admin);
    await login.execute({ email: 'ANA@example.com', password: 'secret-123' });
    await expect(login.execute({ email: ' Bob@Example.com ', password: 'secret-123' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    await expect(login.execute({ email: 'ana@example.com', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(repo.audit.slice(1)).toEqual([
      { action: 'LOGIN_SUCCEEDED', details: {}, actorId: u.id, actorEmail: 'ana@example.com' },
      { action: 'LOGIN_FAILED', details: {}, actorId: null, actorEmail: 'bob@example.com' },
      { action: 'LOGIN_FAILED', details: {}, actorId: null, actorEmail: 'ana@example.com' },
    ]);
  });

  it('locks an account after 5 failed sign-ins, even with the right password, and only that account', async () => {
    await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    for (let i = 0; i < 5; i++) {
      await expect(login.execute({ email: 'ana@example.com', password: 'wrong-pass' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(login.execute({ email: 'ana@example.com', password: 'secret-123' })).rejects.toMatchObject({ code: 'TOO_MANY_ATTEMPTS', kind: 'too_many', params: { minutes: 15 } });
    await expect(new LoginUseCase(repo, new ScryptPasswordHasher(), new FakeTokens()).execute({ email: 'bob@example.com', password: 'x' })).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('unlocks an account once its failed sign-ins are 15 minutes old', async () => {
    await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    for (let i = 0; i < 5; i++) await login.execute({ email: 'ana@example.com', password: 'wrong-pass' }).catch(() => undefined);
    repo.failures.forEach((f) => { f.at = new Date(Date.now() - 16 * 60_000); });
    await expect(login.execute({ email: 'ana@example.com', password: 'secret-123' })).resolves.toMatchObject({ role: 'ADMIN' });
  });

  it('deletes failed sign-ins older than 30 days when a new one is recorded', async () => {
    await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    repo.failures.push({ email: 'old@example.com', at: new Date(Date.now() - 31 * 24 * 60 * 60_000) });
    await login.execute({ email: 'ana@example.com', password: 'wrong-pass' }).catch(() => undefined);
    expect(repo.failures.map((f) => f.email)).toEqual(['ana@example.com']);
  });

  it('lists the team by email, without password hashes', async () => {
    await createUser.execute({ email: 'zoe@example.com', password: 'secret-123', role: 'OPERATOR' }, admin);
    await createUser.execute({ email: 'ana@example.com', password: 'secret-123', role: 'ADMIN' }, admin);
    const users = await new ListUsersUseCase(repo).execute();
    expect(users.map((u) => u.email)).toEqual(['ana@example.com', 'zoe@example.com']);
    expect(JSON.stringify(users)).not.toContain('passwordHash');
  });

  it('records nothing when creating a user is rejected', async () => {
    await expect(createUser.execute({ email: 'not-an-email', password: '12345678', role: 'OPERATOR' }, admin)).rejects.toMatchObject({ code: 'EMAIL_INVALID' });
    expect(repo.audit).toEqual([]);
  });
});
