'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { enterCounted } from '@/app/actions';
import type { InventoryCount } from '@/lib/api';
import { signed } from '@/lib/signed';
import { FormMessage, useActionResult } from './form';

/** Counted quantities of an OPEN count. An empty field skips that product; the stock service checks reserved units. */
export function CountForm({ count }: { count: InventoryCount }) {
  const t = useTranslations();
  const schema = z.object({
    items: z.array(z.object({ counted: z.string().trim().regex(/^\d*$/, t('common.wholeNumber')) }))
      .refine((items) => items.some((i) => i.counted.trim() !== ''), t('counts.nothingEntered')),
  });
  type Values = z.infer<typeof schema>;
  const { register, handleSubmit, formState, watch } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { items: count.items.map((i) => ({ counted: i.counted === null ? '' : String(i.counted) })) },
  });
  const { result, submit } = useActionResult();
  const values = watch('items');

  const onSubmit = handleSubmit(async ({ items }) => {
    const lines = count.items.flatMap((item, index) => {
      const v = items[index]?.counted.trim() ?? '';
      return v === '' ? [] : [{ productId: item.productId, counted: Number(v) }];
    });
    await submit(() => enterCounted(count.id, lines));
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm text-muted">{t('counts.hint')}</p>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">{t('counts.sku')}</th>
              <th className="th">{t('counts.name')}</th>
              <th className="th">{t('counts.location')}</th>
              <th className="th text-right">{t('counts.expected')}</th>
              <th className="th text-right">{t('counts.counted')}</th>
              <th className="th text-right">{t('counts.difference')}</th>
            </tr>
          </thead>
          <tbody>
            {count.items.map((item, index) => {
              const raw = values[index]?.counted.trim() ?? '';
              const error = formState.errors.items?.[index]?.counted?.message;
              const difference = /^\d+$/.test(raw) ? Number(raw) - item.expected : null;
              return (
                <tr key={item.productId}>
                  <td className="td whitespace-nowrap">{item.sku}</td>
                  <td className="td">{item.name}</td>
                  <td className="td whitespace-nowrap">{item.location ?? t('counts.noLocation')}</td>
                  <td className="td text-right tabular-nums">{item.expected}</td>
                  <td className="td text-right">
                    <input
                      className="input ml-auto w-24 text-right"
                      inputMode="numeric"
                      aria-label={t('counts.countedOf', { name: item.name })}
                      aria-invalid={!!error}
                      {...register(`items.${index}.counted`)}
                    />
                    {error && <p className="mt-1 text-xs text-danger">{error}</p>}
                  </td>
                  <td className={`td text-right tabular-nums ${difference ? 'font-semibold' : ''}`}>{difference === null ? '' : signed(difference)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {formState.errors.items?.root?.message && <p className="text-xs text-danger">{formState.errors.items.root.message}</p>}
      {formState.errors.items?.message && <p className="text-xs text-danger">{formState.errors.items.message}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t('common.saving') : t('counts.save')}
        </button>
      </div>
      <FormMessage result={result} success={t('common.saved')} />
    </form>
  );
}
