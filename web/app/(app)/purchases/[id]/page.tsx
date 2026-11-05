import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { changePurchaseOrder } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { PurchaseItemsForm } from '@/components/PurchaseItemsForm';
import { PurchaseStatus } from '@/components/PurchaseStatus';
import { api, ApiError } from '@/lib/api';
import { money } from '@/lib/money';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function PurchasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, format] = await Promise.all([getTranslations('purchases'), getFormatter()]);
  const [order, products] = await Promise.all([api.purchaseOrder(id), api.products()]).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const open = order.status === 'DRAFT' || order.status === 'ORDERED';

  return (
    <>
      <Link href="/purchases" className="link text-sm">← {t('back')}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{t('order', { number: order.number })}</h1>
        <span className="text-sm text-muted">{order.supplierName}</span>
        <PurchaseStatus status={order.status} />
        <span className="metric ml-auto">{money(format, order.total)}</span>
      </div>
      {open && (
        <div className="flex flex-wrap items-start gap-3">
          {order.status === 'DRAFT' && <ActionButton label={t('send')} action={changePurchaseOrder.bind(null, order.id, 'send')} className="btn-primary" />}
          {order.status === 'ORDERED' && (
            <ActionButton label={t('receive')} confirm={t('receiveConfirm')} action={changePurchaseOrder.bind(null, order.id, 'receive')} className="btn-primary" />
          )}
          <ActionButton label={t('cancel')} confirm={t('cancelConfirm')} action={changePurchaseOrder.bind(null, order.id, 'cancel')} className="btn-danger" />
        </div>
      )}
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('items')}</h2>
        {order.status === 'DRAFT' ? (
          <PurchaseItemsForm key={order.items.map((i) => `${i.productId}:${i.quantity}:${i.unitCost}`).join()} products={products} order={order} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('product')}</th>
                  <th className="th text-right">{t('quantity')}</th>
                  <th className="th text-right">{t('unitCost')}</th>
                  <th className="th text-right">{t('subtotal')}</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((i) => (
                  <tr key={i.productId}>
                    <td className="td"><Link href={`/products/${i.productId}`} className="link">{i.sku} · {i.name}</Link></td>
                    <td className="td text-right tabular-nums">{i.quantity}</td>
                    <td className="td text-right tabular-nums">{money(format, i.unitCost)}</td>
                    <td className="td text-right tabular-nums">{money(format, i.quantity * i.unitCost)}</td>
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
