import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { money } from '@/lib/money';
import { api, ApiError, currentRole, isRole, type AuditEntry, type AuthAuditAction, type StockAuditAction } from '@/lib/api';

type Action = StockAuditAction | AuthAuditAction;
type Entry = AuditEntry<Action>;

const DANGER: ReadonlySet<Action> = new Set(['LOGIN_FAILED', 'PRODUCT_DELETED', 'SUPPLIER_DELETED', 'PURCHASE_CANCELLED', 'INVENTORY_CANCELLED']);

/** Reads a key from untyped audit details without trusting their shape. */
function field(source: unknown, key: string): unknown {
  if (typeof source !== 'object' || source === null) return undefined;
  return Object.getOwnPropertyDescriptor(source, key)?.value;
}

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

type Labels = { min: string; max: string; price: string; cost: string; none: string; money: (cents: number) => string; userAs: (email: string, role: string) => string };

/** One-line human summary of an audit entry's details. */
function summarize(e: Entry, l: Labels): string {
  const d = e.details;
  switch (e.action) {
    case 'PRODUCT_CREATED':
    case 'PRODUCT_DELETED':
      return [text(field(d, 'sku')), text(field(d, 'name'))].filter(Boolean).join(' · ');
    case 'PRODUCT_UPDATED': {
      const before = field(d, 'before');
      const after = field(d, 'after');
      const label: Record<string, string> = { name: '', minQuantity: l.min, maxQuantity: l.max, price: l.price, cost: l.cost };
      const isMoney = (k: string) => k === 'price' || k === 'cost';
      return Object.keys(label)
        .filter((k) => field(before, k) !== field(after, k))
        .map((k) => {
          const show = (v: unknown) => (isMoney(k) && typeof v === 'number' ? l.money(v) : text(v) || l.none);
          return `${label[k]} ${show(field(before, k))} → ${show(field(after, k))}`.trim();
        })
        .join(' · ');
    }
    case 'STOCK_IN':
    case 'STOCK_OUT': {
      const sign = e.action === 'STOCK_IN' ? '+' : '−';
      const note = text(field(d, 'note'));
      return `${sign}${text(field(d, 'quantity'))} → ${text(field(d, 'quantityAfter'))}${note ? ` · ${note}` : ''}`;
    }
    case 'STOCK_RESERVED':
    case 'STOCK_RELEASED': {
      const note = text(field(d, 'note'));
      return `${text(field(d, 'quantity'))}${note ? ` · ${note}` : ''}`;
    }
    case 'SUPPLIER_CREATED':
    case 'SUPPLIER_DELETED':
      return text(field(d, 'name'));
    case 'SUPPLIER_UPDATED':
      return text(field(field(d, 'after'), 'name'));
    case 'PURCHASE_CREATED':
    case 'PURCHASE_UPDATED':
    case 'PURCHASE_ORDERED':
    case 'PURCHASE_RECEIVED':
    case 'PURCHASE_CANCELLED': {
      const total = field(d, 'total');
      return [`#${text(field(d, 'number'))}`, text(field(d, 'supplier')), typeof total === 'number' ? l.money(total) : ''].filter(Boolean).join(' · ');
    }
    case 'INVENTORY_STARTED':
    case 'INVENTORY_COUNTED':
    case 'INVENTORY_APPLIED':
    case 'INVENTORY_CANCELLED':
      return `#${text(field(d, 'number'))}`;
    case 'USER_CREATED':
      return l.userAs(text(field(d, 'email')), text(field(d, 'role')));
    default:
      return '';
  }
}

/** A failed list must not hide the other one; anything that is not an API refusal still breaks the page. */
async function orEmpty<T>(p: Promise<T[]>): Promise<T[] | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError) return null;
    throw err;
  }
}

export default async function AuditPage() {
  // the API also refuses non-admins; this only hides a page they cannot use
  if ((await currentRole()) !== 'ADMIN') notFound();
  const [t, tUsers, format, stock, auth] = await Promise.all([
    getTranslations('audit'),
    getTranslations('users'),
    getFormatter(),
    orEmpty(api.auditStock()),
    orEmpty(api.auditAuth()),
  ]);
  const rows: Entry[] = [...(stock ?? []), ...(auth ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const labels: Labels = {
    min: t('min'),
    max: t('max'),
    price: t('price'),
    cost: t('cost'),
    money: (cents) => money(format, cents),
    none: t('none'),
    userAs: (email, role) => t('as', { email, role: isRole(role) ? tUsers(role) : role }),
  };

  return (
    <>
      <h1 className="page-title">{t('title')}</h1>
      <section className="card space-y-4">
        <p className="text-sm text-muted">{t('subtitle')}</p>
        {(stock === null || auth === null) && (
          <p role="alert" className="rounded bg-warning-subtle px-3 py-2 text-sm text-warning">{t('partial')}</p>
        )}
        {rows.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">{t('when')}</th>
                  <th className="th">{t('who')}</th>
                  <th className="th">{t('what')}</th>
                  <th className="th">{t('details')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const summary = summarize(e, labels);
                  return (
                    <tr key={e.id}>
                      <td className="td whitespace-nowrap">
                        {format.dateTime(new Date(e.createdAt), { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className="td">{e.actorEmail ?? t('system')}</td>
                      <td className="td">
                        <span className={`badge ${DANGER.has(e.action) ? 'bg-danger-subtle text-danger' : 'bg-brand-subtle text-brand'}`}>
                          {t(`actions.${e.action}`)}
                        </span>
                      </td>
                      <td className="td text-muted">
                        {e.productId ? <Link href={`/products/${e.productId}`} className="link">{summary}</Link> : summary}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
