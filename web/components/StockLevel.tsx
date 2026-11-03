import { getTranslations } from 'next-intl/server';
import type { StockStatus } from '@/lib/api';

const FILL: Record<StockStatus, string> = { LOW: 'bg-danger', OK: 'bg-brand', OVER: 'bg-warning' };

/**
 * Shelf-label gauge: fill = quantity, hazard stripe = minimum, tick = maximum.
 * Without a maximum the scale stretches to twice the minimum, so the minimum mark stays readable.
 */
export async function StockLevel({
  quantity,
  minQuantity,
  maxQuantity,
  status,
  className = '',
}: {
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  status: StockStatus;
  className?: string;
}) {
  const t = await getTranslations('products');
  const scale = Math.max(maxQuantity ?? minQuantity * 2, quantity, 1);
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;

  return (
    <div
      role="meter"
      aria-label={t('level')}
      aria-valuemin={0}
      aria-valuemax={scale}
      aria-valuenow={quantity}
      aria-valuetext={t('levelText', { quantity, min: minQuantity })}
      className={`relative h-2.5 rounded-sm bg-panel-muted ring-1 ring-line ring-inset ${className}`}
    >
      <div className={`h-full rounded-sm ${FILL[status]}`} style={{ width: pct(quantity) }} />
      {minQuantity > 0 && (
        <div
          aria-hidden
          className="absolute -inset-y-1 w-1.5 -translate-x-1/2 bg-[repeating-linear-gradient(-45deg,var(--signal)_0_3px,var(--signal-ink)_3px_6px)]"
          style={{ left: pct(minQuantity) }}
        />
      )}
      {maxQuantity !== null && (
        <div aria-hidden className="absolute -inset-y-1 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pct(maxQuantity) }} />
      )}
    </div>
  );
}
