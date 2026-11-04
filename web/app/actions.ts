'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { isLocale } from '@/i18n/locales';
import { api, ApiError, type ApiFailure, type MovementType, type ProductInput, ROLE_COOKIE, type Role, TOKEN_COOKIE } from '@/lib/api';

export type ActionResult = { error?: ApiFailure };

const SESSION_SECONDS = 8 * 60 * 60; // matches the auth service's default JWT_EXPIRES_IN
const YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Turns an API rejection into a result the form can show; anything else is a real bug and is rethrown. */
async function attempt(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    if (e instanceof ApiError) return { error: e.failure };
    throw e;
  }
  return {};
}

export async function login(input: { email: string; password: string }): Promise<ActionResult> {
  let session: { accessToken: string; role: Role } | undefined;
  const result = await attempt(async () => {
    session = await api.login(input);
  });
  if (result.error || !session) return result;
  // VIEWER is only for the Live Orders integration; the web pages it would see answer 403
  if (session.role === 'VIEWER') return { error: { code: 'WEB_LOGIN_NOT_ALLOWED', message: 'This account cannot sign in to the web app.' } };

  // https-only by default in production; COOKIE_SECURE=false allows a local http demo
  const secure = process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production';
  const options = { httpOnly: true, sameSite: 'lax', secure, maxAge: SESSION_SECONDS, path: '/' } as const;
  const jar = await cookies();
  jar.set(TOKEN_COOKIE, session.accessToken, options);
  // role is only for showing or hiding buttons; every service checks the token again
  jar.set(ROLE_COOKIE, session.role, options);
  redirect('/');
}

export async function logout(): Promise<void> {
  const jar = await cookies();
  jar.delete(TOKEN_COOKIE);
  jar.delete(ROLE_COOKIE);
  redirect('/login');
}

export async function setLocale(locale: string): Promise<void> {
  if (isLocale(locale)) (await cookies()).set('locale', locale, { maxAge: YEAR_SECONDS, path: '/' });
  revalidatePath('/', 'layout');
}

export async function createProduct(input: ProductInput & { sku: string }): Promise<ActionResult> {
  return attempt(() => api.createProduct(input));
}

export async function updateProduct(id: string, input: ProductInput): Promise<ActionResult> {
  return attempt(() => api.updateProduct(id, input));
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const result = await attempt(() => api.deleteProduct(id));
  if (!result.error) redirect('/products');
  return result;
}

export async function moveStock(id: string, input: { type: MovementType; quantity: number; note?: string }): Promise<ActionResult> {
  return attempt(() => api.move(id, input));
}

/** Runs the AI analysis in the user's current language. */
export async function analyzeInventory(): Promise<ActionResult & { analysis?: string }> {
  let analysis: string | undefined;
  const result = await attempt(async () => {
    analysis = (await api.analyzeInventory(await getLocale())).analysis;
  });
  return { ...result, analysis };
}

export async function createUser(input: { email: string; password: string; role: Role }): Promise<ActionResult> {
  return attempt(() => api.createUser(input));
}
