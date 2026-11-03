import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { Brand } from '@/components/Brand';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LoginForm } from '@/components/LoginForm';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isTheme, THEME_COOKIE } from '@/lib/theme';

export default async function LoginPage() {
  const [t, jar] = await Promise.all([getTranslations(), cookies()]);
  const saved = jar.get(THEME_COOKIE)?.value;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 py-8">
      <div className="space-y-3 rounded-md bg-rail p-3 text-white">
        <Brand className="px-1" />
        <LocaleSwitcher />
        <ThemeToggle initial={isTheme(saved) ? saved : 'system'} />
      </div>
      <div className="card">
        <h1 className="page-title">{t('login.title')}</h1>
        <p className="mb-5 mt-1 text-sm text-muted">{t('login.subtitle')}</p>
        <LoginForm />
      </div>
    </main>
  );
}
