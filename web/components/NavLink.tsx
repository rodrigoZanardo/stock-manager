'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

/** Shows that a navigation is pending. A loading.tsx boundary would stream the page and break router.refresh after saves. */
function PendingHint() {
  const t = useTranslations('common');
  const { pending } = useLinkStatus();
  return pending ? <span role="status" className="ms-2 text-xs text-muted">{t('loading')}</span> : null;
}

/** Marks the current section with aria-current, which the nav-link style highlights. */
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === '/' ? path === '/' : path.startsWith(href);
  return (
    <Link href={href} className="nav-link" aria-current={active ? 'page' : undefined}>
      {children}
      <PendingHint />
    </Link>
  );
}
