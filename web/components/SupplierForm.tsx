'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createSupplier, updateSupplier } from '@/app/actions';
import type { Supplier } from '@/lib/api';
import { Field, FormMessage, useActionResult } from './form';

/** Creates a supplier, or edits one when `supplier` is given. The stock service checks the CNPJ digits. */
export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const t = useTranslations();
  const schema = z.object({
    name: z.string().trim().min(1, t('common.required')).max(120, t('common.tooLong', { max: 120 })),
    document: z.string().trim().regex(/^(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})?$/, t('suppliers.documentInvalid')),
    email: z.union([z.literal(''), z.email(t('login.invalidEmail'))]),
    phone: z.string().trim().max(30, t('common.tooLong', { max: 30 })),
  });
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: supplier?.name ?? '', document: supplier?.document ?? '', email: supplier?.email ?? '', phone: supplier?.phone ?? '',
    },
  });
  const { result, submit } = useActionResult();

  const onSubmit = handleSubmit(async (v) => {
    const input = { name: v.name, document: v.document || null, email: v.email || null, phone: v.phone || null };
    if (supplier) await submit(() => updateSupplier(supplier.id, input));
    else if (await submit(() => createSupplier(input))) reset();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[2fr_1.5fr_1.5fr_1fr_auto] sm:items-start" noValidate>
      <Field label={t('suppliers.name')} error={formState.errors.name?.message}>
        {(a) => <input {...a} {...register('name')} />}
      </Field>
      <Field label={t('suppliers.document')} error={formState.errors.document?.message} hint={t('suppliers.optional')}>
        {(a) => <input {...a} inputMode="numeric" placeholder="00.000.000/0000-00" {...register('document')} />}
      </Field>
      <Field label={t('suppliers.email')} error={formState.errors.email?.message} hint={t('suppliers.optional')}>
        {(a) => <input {...a} type="email" {...register('email')} />}
      </Field>
      <Field label={t('suppliers.phone')} error={formState.errors.phone?.message} hint={t('suppliers.optional')}>
        {(a) => <input {...a} type="tel" {...register('phone')} />}
      </Field>
      <button type="submit" className="btn-primary sm:mt-7" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? t('common.saving') : supplier ? t('common.save') : t('suppliers.create')}
      </button>
      <div className="sm:col-span-5">
        <FormMessage result={result} success={t('common.saved')} />
      </div>
    </form>
  );
}
