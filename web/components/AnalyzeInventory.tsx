'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { analyzeInventory } from '@/app/actions';
import { FormMessage, useActionResult } from './form';

export function AnalyzeInventory() {
  const t = useTranslations('inventory');
  const [pending, start] = useTransition();
  const [analysis, setAnalysis] = useState<string>();
  const { result, submit } = useActionResult();

  const run = () =>
    start(async () => {
      const pendingResult = analyzeInventory();
      await submit(() => pendingResult);
      setAnalysis((await pendingResult).analysis);
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">{t('aiHint')}</p>
        <button type="button" className="btn-primary" onClick={run} disabled={pending}>
          {pending ? t('aiRunning') : t('aiRun')}
        </button>
      </div>
      <FormMessage result={result} />
      <div aria-live="polite">
        {analysis && <div className="whitespace-pre-line rounded-md bg-panel-muted p-4 text-sm leading-relaxed">{analysis}</div>}
      </div>
    </div>
  );
}
