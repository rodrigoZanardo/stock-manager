import { Injectable } from '@nestjs/common';
import { AppError, hasPrismaCode, isJsonObject, isOneOf, isRole } from '@stock/shared';
import { AUDIT_ACTIONS, AuditRecord, UserRepository } from '../application/auth.use-cases';
import { User } from '../domain/user';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaUserRepository extends UserRepository {
  constructor(private readonly db: PrismaService) {
    super();
  }

  async findByEmail(email: string) {
    const r = await this.db.user.findUnique({ where: { email } });
    if (!r) return null;
    if (!isRole(r.role)) throw new Error(`Unknown role in database: ${r.role}`);
    return User.restore({ id: r.id, email: r.email, passwordHash: r.passwordHash, role: r.role });
  }

  async create(u: User, audit: AuditRecord) {
    try {
      await this.db.$transaction([
        this.db.user.create({ data: { id: u.id, email: u.email, passwordHash: u.passwordHash, role: u.role } }),
        this.db.auditEntry.create({ data: audit }),
      ]);
    } catch (e) {
      // two requests with the same email can both pass the use case's check; the unique index decides
      if (hasPrismaCode(e, 'P2002')) throw new AppError('EMAIL_TAKEN', { email: u.email });
      throw e;
    }
  }

  async record(audit: AuditRecord) {
    await this.db.auditEntry.create({ data: audit });
  }

  async countFailedLogins(email: string, since: Date) {
    return this.db.auditEntry.count({ where: { action: 'LOGIN_FAILED', actorEmail: email, createdAt: { gte: since } } });
  }

  async deleteFailedLoginsBefore(before: Date) {
    await this.db.auditEntry.deleteMany({ where: { action: 'LOGIN_FAILED', createdAt: { lt: before } } });
  }

  async findAll() {
    const rows = await this.db.user.findMany({ select: { id: true, email: true, role: true }, orderBy: { email: 'asc' } });
    return rows.map((r) => {
      if (!isRole(r.role)) throw new Error(`Unknown role in database: ${r.role}`);
      return { id: r.id, email: r.email, role: r.role };
    });
  }

  async findAuditEntries(limit: number) {
    const rows = await this.db.auditEntry.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(({ id, action, details, actorId, actorEmail, createdAt }) => {
      if (!isOneOf(AUDIT_ACTIONS, action) || !isJsonObject(details)) throw new Error(`Corrupted audit entry in database: ${id}`);
      return { id, action, details, actorId, actorEmail, createdAt };
    });
  }
}
