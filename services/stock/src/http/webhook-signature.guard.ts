import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { AppError } from '@stock/shared';
import { verifyWebhook } from '../domain/webhook-signature';

type WebhookRequest = { headers: Record<string, string | string[] | undefined>; rawBody?: Buffer };
const header = (req: WebhookRequest, name: string) => {
  const v = req.headers[name];
  return typeof v === 'string' ? v : undefined;
};

/** Runs before body validation, so the signature covers the exact bytes Live Orders sent. */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const secret = process.env.LIVE_ORDERS_WEBHOOK_SECRET;
    if (!secret) throw new AppError('WEBHOOK_NOT_CONFIGURED');
    const req = ctx.switchToHttp().getRequest<WebhookRequest>();
    if (!req.rawBody) throw new AppError('WEBHOOK_SIGNATURE_INVALID');
    verifyWebhook({
      secret,
      timestamp: header(req, 'x-timestamp'),
      signature: header(req, 'x-signature'),
      rawBody: req.rawBody,
      nowSeconds: Date.now() / 1000,
    });
    return true;
  }
}
