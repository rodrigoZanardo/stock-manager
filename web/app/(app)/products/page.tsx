import Link from 'next/link';
import { getFormatter, getTranslations } from 'next-intl/server';
import { ProductForm } from '@/components/ProductForm';
import { StockLevel } from '@/components/StockLevel';
import { StockStatus } from '@/components/StockStatus';
import { api, currentRole } from '@/lib/api';
import { money } from '@/lib/money';

export default async function ProductsPage() {
  const [t, format, products, role] = await Promise.all([getTranslations('products'), getFormatter(), api.products(), currentRole()]);
  const isAdmin = role === 'ADMIN';

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      {isAdmin && (
        <section className="card">
          <h2 className="mb-4 font-semibold">{t('new')}</h2>
          <ProductForm />
        </section>
      )}
      <section className="card p-0">
        {products.length === 0 ? (
          <p className="p-5 text-sm text-muted">{isAdmin ? t('emptyAdmin') : t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('sku')}</th>
                  <th className="th">{t('name')}</th>
                  <th className="th">{t('location')}</th>
                  <th className="th text-right">{t('quantity')}</th>
                  <th className="th text-right">{t('reserved')}</th>
                  <th className="th text-right">{t('available')}</th>
                  <th className="th text-right">{t('minQuantity')}</th>
                  <th className="th text-right">{t('price')}</th>
                  <th className="th">{t('status')}</th>
                  <th className="th w-48">{t('level')}</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td className="td font-mono text-xs">{p.sku}</td>
                    <td className="td">
                      <Link href={`/products/${p.id}`} className="link">{p.name}</Link>
                    </td>
                    <td className="td font-mono text-xs text-muted">{p.location ?? '—'}</td>
                    <td className="td text-right tabular-nums">{p.quantity}</td>
                    <td className="td text-right tabular-nums text-muted">{p.reserved}</td>
                    <td className="td text-right tabular-nums">{p.available}</td>
                    <td className="td text-right tabular-nums text-muted">{p.minQuantity}</td>
                    <td className="td text-right tabular-nums whitespace-nowrap">{p.price === null ? '—' : money(format, p.price)}</td>
                    <td className="td"><StockStatus status={p.status} /></td>
                    <td className="td"><StockLevel {...p} /></td>
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
