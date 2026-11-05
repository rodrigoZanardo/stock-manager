'use client';

import { useTransition } from 'react';
import type { ActionResult } from '@/app/actions';
import { FormMessage, useActionResult } from './form';

/** One server action behind a button, with an optional confirm and the API's refusal shown below. Pass a bound action. */
export function ActionButton({ label, action, confirm, className = 'btn-secondary' }: {
  label: string;
  action: () => Promise<ActionResult>;
  confirm?: string;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const { result, submit } = useActionResult();

  const onClick = () => {
    if (!confirm || window.confirm(confirm)) start(async () => void (await submit(action)));
  };

  return (
    <div className="space-y-2">
      <button type="button" className={className} onClick={onClick} disabled={pending}>{label}</button>
      <FormMessage result={result} />
    </div>
  );
}
