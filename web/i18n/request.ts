import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { isLocale, type Locale } from './locales';

// Locale lives in a cookie instead of the URL: the app is behind login, so there is no SEO to gain from /en, /pt routes.
export default getRequestConfig(async () => {
  const value = (await cookies()).get('locale')?.value;
  const locale: Locale = isLocale(value) ? value : 'en';
  // the server runs in UTC; Portuguese means a Brazilian user, so times show in Brasília time
  const timeZone = locale === 'pt' ? 'America/Sao_Paulo' : 'UTC';
  return { locale, timeZone, messages: (await import(`../messages/${locale}.json`)).default };
});
