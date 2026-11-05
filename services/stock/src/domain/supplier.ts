import { AppError } from '@stock/shared';

/** Optional fields: empty or null means not informed. */
export type SupplierDetails = { name: string; document?: string | null; email?: string | null; phone?: string | null };
type SupplierProps = { id: string; name: string; document: string | null; email: string | null; phone: string | null };

export class Supplier {
  private constructor(private props: SupplierProps) {}

  static create(input: { id: string } & SupplierDetails): Supplier {
    return new Supplier({ id: input.id, ...validDetails(input) });
  }

  /** Full replacement: a field left out is cleared. */
  update(input: SupplierDetails): void {
    Object.assign(this.props, validDetails(input));
  }

  static restore(props: SupplierProps): Supplier {
    return new Supplier({ ...props });
  }

  get id() { return this.props.id; }
  get name() { return this.props.name; }
  get document() { return this.props.document; }
  get email() { return this.props.email; }
  get phone() { return this.props.phone; }
}

const blankToNull = (v: string | null | undefined) => v?.trim() || null;

function validDetails(input: SupplierDetails): Omit<SupplierProps, 'id'> {
  const name = input.name.trim();
  if (!name) throw new AppError('SUPPLIER_NAME_REQUIRED');
  const raw = blankToNull(input.document);
  // stored as digits only; the punctuation 12.345.678/0001-95 is accepted on input
  const document = raw === null ? null : raw.replace(/[.\/-]/g, '');
  if (document !== null && !isCnpj(document)) throw new AppError('SUPPLIER_DOCUMENT_INVALID');
  const email = blankToNull(input.email)?.toLowerCase() ?? null;
  if (email !== null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('EMAIL_INVALID');
  return { name, document, email, phone: blankToNull(input.phone) };
}

/** 14 digits whose last two are the CNPJ check digits (mod 11, weights 5..2 9..2 and 6..2 9..2). */
export function isCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1+$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * ((length - 1 - i) % 8 + 2);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return check(12) === Number(digits[12]) && check(13) === Number(digits[13]);
}
