'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useFormatter, useTranslations } from 'next-intl';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { createPurchaseOrder, updatePurchaseOrder } from '@/app/actions';
import type { Product, PurchaseOrder, Supplier } from '@/lib/api';
import { money, parseReais, reaisInput } from '@/lib/money';
import { Field, FormMessage, useActionResult } from './form';

/** New draft (pick the supplier) or the items of an existing draft. Totals are a preview; the stock service stores them. */
export function PurchaseItemsForm({ products, suppliers, order }: { products: Product[]; suppliers?: Supplier[]; order?: PurchaseOrder }) {
  const t = useTranslations();
  const format = useFormatter();
  const schema = z.object({
    supplierId: z.string().min(1, t('common.required')),
    items: z.array(z.object({
      productId: z.string().min(1, t('common.required')),
      quantity: z.number(t('common.positive')).int(t('common.positive')).min(1, t('common.positive')),
      unitCost: z.string().refine((v) => typeof parseReais(v) === 'number', t('products.moneyInvalid')),
    })).min(1, t('purchases.needItem')),
  });
  type Values = z.infer<typeof schema>;
  const cost = (productId: string) => reaisInput(products.find((p) => p.id === productId)?.cost ?? null);
  const { register, handleSubmit, formState, control, watch, setValue } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierId: order?.supplierId ?? '',
      items: order ? order.items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: reaisInput(i.unitCost) })) : [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const { result, submit } = useActionResult();
  const total = watch('items').reduce((sum, i) => sum + (Number.isFinite(i.quantity) ? i.quantity : 0) * (parseReais(i.unitCost) ?? 0), 0);

  const onSubmit = handleSubmit(async ({ supplierId, items }) => {
    const lines = items.map((i) => ({ productId: i.productId, quantity: i.quantity, unitCost: parseReais(i.unitCost) ?? 0 }));
    await submit(() => (order ? updatePurchaseOrder(order.id, lines) : createPurchaseOrder({ supplierId, items: lines })));
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {suppliers && (
        <Field label={t('purchases.supplier')} error={formState.errors.supplierId?.message}>
          {(a) => (
            <select {...a} className={`${a.className} max-w-sm`} {...register('supplierId')}>
              <option value="">{t('purchases.pickSupplier')}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </Field>
      )}
      {fields.map((f, index) => {
        const errors = formState.errors.items?.[index];
        return (
          <fieldset key={f.id} className="grid gap-3 sm:grid-cols-[3fr_1fr_1fr_auto] sm:items-start">
            <legend className="sr-only">{t('purchases.item', { n: index + 1 })}</legend>
            <Field label={t('purchases.product')} error={errors?.productId?.message}>
              {(a) => (
                <select
                  {...a}
                  {...register(`items.${index}.productId`, { onChange: (e: { target: { value: string } }) => setValue(`items.${index}.unitCost`, cost(e.target.value)) })}
                >
                  <option value="">{t('purchases.pickProduct')}</option>
                  {products.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.name}</option>)}
                </select>
              )}
            </Field>
            <Field label={t('products.quantity')} error={errors?.quantity?.message}>
              {(a) => <input {...a} type="number" min={1} step={1} {...register(`items.${index}.quantity`, { valueAsNumber: true })} />}
            </Field>
            <Field label={t('purchases.unitCost')} error={errors?.unitCost?.message}>
              {(a) => <input {...a} inputMode="decimal" placeholder="0,00" {...register(`items.${index}.unitCost`)} />}
            </Field>
            <button type="button" className="btn-secondary sm:mt-7" onClick={() => remove(index)}>{t('purchases.removeItem', { n: index + 1 })}</button>
          </fieldset>
        );
      })}
      {formState.errors.items?.root?.message && <p className="text-xs text-danger">{formState.errors.items.root.message}</p>}
      {formState.errors.items?.message && <p className="text-xs text-danger">{formState.errors.items.message}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={() => append({ productId: '', quantity: 1, unitCost: '' })}>{t('purchases.addItem')}</button>
        <span className="ml-auto text-sm">{t('purchases.total')} <strong className="tabular-nums">{money(format, total)}</strong></span>
        <button type="submit" className="btn-primary" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('common.saving') : order ? t('common.save') : t('purchases.createDraft')}
        </button>
      </div>
      <FormMessage result={result} success={t('common.saved')} />
    </form>
  );
}
