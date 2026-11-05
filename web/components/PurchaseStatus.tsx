import { getTranslations } from 'next-intl/server';
import type { PurchaseStatus as Status } from '@/lib/api';

const TONE: Record<Status, string> = {
  DRAFT: 'bg-panel-muted text-muted',
  ORDERED: 'bg-brand-subtle text-brand',
  RECEIVED: 'bg-success-subtle text-success',
  CANCELLED: 'bg-danger-subtle text-danger',
};

/** The word carries the meaning; the color only repeats it. */
export async function PurchaseStatus({ status }: { status: Status }) {
  const t = await getTranslations('purchases.statuses');
  return <span className={`badge ${TONE[status]}`}>{t(status)}</span>;
}
