import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { PurchaseItemsForm } from '@/components/PurchaseItemsForm';
import { PurchaseStatus } from '@/components/PurchaseStatus';
import { SuggestPurchaseForm } from '@/components/SuggestPurchaseForm';
import { api } from '@/lib/api';
import { money } from '@/lib/money';

export default async function PurchasesPage() {
  const [t, format, orders, suppliers, products] = await Promise.all([
    getTranslations('purchases'), getFormatter(), api.purchaseOrders(), api.suppliers(), api.products(),
  ]);

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      {suppliers.length === 0 ? (
        <section className="card text-sm">
          {t('noSuppliers')} <Link href="/suppliers" className="link">{t('addSupplier')}</Link>
        </section>
      ) : (
        <>
          <section id="suggest" className="card scroll-mt-6">
            <h2 className="mb-4 font-semibold">{t('suggest')}</h2>
            <SuggestPurchaseForm suppliers={suppliers} />
          </section>
          <section className="card">
            <h2 className="mb-4 font-semibold">{t('new')}</h2>
            <PurchaseItemsForm products={products} suppliers={suppliers} />
          </section>
        </>
      )}
      <section className="card p-0">
        {orders.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('number')}</th>
                  <th className="th">{t('supplier')}</th>
                  <th className="th">{t('status')}</th>
                  <th className="th">{t('created')}</th>
                  <th className="th text-right">{t('items')}</th>
                  <th className="th text-right">{t('total')}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="td"><Link href={`/purchases/${o.id}`} className="link">#{o.number}</Link></td>
                    <td className="td">{o.supplierName}</td>
                    <td className="td"><PurchaseStatus status={o.status} /></td>
                    <td className="td whitespace-nowrap">{format.dateTime(new Date(o.createdAt), { dateStyle: 'short' })}</td>
                    <td className="td text-right tabular-nums">{o.items.length}</td>
                    <td className="td text-right tabular-nums whitespace-nowrap">{money(format, o.total)}</td>
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
