'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { login } from '@/app/actions';
import { Field, FormMessage, useActionResult } from './form';
import { PasswordInput } from './PasswordInput';

export function LoginForm() {
  const t = useTranslations();
  const schema = z.object({
    email: z.email(t('login.invalidEmail')),
    password: z.string().min(1, t('common.required')),
  });
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });
  const { result, submit } = useActionResult();

  return (
    <form onSubmit={handleSubmit((v) => submit(() => login(v)))} className="space-y-4" noValidate>
      <Field label={t('login.email')} error={formState.errors.email?.message}>
        {(a) => <input {...a} type="email" autoComplete="username" {...register('email')} />}
      </Field>
      <Field label={t('login.password')} error={formState.errors.password?.message}>
        {(a) => <PasswordInput {...a} autoComplete="current-password" {...register('password')} />}
      </Field>
      <FormMessage result={result} />
      <button type="submit" className="btn-primary w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? t('common.loading') : t('login.submit')}
      </button>
    </form>
  );
}
