import { randomUUID } from 'crypto';
import { PrismaUserRepository } from '../src/infra/prisma-user.repository';
import { PrismaService } from '../src/infra/prisma.service';

// Runs only with a real database (CI sets DATABASE_URL); the unit tests cover the rules without one.
const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('PrismaUserRepository on a real database', () => {
  let db: PrismaService;
  let repo: PrismaUserRepository;

  beforeAll(async () => {
    db = new PrismaService();
    repo = new PrismaUserRepository(db);
    await db.$connect();
  });

  beforeEach(async () => {
    await db.auditEntry.deleteMany();
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  const failure = (email: string) => ({ action: 'LOGIN_FAILED' as const, details: {}, actorId: null, actorEmail: email });

  it('counts failed sign-ins per email since a time, and ignores other actions and emails', async () => {
    await repo.record(failure('ana@example.com'));
    await repo.record(failure('ana@example.com'));
    await repo.record(failure('bob@example.com'));
    await repo.record({ action: 'LOGIN_SUCCEEDED', details: {}, actorId: randomUUID(), actorEmail: 'ana@example.com' });

    expect(await repo.countFailedLogins('ana@example.com', new Date(Date.now() - 60_000))).toBe(2);
    expect(await repo.countFailedLogins('ana@example.com', new Date(Date.now() + 60_000))).toBe(0);
  });

  it('deletes only failed sign-ins older than the cutoff', async () => {
    await repo.record(failure('old@example.com'));
    await db.auditEntry.updateMany({ data: { createdAt: new Date(Date.now() - 40 * 24 * 60 * 60_000) } });
    await repo.record(failure('new@example.com'));
    await repo.record({ action: 'LOGIN_SUCCEEDED', details: {}, actorId: randomUUID(), actorEmail: 'old@example.com' });

    await repo.deleteFailedLoginsBefore(new Date(Date.now() - 30 * 24 * 60 * 60_000));

    const rows = await db.auditEntry.findMany({ select: { action: true, actorEmail: true } });
    expect(rows.map((r) => `${r.action}:${r.actorEmail}`).sort()).toEqual(['LOGIN_FAILED:new@example.com', 'LOGIN_SUCCEEDED:old@example.com']);
  });
});
