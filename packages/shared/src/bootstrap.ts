import 'reflect-metadata';
import { ValidationPipe, type Type, type ValidationError } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { Actor } from './auth.guard';
import { AppError } from './errors';

type LoggedRequest = { method: string; path: string; user?: Actor };
type LoggedResponse = { statusCode: number; on(event: 'finish', listener: () => void): void };

/** Turns class-validator failures into the INVALID_INPUT error; also for routes that build their own ValidationPipe. */
export const invalidInput = (errors: ValidationError[]) =>
  new AppError('INVALID_INPUT', { details: errors.flatMap((e) => Object.values(e.constraints ?? {})).join('; ') });

/** Same HTTP setup for every service: CORS, validation in the AppError format, Swagger at /docs, one JSON log line per request. */
export async function startService(module: Type<unknown>, title: string): Promise<void> {
  const app = await NestFactory.create(module, { rawBody: true }); // rawBody only keeps a copy of the bytes (req.rawBody); parsing is unchanged
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
      exceptionFactory: invalidInput,
    }),
  );
  const doc = new DocumentBuilder().setTitle(title).setVersion('1.0').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));
  await app.listen(process.env.PORT ?? 3000);
}
