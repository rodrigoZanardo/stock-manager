'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { moveStock } from '@/app/actions';
import { Field, FormMessage, useActionResult } from './form';

export function MovementForm({ productId }: { productId: string }) {
  const t = useTranslations();
  const schema = z.object({
    type: z.enum(['IN', 'OUT']),
    quantity: z.number(t('common.positive')).int(t('common.positive')).min(1, t('common.positive')),
    note: z.string().trim().max(200, t('common.tooLong', { max: 200 })),
  });
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'IN', note: '' },
  });
  const { result, submit } = useActionResult();

  const onSubmit = handleSubmit(async ({ note, ...v }) => {
    if (await submit(() => moveStock(productId, { ...v, note: note || undefined }))) reset();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_2fr_auto] sm:items-start" noValidate>
      <Field label={t('movements.type')}>
        {(a) => (
          <select {...a} {...register('type')}>
            <option value="IN">{t('movements.in')}</option>
            <option value="OUT">{t('movements.out')}</option>
          </select>
        )}
      </Field>
      <Field label={t('movements.quantity')} error={formState.errors.quantity?.message}>
        {(a) => <input {...a} type="number" min={1} step={1} {...register('quantity', { valueAsNumber: true })} />}
      </Field>
      <Field label={t('movements.note')} error={formState.errors.note?.message}>
        {(a) => <input {...a} {...register('note')} />}
      </Field>
      <button type="submit" className="btn-primary sm:mt-6" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? t('common.saving') : t('movements.submit')}
      </button>
      <div className="sm:col-span-4">
        <FormMessage result={result} success={t('common.saved')} />
      </div>
    </form>
  );
}
