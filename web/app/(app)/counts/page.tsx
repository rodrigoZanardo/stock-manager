import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { startInventoryCount } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { CountStatus } from '@/components/CountStatus';
import { api } from '@/lib/api';

export default async function CountsPage() {
  const [t, format, counts] = await Promise.all([getTranslations('counts'), getFormatter(), api.inventoryCounts()]);

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <section className="card space-y-3">
        <p className="text-sm text-muted">{t('startHint')}</p>
        <ActionButton label={t('start')} action={startInventoryCount} className="btn-primary" />
      </section>
      <section className="card p-0">
        {counts.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('number')}</th>
                  <th className="th">{t('status')}</th>
                  <th className="th">{t('created')}</th>
                  <th className="th text-right">{t('counted')}</th>
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c.id}>
                    <td className="td"><Link href={`/counts/${c.id}`} className="link">#{c.number}</Link></td>
                    <td className="td"><CountStatus status={c.status} /></td>
                    <td className="td whitespace-nowrap">{format.dateTime(new Date(c.createdAt), { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="td text-right tabular-nums">
                      {t('progress', { counted: c.items.filter((i) => i.counted !== null).length, total: c.items.length })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
