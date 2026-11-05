/**
 * Every error the app can return, in one place.
 * `code` is stable and meant for clients to translate; `message` is the English fallback.
 * Placeholders use `{name}`, the same syntax next-intl uses in the web app.
 */
const CATALOG = {
  // product rules
  SKU_INVALID: { kind: 'rule', message: 'SKU must be 3-32 letters, digits or dashes.' },
  SKU_TAKEN: { kind: 'rule', message: 'SKU {sku} already exists.' },
  PRODUCT_NAME_REQUIRED: { kind: 'rule', message: 'Product name is required.' },
  MIN_QUANTITY_INVALID: { kind: 'rule', message: 'Minimum quantity must be a whole number of 0 or more.' },
  MAX_QUANTITY_INVALID: { kind: 'rule', message: 'Maximum quantity must be a whole number greater than the minimum ({min}).' },
  QUANTITY_INVALID: { kind: 'rule', message: 'Quantity must be a whole number greater than zero.' },
  NOT_ENOUGH_STOCK: { kind: 'rule', message: 'Not enough stock: {available} available, {requested} requested.' },
  STOCK_CHANGED: { kind: 'rule', message: 'Stock changed while saving and is no longer enough. Reload and try again.' },
  PRODUCT_LOCATION_INVALID: { kind: 'rule', message: 'Bin location must look like R01-B03-A04-P060-N1.' },
  PRODUCT_HAS_MOVEMENTS: { kind: 'rule', message: 'Product has stock movements and cannot be deleted.' },
  PRODUCT_NOT_FOUND: { kind: 'not_found', message: 'Product not found.' },
  // users and login
  EMAIL_INVALID: { kind: 'rule', message: 'Email is not valid.' },
  PASSWORD_TOO_SHORT: { kind: 'rule', message: 'Password must have at least {min} characters.' },
  EMAIL_TAKEN: { kind: 'rule', message: 'User {email} already exists.' },
  INVALID_CREDENTIALS: { kind: 'unauthorized', message: 'Invalid email or password.' },
  TOO_MANY_ATTEMPTS: { kind: 'too_many', message: 'Too many failed sign-ins. Wait {minutes} minutes and try again.' },
  SESSION_INVALID: { kind: 'unauthorized', message: 'Your session is missing or expired. Sign in again.' },
  FORBIDDEN: { kind: 'forbidden', message: 'Your role cannot do this.' },
  // inventory analysis
  STOCK_UNAVAILABLE: { kind: 'unavailable', message: 'Stock data is unavailable right now. Try again in a moment.' },
  AI_NOT_CONFIGURED: { kind: 'unavailable', message: 'Inventory analysis is not enabled on this server.' },
  AI_FAILED: { kind: 'unavailable', message: 'Inventory analysis is unavailable right now. Try again later.' },
  // signed webhooks
  WEBHOOK_SIGNATURE_INVALID: { kind: 'unauthorized', message: 'Webhook signature is missing or wrong.' },
  WEBHOOK_TOO_OLD: { kind: 'unauthorized', message: 'Webhook timestamp is more than 5 minutes away from the server clock.' },
  WEBHOOK_NOT_CONFIGURED: { kind: 'unavailable', message: 'Webhooks are not enabled on this server.' },
  // request shape, checked by the DTOs before any rule runs
  INVALID_INPUT: { kind: 'rule', message: 'Invalid input: {details}' },
} as const satisfies Record<string, { kind: ErrorKind; message: string }>;

export type ErrorKind = 'rule' | 'not_found' | 'unauthorized' | 'forbidden' | 'too_many' | 'unavailable';
export type ErrorCode = keyof typeof CATALOG;
export type ErrorParams = Record<string, string | number>;

export const ERROR_CODES = Object.keys(CATALOG);

export class AppError extends Error {
  readonly kind: ErrorKind;

  constructor(readonly code: ErrorCode, readonly params: ErrorParams = {}) {
    const { kind, message } = CATALOG[code];
    super(message.replace(/\{(\w+)\}/g, (match, key: string) => String(params[key] ?? match)));
    this.kind = kind;
  }
}
