'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { createPurchaseOrder } from '@/app/actions';
import type { Supplier } from '@/lib/api';
import { FormMessage, useActionResult } from './form';

/** Asks the stock service for a draft with every product below its minimum; success opens the draft. */
export function SuggestPurchaseForm({ suppliers }: { suppliers: Supplier[] }) {
  const t = useTranslations('purchases');
  const id = useId();
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [pending, setPending] = useState(false);
  const { result, submit } = useActionResult();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    await submit(() => createPurchaseOrder({ supplierId })).finally(() => setPending(false));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <p className="text-sm text-muted">{t('suggestHint')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={id} className="label">{t('supplier')}</label>
          <select id={id} className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={pending || !supplierId}>{pending ? t('suggesting') : t('suggest')}</button>
      </div>
      <FormMessage result={result} />
    </form>
  );
}
