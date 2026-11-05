/** Reais typed as "49,90", "1.234,5" or "R$ 10" -> cents. Empty -> null; anything else -> undefined. */
export function parseReais(text: string): number | null | undefined {
  const value = text.replace(/R\$/i, '').replace(/\s/g, '');
  if (!value) return null;
  if (!/^\d{1,3}(\.?\d{3})*(,\d{1,2})?$/.test(value)) return undefined;
  const [whole, decimals = ''] = value.replace(/\./g, '').split(',');
  return Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
}

/** Cents -> "49,90", the form's input format (no thousands dot, so it reads back the same). */
export const reaisInput = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', ','));

type NumberFormatter = { number: (value: number, options: { style: 'currency'; currency: string }) => string };
/** Cents -> "R$ 49,90" (pt) or "R$49.90" (en): the formatter carries the user's locale. */
export const money = (format: NumberFormatter, cents: number) => format.number(cents / 100, { style: 'currency', currency: 'BRL' });
