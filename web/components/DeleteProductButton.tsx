'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { deleteProduct } from '@/app/actions';
import { FormMessage, useActionResult } from './form';

export function DeleteProductButton({ id }: { id: string }) {
  const t = useTranslations('products');
  const [pending, start] = useTransition();
  const { result, submit } = useActionResult();

  const onClick = () => {
    if (window.confirm(t('deleteConfirm'))) start(async () => void (await submit(() => deleteProduct(id))));
  };

  return (
    <div className="space-y-2">
      <button type="button" className="btn-danger" onClick={onClick} disabled={pending}>
        {t('delete')}
      </button>
      <FormMessage result={result} />
    </div>
  );
}
