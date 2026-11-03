/**
 * Values that cross service boundaries. Declared once so DTO validation, Swagger enums
 * and TypeScript types cannot drift apart between services.
 */
export const ROLES = ['ADMIN', 'OPERATOR'] as const;
export type Role = (typeof ROLES)[number];

export const MOVEMENT_TYPES = ['IN', 'OUT'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const STOCK_STATUSES = ['LOW', 'OK', 'OVER'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const DAY_MS = 24 * 60 * 60 * 1000;

export const isOneOf = <T extends string>(values: readonly T[], v: string): v is T => values.some((x) => x === v);
export const isRole = (v: string): v is Role => isOneOf(ROLES, v);
export const isMovementType = (v: string): v is MovementType => isOneOf(MOVEMENT_TYPES, v);
