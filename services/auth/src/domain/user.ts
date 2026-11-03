import { AppError, type Role } from '@stock/shared';

const MIN_PASSWORD = 8;

export type { Role };

type UserProps = { id: string; email: string; passwordHash: string; role: Role };

export class User {
  private constructor(private readonly props: UserProps) {}

  static create(input: UserProps): User {
    const email = User.normalizeEmail(input.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError('EMAIL_INVALID');
    return new User({ ...input, email });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  static normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Checked on the plain password, before it is hashed. */
  static assertPassword(password: string): void {
    if (password.length < MIN_PASSWORD) throw new AppError('PASSWORD_TOO_SHORT', { min: MIN_PASSWORD });
  }

  get id() { return this.props.id; }
  get email() { return this.props.email; }
  get passwordHash() { return this.props.passwordHash; }
  get role() { return this.props.role; }
}
