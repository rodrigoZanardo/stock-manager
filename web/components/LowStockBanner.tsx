import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { api, ApiError } from '@/lib/api';

/** Rendered inside Suspense: if the API refuses or is down the banner is skipped so the layout and nav still render. */
export async function LowStockBanner() {
  const [t, products] = await Promise.all([
    getTranslations('alerts'),
    api.products().catch((e: unknown) => {
      if (e instanceof ApiError) return [];
      throw e;
    }),
  ]);
  const lowCount = products.filter((p) => p.status === 'LOW').length;
  if (lowCount === 0) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 border-signal bg-panel px-4 py-3 text-sm">
      <span>{t('lowStock', { count: lowCount })}</span>
      <span className="flex gap-4">
        <Link href="/inventory" className="link">{t('review')}</Link>
        <Link href="/purchases#suggest" className="link">{t('suggestPurchase')}</Link>
      </span>
    </div>
  );
}
