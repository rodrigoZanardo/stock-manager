import 'reflect-metadata';
import { ValidationPipe, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Actor } from './auth.guard';
import { AppError } from './errors';

type LoggedRequest = { method: string; path: string; user?: Actor };
type LoggedResponse = { statusCode: number; on(event: 'finish', listener: () => void): void };

/** Same HTTP setup for every service: CORS, validation in the AppError format, Swagger at /docs, one JSON log line per request. */
export async function startService(module: Type<unknown>, title: string): Promise<void> {
  const app = await NestFactory.create(module);
  app.use((req: LoggedRequest, res: LoggedResponse, next: () => void) => {
    const start = Date.now();
    // only metadata: bodies, headers and query strings can carry passwords or tokens
    res.on('finish', () =>
      console.log(JSON.stringify({
        time: new Date().toISOString(), service: title, method: req.method, path: req.path,
        status: res.statusCode, ms: Date.now() - start, userId: req.user?.id ?? null,
      })),
    );
    next();
  });
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3030' });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) =>
        new AppError('INVALID_INPUT', { details: errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') }),
    }),
  );
  const doc = new DocumentBuilder().setTitle(title).setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  await app.listen(process.env.PORT ?? 3000);
}
