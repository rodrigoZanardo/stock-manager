import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { DeleteProductButton } from '@/components/DeleteProductButton';
import { MovementForm } from '@/components/MovementForm';
import { MovementsTable } from '@/components/MovementsTable';
import { ProductForm } from '@/components/ProductForm';
import { StockLevel } from '@/components/StockLevel';
import { StockStatus } from '@/components/StockStatus';
import { api, ApiError, currentRole } from '@/lib/api';

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [t, role] = await Promise.all([getTranslations(), currentRole()]);
  const loaded = await Promise.all([api.product(id), api.movements(id)]).catch((e: unknown) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const [product, movements] = loaded;

  return (
    <>
      <Link href="/products" className="link text-sm">← {t('products.back')}</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">{product.name}</h1>
        <span className="font-mono text-sm text-muted">{product.sku}</span>
        <StockStatus status={product.status} />
        <span className="ml-auto text-sm text-muted tabular-nums">
          {t('products.reserved')} {product.reserved} · {t('products.available')} {product.available}
        </span>
        <span className="metric">{product.quantity}</span>
      </div>
      <StockLevel {...product} className="max-w-xl" />
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('movements.register')}</h2>
        <MovementForm productId={product.id} />
      </section>
      {role === 'ADMIN' && (
        <section className="card space-y-4">
          <h2 className="font-semibold">{t('products.edit')}</h2>
          <ProductForm product={product} />
          <DeleteProductButton id={product.id} />
        </section>
      )}
      <section className="card">
        <h2 className="mb-4 font-semibold">{t('movements.title')}</h2>
        <MovementsTable rows={movements} empty={t('movements.empty')} />
      </section>
    </>
  );
}
