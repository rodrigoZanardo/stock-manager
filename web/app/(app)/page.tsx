import { getTranslations } from 'next-intl/server';
import { MovementsTable } from '@/components/MovementsTable';
import { StockChart } from '@/components/StockChart';
import { api } from '@/lib/api';

export default async function DashboardPage() {
  const [t, d] = await Promise.all([getTranslations('dashboard'), api.dashboard()]);
  const stats = [
    { label: t('totalProducts'), value: d.totalProducts },
    { label: t('lowStock'), value: d.lowStockProducts },
    { label: t('totalUnits'), value: d.totalUnits },
  ];

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <dl className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="card">
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="metric mt-1">{s.value}</dd>
          </div>
        ))}
      </dl>
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('chartTitle')}</h2>
        <StockChart data={d.daily} />
      </section>
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('recent')}</h2>
        <MovementsTable rows={d.recent} empty={t('noMovements')} />
      </section>
    </>
  );
}
