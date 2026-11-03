import { getTranslations } from 'next-intl/server';

export async function Brand({ className = '' }: { className?: string }) {
  const t = await getTranslations('app');
  return (
    <p className={`flex items-center gap-2 font-display text-xl font-semibold ${className}`}>
      <span aria-hidden className="grid h-7 w-9 place-items-center rounded-sm bg-signal text-sm text-signal-ink">SM</span>
      {t('name')}
    </p>
  );
}
