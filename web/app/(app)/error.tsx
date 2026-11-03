'use client';

import { useTranslations } from 'next-intl';

// the raw error message is not shown: it is English and may leak internals
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations('common');
  return (
    <div role="alert" className="card space-y-3">
      <p className="font-medium text-danger">{t('error')}</p>
      <button type="button" className="btn-secondary" onClick={reset}>{t('retry')}</button>
    </div>
  );
}
