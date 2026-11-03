'use client';

import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useState, useTransition, type ReactNode } from 'react';
import type { ActionResult } from '@/app/actions';

type Result = ActionResult & { ok?: boolean };

type ControlProps = { id: string; className: string; 'aria-invalid': boolean; 'aria-describedby'?: string };

/** Label, control, hint and error wired together for screen readers. The child renders the input or select. */
export function Field({
  label,
  error,
  hint,
  children,
}: { label: string; error?: string; hint?: string; children: (props: ControlProps) => ReactNode }) {
  const id = useId();
  const describedBy = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      {children({ id, className: 'input', 'aria-invalid': !!error, 'aria-describedby': describedBy })}
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-muted">{hint}</p>}
      {error && <p id={`${id}-error`} className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

/** Keeps the last server action result so the form can show why the API refused (see FormMessage). */
export function useActionResult() {
  const [result, setResult] = useState<Result>({});
  const [, start] = useTransition();
  const router = useRouter();
  // router.refresh only takes effect inside a transition; revalidatePath alone left the open page stale
  const submit = (action: () => Promise<ActionResult>): Promise<boolean> =>
    new Promise((resolve, reject) => {
      setResult({});
      start(async () => {
        try {
          const r = await action();
          setResult(r.error ? r : { ok: true });
          if (!r.error) router.refresh();
          resolve(!r.error);
        } catch (e) {
          reject(e);
        }
      });
    });
  return { result, submit };
}

export function FormMessage({ result, success }: { result: Result; success?: string }) {
  const t = useTranslations('errors');
  let content: ReactNode = null;
  if (result.error) {
    const { code, params } = result.error;
    // codes come from the API's error catalog; an unknown one falls back to the generic text, never to raw English
    const text = code && t.has(code) ? t(code, params) : t('UNKNOWN');
    content = <p role="alert" className="text-sm text-danger">{text}</p>;
  } else if (result.ok && success) content = <p className="text-sm text-success">{success}</p>;
  // the live region stays mounted: screen readers only announce text that changes inside an existing region
  return <div aria-live="polite">{content}</div>;
}
