import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { AnalyzeInventory } from '@/components/AnalyzeInventory';
import { StockLevel } from '@/components/StockLevel';
import { StockStatus } from '@/components/StockStatus';
import { api, currentRole } from '@/lib/api';

export default async function InventoryPage() {
  const [t, tp, format, { aiEnabled, rows }, role] = await Promise.all([
    getTranslations('inventory'),
    getTranslations('products'),
    getFormatter(),
    api.inventory(),
    currentRole(),
  ]);
  // most urgent first: what runs out soonest, then products without usage
  const sorted = [...rows].sort((a, b) => (a.daysOfCover ?? Infinity) - (b.daysOfCover ?? Infinity));
  const num = (n: number) => format.number(n, { maximumFractionDigits: 2 });

  return (
    <>
      <div>
        <h1 className="page-title">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
      </div>

      {aiEnabled && role === 'ADMIN' && (
        <section className="card">
          <h2 className="mb-3 font-semibold">{t('aiTitle')}</h2>
          <AnalyzeInventory />
        </section>
      )}

      <section className="card p-0">
        {rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{tp('name')}</th>
                  <th className="th">{tp('status')}</th>
                  <th className="th text-right">{tp('quantity')}</th>
                  <th className="th text-right">{t('totalIn')}</th>
                  <th className="th text-right">{t('totalOut')}</th>
                  <th className="th text-right">{t('avgDailyOut')}</th>
                  <th className="th text-right">{t('daysOfCover')}</th>
                  <th className="th text-right">{t('suggested')}</th>
                  <th className="th text-right">{t('reorder')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.productId}>
                    <td className="td">
                      <Link href={`/products/${r.productId}`} className="link">{r.name}</Link>
                      <span className="ml-2 font-mono text-xs text-muted">{r.sku}</span>
                    </td>
                    <td className="td">
                      <StockStatus status={r.status} />
                      <StockLevel {...r} className="mt-2 w-32" />
                    </td>
                    <td className="td text-right tabular-nums">{r.quantity}</td>
                    <td className="td text-right tabular-nums text-muted">{r.totalIn}</td>
                    <td className="td text-right tabular-nums text-muted">{r.totalOut}</td>
                    <td className="td text-right tabular-nums">{num(r.avgDailyOut)}</td>
                    <td className="td text-right tabular-nums">{r.daysOfCover ?? <span className="text-muted">{t('noUsage')}</span>}</td>
                    <td className="td text-right tabular-nums">{r.suggestedQuantity}</td>
                    <td className="td text-right font-semibold tabular-nums">{r.reorderQuantity > 0 ? r.reorderQuantity : '—'}</td>
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
