import type { Metadata, Viewport } from 'next';
import { Barlow, Barlow_Condensed } from 'next/font/google';
import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { isTheme, THEME_COOKIE } from '@/lib/theme';
import './globals.css';

// Barlow is drawn from highway and warehouse signage; the condensed cut fits labels and numbers.
const barlow = Barlow({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-barlow', display: 'swap' });
const condensed = Barlow_Condensed({ subsets: ['latin'], weight: ['600'], variable: '--font-barlow-condensed', display: 'swap' });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('name'), description: t('description') };
}
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get(THEME_COOKIE)?.value;
  return (
    <html
      lang={await getLocale()}
      data-theme={isTheme(theme) && theme !== 'system' ? theme : undefined}
      className={`${barlow.variable} ${condensed.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
