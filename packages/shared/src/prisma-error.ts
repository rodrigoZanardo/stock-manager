/**
 * True when a Prisma call failed with the given error code (P2002 unique violation, P2003 foreign key...).
 * Duck-typed because each service generates its own Prisma client, so there is no single class to check.
 */
export function hasPrismaCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && 'code' in e && e.code === code;
}
