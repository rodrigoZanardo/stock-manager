import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import type { Movement } from '@/lib/api';

/** Shared by the dashboard (with product column) and the product page (without). */
export async function MovementsTable({ rows, empty }: { rows: (Movement & { productId?: string; productName?: string })[]; empty: string }) {
  const t = await getTranslations('movements');
  const format = await getFormatter();
  if (rows.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  const withProduct = rows.some((r) => r.productName);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <th className="th">{t('date')}</th>
            {withProduct && <th className="th">{t('product')}</th>}
            <th className="th">{t('type')}</th>
            <th className="th text-right">{t('quantity')}</th>
            <th className="th">{t('noteHeader')}</th>
            <th className="th">{t('by')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.id}>
              <td className="td whitespace-nowrap">{format.dateTime(new Date(m.createdAt), { dateStyle: 'short', timeStyle: 'short' })}</td>
              {withProduct && (
                <td className="td">
                  <Link href={`/products/${m.productId}`} className="link">{m.productName}</Link>
                </td>
              )}
              <td className="td">{m.type === 'IN' ? t('in') : t('out')}</td>
              <td className="td text-right tabular-nums">{m.type === 'IN' ? '+' : '−'}{m.quantity}</td>
              <td className="td text-muted">{m.note}</td>
              <td className="td text-muted">{m.actorEmail ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
