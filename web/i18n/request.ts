import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';
import { isLocale, type Locale } from './locales';

// Locale lives in a cookie instead of the URL: the app is behind login, so there is no SEO to gain from /en, /pt routes.
export default getRequestConfig(async () => {
  const value = (await cookies()).get('locale')?.value;
  const locale: Locale = isLocale(value) ? value : 'en';
  return { locale, messages: (await import(`../messages/${locale}.json`)).default };
});
