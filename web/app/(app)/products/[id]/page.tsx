import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { deleteProduct } from '@/app/actions';
import { ActionButton } from '@/components/ActionButton';
import { MovementForm } from '@/components/MovementForm';
import { MovementsTable } from '@/components/MovementsTable';
import { ProductForm } from '@/components/ProductForm';
import { StockLevel } from '@/components/StockLevel';
import { StockStatus } from '@/components/StockStatus';
import { api, ApiError, currentRole } from '@/lib/api';
import { money } from '@/lib/money';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, format, role] = await Promise.all([getTranslations(), getFormatter(), currentRole()]);
  const loaded = await Promise.all([api.product(id), api.movements(id)]).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const [product, movements] = loaded;
  const { price, cost } = product;
  const show = (cents: number | null) => (cents === null ? '—' : money(format, cents));
  const margin = price !== null && cost !== null && price > 0
    ? format.number((price - cost) / price, { style: 'percent', maximumFractionDigits: 1 })
    : '—';

  return (
    <>
      <Link href="/products" className="link text-sm">← {t('products.back')}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{product.name}</h1>
        <span className="font-mono text-sm text-muted">{product.sku}</span>
        {product.location && (
          <span className="font-mono text-sm text-muted">{t('products.location')} {product.location}</span>
        )}
        <StockStatus status={product.status} />
        <span className="ml-auto text-sm text-muted tabular-nums">
          {t('products.reserved')} {product.reserved} · {t('products.available')} {product.available}
        </span>
        <span className="metric">{product.quantity}</span>
      </div>
      <StockLevel {...product} className="max-w-xl" />
      <dl className="flex flex-wrap gap-6 text-sm">
        {[
          { label: t('products.price'), value: show(price) },
          { label: t('products.cost'), value: show(cost) },
          { label: t('products.margin'), value: margin },
        ].map((m) => (
          <div key={m.label}>
            <dt className="text-muted">{m.label}</dt>
            <dd className="font-semibold tabular-nums">{m.value}</dd>
          </div>
        ))}
      </dl>
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('movements.register')}</h2>
        <MovementForm productId={product.id} />
      </section>
      {role === 'ADMIN' && (
        <section className="card space-y-4">
          <h2 className="font-semibold">{t('products.edit')}</h2>
          <ProductForm product={product} />
          <ActionButton label={t('products.delete')} confirm={t('products.deleteConfirm')} action={deleteProduct.bind(null, product.id)} className="btn-danger" />
        </section>
      )}
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('movements.title')}</h2>
        <MovementsTable rows={movements} empty={t('movements.empty')} />
      </section>
    </>
  );
}
