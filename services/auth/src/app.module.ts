import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CoreModule, readKey, requireEnv } from '@stock/shared';
import {
  CreateUserUseCase,
  EnsureAdminUseCase,
  ListAuditUseCase,
  ListUsersUseCase,
  LoginUseCase,
  PasswordHasher,
  TokenService,
  UserRepository,
} from './application/auth.use-cases';
import { AuthController } from './http/auth.controller';
import { JwtTokenService, ScryptPasswordHasher } from './infra/auth.services';
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
        signOptions: { algorithm: 'RS256', expiresIn: process.env.JWT_EXPIRES_IN ?? '8h' },
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
    EnsureAdminUseCase,
    ListAuditUseCase,
    ListUsersUseCase,
  ],
})
export class AppModule implements OnApplicationBootstrap {
  constructor(private readonly ensureAdmin: EnsureAdminUseCase) {}

  onApplicationBootstrap() {
    const password = requireEnv('ADMIN_PASSWORD');
    // the demo password is published in the README; anyone could sign in as admin with it
    if (process.env.NODE_ENV === 'production' && password === DEMO_ADMIN_PASSWORD)
      throw new Error('ADMIN_PASSWORD still has the demo value. Set a real password before running in production.');
    return this.ensureAdmin.execute(requireEnv('ADMIN_EMAIL'), password);
  }
}
