'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createProduct, updateProduct } from '@/app/actions';
import type { Product } from '@/lib/api';
import { parseReais, reaisInput } from '@/lib/money';
import { Field, FormMessage, useActionResult } from './form';

/** Creates a product, or edits one when `product` is given (SKU is then read-only, as in the API). */
export function ProductForm({ product }: { product?: Product }) {
  const t = useTranslations();
  const schema = z
    .object({
      sku: z.string().trim().regex(/^[A-Za-z0-9-]{3,32}$/, t('products.skuInvalid')),
      name: z.string().trim().min(1, t('common.required')).max(120, t('common.tooLong', { max: 120 })),
      minQuantity: z.number(t('common.wholeNumber')).int(t('common.wholeNumber')).min(0, t('common.wholeNumber')),
      maxQuantity: z.number(t('common.positive')).int(t('common.positive')).min(1, t('common.positive')).nullable(),
      // same format the stock service checks; it uppercases too
      location: z.string().trim().regex(/^(R\d{2}-B\d{2}-A\d{2}-P\d{3}-N\d)?$/i, t('products.locationInvalid')),
      price: z.string().refine((v) => parseReais(v) !== undefined, t('products.moneyInvalid')),
      cost: z.string().refine((v) => parseReais(v) !== undefined, t('products.moneyInvalid')),
    })
    .refine((v) => v.maxQuantity === null || v.maxQuantity > v.minQuantity, {
      path: ['maxQuantity'],
      message: t('products.maxAboveMin'),
    });
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: product
      ? { ...product, location: product.location ?? '', price: reaisInput(product.price), cost: reaisInput(product.cost) }
      : { sku: '', name: '', minQuantity: 0, maxQuantity: null, location: '', price: '', cost: '' },
  });
  const { result, submit } = useActionResult();

  const onSubmit = handleSubmit(async ({ sku, location, price, cost, ...rest }) => {
    // the schema already refused text parseReais cannot read
    const details = { ...rest, location: location || null, price: parseReais(price) ?? null, cost: parseReais(cost) ?? null };
    if (product) {
      if (await submit(() => updateProduct(product.id, details))) reset({ sku: product.sku, ...rest, location: location.toUpperCase(), price, cost });
      return;
    }
    if (await submit(() => createProduct({ sku, ...details }))) reset();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-4 sm:items-start" noValidate>
      <Field label={t('products.sku')} error={formState.errors.sku?.message} hint={product ? undefined : t('products.skuHint')}>
        {/* readOnly, not disabled: react-hook-form drops disabled values and validation would fail */}
        {(a) => <input {...a} readOnly={!!product} className={`${a.className} read-only:bg-panel-muted read-only:text-muted`} {...register('sku')} />}
      </Field>
      <Field label={t('products.name')} error={formState.errors.name?.message}>
        {(a) => <input {...a} {...register('name')} />}
      </Field>
      <Field label={t('products.minQuantity')} error={formState.errors.minQuantity?.message}>
        {(a) => <input {...a} type="number" min={0} step={1} {...register('minQuantity', { valueAsNumber: true })} />}
      </Field>
      <Field label={t('products.maxQuantity')} error={formState.errors.maxQuantity?.message} hint={t('products.maxHint')}>
        {(a) => (
          <input
            {...a}
            type="number"
            min={1}
            step={1}
            {...register('maxQuantity', { setValueAs: (v) => (v === '' || v === null ? null : Number(v)) })}
          />
        )}
      </Field>
      <Field label={t('products.location')} error={formState.errors.location?.message} hint={t('products.locationHint')}>
        {(a) => <input {...a} className={`${a.className} font-mono uppercase`} placeholder="R01-B03-A04-P060-N1" {...register('location')} />}
      </Field>
      <Field label={t('products.price')} error={formState.errors.price?.message} hint={t('products.moneyHint')}>
        {(a) => <input {...a} inputMode="decimal" placeholder="0,00" {...register('price')} />}
      </Field>
      <Field label={t('products.cost')} error={formState.errors.cost?.message} hint={t('products.moneyHint')}>
        {(a) => <input {...a} inputMode="decimal" placeholder="0,00" {...register('cost')} />}
      </Field>
      <button type="submit" className="btn-primary sm:mt-7" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? t('common.saving') : product ? t('common.save') : t('products.create')}
      </button>
      <div className="sm:col-span-4">
        <FormMessage result={result} success={t('common.saved')} />
      </div>
    </form>
  );
}
