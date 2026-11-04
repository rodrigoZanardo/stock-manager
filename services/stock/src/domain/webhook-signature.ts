import { createHmac, timingSafeEqual } from 'crypto';
import { AppError } from '@stock/shared';

export const MAX_CLOCK_SKEW_SECONDS = 5 * 60;

export const signWebhook = (secret: string, timestamp: string, rawBody: Buffer | string): string =>
  `sha256=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;

/** Checks `X-Signature` over the raw body, then the replay window. Throws AppError when either fails. */
export function verifyWebhook(
  input: { secret: string; timestamp?: string; signature?: string; rawBody: Buffer; nowSeconds: number },
): void {
  const { secret, timestamp, signature, rawBody, nowSeconds } = input;
  if (!timestamp || !signature || !/^\d+$/.test(timestamp)) throw new AppError('WEBHOOK_SIGNATURE_INVALID');
  const expected = Buffer.from(signWebhook(secret, timestamp, rawBody));
  const given = Buffer.from(signature);
  // timingSafeEqual throws on different lengths
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new AppError('WEBHOOK_SIGNATURE_INVALID');
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) throw new AppError('WEBHOOK_TOO_OLD');
}
