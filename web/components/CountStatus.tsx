import { getTranslations } from 'next-intl/server';
import type { CountStatus as Status } from '@/lib/api';

const TONE: Record<Status, string> = {
  OPEN: 'bg-brand-subtle text-brand',
  APPLIED: 'bg-success-subtle text-success',
  CANCELLED: 'bg-danger-subtle text-danger',
};

/** The word carries the meaning; the color only repeats it. */
export async function CountStatus({ status }: { status: Status }) {
  const t = await getTranslations('counts.statuses');
  return <span className={`badge ${TONE[status]}`}>{t(status)}</span>;
}
