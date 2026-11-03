import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { AppError, ErrorKind } from './errors';

const STATUS: Record<ErrorKind, HttpStatus> = {
  rule: HttpStatus.BAD_REQUEST,
  not_found: HttpStatus.NOT_FOUND,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  too_many: HttpStatus.TOO_MANY_REQUESTS,
  unavailable: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Global: turns any AppError into `{ statusCode, code, message, params }`. Other errors keep Nest's default handling. */
@Catch(AppError)
export class AppErrorFilter implements ExceptionFilter {
  catch(e: AppError, host: ArgumentsHost) {
    const statusCode = STATUS[e.kind];
    host.switchToHttp().getResponse<{ status(n: number): { json(body: unknown): void } }>()
      .status(statusCode)
      .json({ statusCode, code: e.code, message: e.message, params: e.params });
  }
}
