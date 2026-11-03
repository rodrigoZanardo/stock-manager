import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AppErrorFilter } from './app-error.filter';
import { AuthGuard } from './auth.guard';
import { readKey } from './env';

/**
 * Imported by every service: verifies tokens with the auth service's public key (RS256)
 * and maps AppError to HTTP. Only the auth service holds the private key.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({ publicKey: readKey('JWT_PUBLIC_KEY_FILE', 'JWT_PUBLIC_KEY'), verifyOptions: { algorithms: ['RS256'] } }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AppErrorFilter },
  ],
})
export class CoreModule {}
