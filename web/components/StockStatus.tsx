import { getTranslations } from 'next-intl/server';
import type { StockStatus as Status } from '@/lib/api';

const STYLE: Record<Status, { key: 'low' | 'ok' | 'over'; badge: string; dot: string }> = {
  LOW: { key: 'low', badge: 'bg-danger-subtle text-danger', dot: 'bg-danger' },
  OK: { key: 'ok', badge: 'bg-success-subtle text-success', dot: 'bg-success' },
  OVER: { key: 'over', badge: 'bg-warning-subtle text-warning', dot: 'bg-warning' },
};

/** Text plus color, so the status does not rely on color alone. */
export async function StockStatus({ status }: { status: Status }) {
  const t = await getTranslations('products');
  const s = STYLE[status];
  return (
    <span className={`badge ${s.badge}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${s.dot}`} />
      {t(s.key)}
    </span>
  );
}
