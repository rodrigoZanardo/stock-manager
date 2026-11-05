import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CoreModule, readKey, requireEnv } from '@stock/shared';
import {
  CreateUserUseCase,
  EnsureUserUseCase,
  ListAuditUseCase,
  ListUsersUseCase,
  LoginUseCase,
  PasswordHasher,
  TokenService,
  UserRepository,
} from './application/auth.use-cases';
import { AuthController } from './http/auth.controller';
import { JwtTokenService, ScryptPasswordHasher, tokenLifetime } from './infra/auth.services';
import { PrismaUserRepository } from './infra/prisma-user.repository';
import { PrismaService } from './infra/prisma.service';

const DEMO_ADMIN_PASSWORD = 'change-me-please';

@Module({
  imports: [
    CoreModule,
    // the only place that holds the private key: this service issues tokens, the others only verify them
    JwtModule.registerAsync({
      useFactory: () => ({
        privateKey: readKey('JWT_PRIVATE_KEY_FILE', 'JWT_PRIVATE_KEY'),
        // shortcut: a token stays valid until it expires, so a removed user keeps access for up to 8h; add a disabled flag checked by the guard when user removal exists
        signOptions: { algorithm: 'RS256', expiresIn: tokenLifetime(process.env.JWT_EXPIRES_IN ?? '8h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    PrismaService,
    { provide: UserRepository, useClass: PrismaUserRepository },
    { provide: PasswordHasher, useClass: ScryptPasswordHasher },
    { provide: TokenService, useClass: JwtTokenService },
    CreateUserUseCase,
    LoginUseCase,
    EnsureUserUseCase,
    ListAuditUseCase,
    ListUsersUseCase,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ensureUser: EnsureUserUseCase) {}

  async onApplicationBootstrap() {
    const adminPassword = requireEnv('ADMIN_PASSWORD');
    assertNotDemoPassword(adminPassword);
    await this.ensureUser.execute(requireEnv('ADMIN_EMAIL'), adminPassword, 'ADMIN');
    // optional: without VIEWER_EMAIL no viewer is created
    const viewerEmail = process.env.VIEWER_EMAIL;
    if (viewerEmail) {
      const viewerPassword = requireEnv('VIEWER_PASSWORD');
      assertNotDemoPassword(viewerPassword);
      await this.ensureUser.execute(viewerEmail, viewerPassword, 'VIEWER');
    }
    // optional public demo account: an OPERATOR, so visitors cannot manage users or products; its password is public on purpose
    const demoEmail = process.env.DEMO_EMAIL;
    if (demoEmail) await this.ensureUser.execute(demoEmail, requireEnv('DEMO_PASSWORD'), 'OPERATOR');
  }
}

/** The demo password is published in the README; anyone could sign in with it. */
function assertNotDemoPassword(password: string) {
  if (process.env.NODE_ENV === 'production' && password === DEMO_ADMIN_PASSWORD)
    throw new Error('A seeded password still has the demo value. Set real passwords before running in production.');
}
