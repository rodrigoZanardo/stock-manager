import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma';

/** One database connection pool shared by every repository. */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  onModuleDestroy() {
    return this.$disconnect();
  }
}
