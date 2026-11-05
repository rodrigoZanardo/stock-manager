import { cookies } from 'next/headers';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { logout } from '@/app/actions';
import { Brand } from '@/components/Brand';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { LowStockBanner } from '@/components/LowStockBanner';
import { NavLink } from '@/components/NavLink';
import { ThemeToggle } from '@/components/ThemeToggle';
import { currentRole } from '@/lib/api';
import { isTheme, THEME_COOKIE } from '@/lib/theme';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [t, role, jar] = await Promise.all([getTranslations(), currentRole(), cookies()]);
  const saved = jar.get(THEME_COOKIE)?.value;
  const theme = isTheme(saved) ? saved : 'system';

  return (
    // mobile: rail on top with a scrolling nav; md and up: fixed side rail
    <div className="md:grid md:min-h-screen md:grid-cols-[232px_minmax(0,1fr)]">
      <aside className="bg-rail text-white md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-6 md:p-4">
        <div className="flex items-center justify-between gap-3 px-4 pt-3 md:p-0">
          <Brand />
          <form action={logout} className="md:hidden">
            <button type="submit" className="nav-link">{t('nav.logout')}</button>
          </form>
        </div>
        <nav aria-label={t('nav.main')} className="flex gap-1 overflow-x-auto px-2 py-2 md:flex-col md:p-0">
          <NavLink href="/">{t('nav.dashboard')}</NavLink>
          <NavLink href="/products">{t('nav.products')}</NavLink>
          <NavLink href="/inventory">{t('nav.inventory')}</NavLink>
          <NavLink href="/counts">{t('nav.counts')}</NavLink>
          <NavLink href="/purchases">{t('nav.purchases')}</NavLink>
          <NavLink href="/suppliers">{t('nav.suppliers')}</NavLink>
          {role === 'ADMIN' && (
            <>
              <NavLink href="/users">{t('nav.users')}</NavLink>
              <NavLink href="/audit">{t('nav.audit')}</NavLink>
            </>
          )}
        </nav>
        <div className="hidden space-y-2 md:mt-auto md:block">
          <ThemeToggle initial={theme} />
          <LocaleSwitcher />
          <form action={logout}>
            <button type="submit" className="nav-link w-full">{t('nav.logout')}</button>
          </form>
        </div>
      </aside>

      <main className="space-y-6 px-4 py-6 sm:px-6 md:px-10 md:py-8">
        <Suspense fallback={null}>
          <LowStockBanner />
        </Suspense>
        {children}
        {/* phones: the rail has no room for settings, so they sit at the end of the page */}
        <div className="flex gap-2 rounded-md bg-rail p-2 md:hidden">
          <div className="flex-1"><ThemeToggle initial={theme} /></div>
          <div className="flex-1"><LocaleSwitcher /></div>
        </div>
      </main>
    </div>
  );
}
