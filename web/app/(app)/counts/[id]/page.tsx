import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { changeInventoryCount } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { CountForm } from '@/components/CountForm';
import { CountStatus } from '@/components/CountStatus';
import { api, ApiError } from '@/lib/api';
import { signed } from '@/lib/signed';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function CountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const t = await getTranslations('counts');
  const count = await api.inventoryCount(id).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });

  return (
    <>
      <Link href="/counts" className="link text-sm">← {t('back')}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{t('count', { number: count.number })}</h1>
        <CountStatus status={count.status} />
        <span className="ml-auto text-sm text-muted">
          {t('progress', { counted: count.items.filter((i) => i.counted !== null).length, total: count.items.length })}
        </span>
      </div>
      {count.status === 'OPEN' && (
        <div className="flex flex-wrap items-start gap-3">
          <ActionButton label={t('apply')} confirm={t('applyConfirm')} action={changeInventoryCount.bind(null, count.id, 'apply')} className="btn-primary" />
          <ActionButton label={t('cancel')} confirm={t('cancelConfirm')} action={changeInventoryCount.bind(null, count.id, 'cancel')} className="btn-danger" />
        </div>
      )}
      <section className="card">
        {count.status === 'OPEN' ? (
          <CountForm count={count} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('sku')}</th>
                  <th className="th">{t('name')}</th>
                  <th className="th">{t('location')}</th>
                  <th className="th text-right">{t('expected')}</th>
                  <th className="th text-right">{t('counted')}</th>
                  <th className="th text-right">{t('difference')}</th>
                </tr>
              </thead>
              <tbody>
                {count.items.map((i) => (
                  <tr key={i.productId}>
                    <td className="td whitespace-nowrap"><Link href={`/products/${i.productId}`} className="link">{i.sku}</Link></td>
                    <td className="td">{i.name}</td>
                    <td className="td whitespace-nowrap">{i.location ?? t('noLocation')}</td>
                    <td className="td text-right tabular-nums">{i.expected}</td>
                    <td className="td text-right tabular-nums">{i.counted ?? ''}</td>
                    <td className={`td text-right tabular-nums ${i.difference ? 'font-semibold' : ''}`}>{i.difference === null ? '' : signed(i.difference)}</td>
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
