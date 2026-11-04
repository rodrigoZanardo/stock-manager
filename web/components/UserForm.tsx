'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { createUser } from '@/app/actions';
import { Field, FormMessage, useActionResult } from './form';
import { PasswordInput } from './PasswordInput';

export function UserForm() {
  const t = useTranslations();
  const schema = z.object({
    email: z.email(t('login.invalidEmail')),
    password: z.string().min(8, t('users.passwordHint')).max(128, t('common.tooLong', { max: 128 })),
    role: z.enum(['ADMIN', 'OPERATOR']),
  });
  const { register, handleSubmit, formState, reset } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'OPERATOR' },
  });
  const { result, submit } = useActionResult();

  const onSubmit = handleSubmit(async (v) => {
    if (await submit(() => createUser(v))) reset();
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr_auto] sm:items-start" noValidate>
      <Field label={t('users.email')} error={formState.errors.email?.message}>
        {(a) => <input {...a} type="email" autoComplete="off" {...register('email')} />}
      </Field>
      <Field label={t('users.password')} error={formState.errors.password?.message} hint={t('users.passwordHint')}>
        {(a) => <PasswordInput {...a} autoComplete="new-password" {...register('password')} />}
      </Field>
      <Field label={t('users.role')}>
        {(a) => (
          <select {...a} {...register('role')}>
            <option value="OPERATOR">{t('users.OPERATOR')}</option>
            <option value="ADMIN">{t('users.ADMIN')}</option>
          </select>
        )}
      </Field>
      <button type="submit" className="btn-primary sm:mt-6" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? t('common.saving') : t('users.submit')}
      </button>
      <div className="sm:col-span-4">
        <FormMessage result={result} success={t('users.created')} />
      </div>
    </form>
  );
}
