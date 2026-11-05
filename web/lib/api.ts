import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const ROLES = ['ADMIN', 'OPERATOR', 'VIEWER'] as const;
export type Role = (typeof ROLES)[number];
export const isRole = (value: string | undefined): value is Role => ROLES.some((r) => r === value);
export type MovementType = 'IN' | 'OUT';

export type StockStatus = 'LOW' | 'OK' | 'OVER';
export type Product = { id: string; sku: string; name: string; quantity: number; reserved: number; available: number; minQuantity: number; maxQuantity: number | null; location: string | null; price: number | null; cost: number | null; status: StockStatus };
export type InventoryRow = {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  minQuantity: number;
  maxQuantity: number | null;
  status: StockStatus;
  totalIn: number;
  totalOut: number;
  avgDailyOut: number;
  daysOfCover: number | null;
  suggestedQuantity: number;
  reorderQuantity: number;
};
export type Movement = { id: string; type: MovementType; quantity: number; note: string | null; actorEmail: string | null; createdAt: string };
export type Dashboard = {
  totalProducts: number;
  lowStockProducts: number;
  totalUnits: number;
  daily: { date: string; in: number; out: number }[];
  recent: (Movement & { productId: string; productName: string })[];
};

export type StockAuditAction = 'PRODUCT_CREATED' | 'PRODUCT_UPDATED' | 'PRODUCT_DELETED' | 'STOCK_IN' | 'STOCK_OUT' | 'STOCK_RESERVED' | 'STOCK_RELEASED'
  | 'SUPPLIER_CREATED' | 'SUPPLIER_UPDATED' | 'SUPPLIER_DELETED'
  | 'PURCHASE_CREATED' | 'PURCHASE_UPDATED' | 'PURCHASE_ORDERED' | 'PURCHASE_RECEIVED' | 'PURCHASE_CANCELLED'
  | 'INVENTORY_STARTED' | 'INVENTORY_COUNTED' | 'INVENTORY_APPLIED' | 'INVENTORY_CANCELLED';
export type AuthAuditAction = 'USER_CREATED' | 'LOGIN_SUCCEEDED' | 'LOGIN_FAILED';
export type AuditEntry<A> = { id: string; action: A; productId: string | null; details: Record<string, unknown>; actorEmail: string | null; createdAt: string };

export type ProductInput = { name: string; minQuantity: number; maxQuantity: number | null; location: string | null; price: number | null; cost: number | null };

export type SupplierInput = { name: string; document: string | null; email: string | null; phone: string | null };
export type Supplier = SupplierInput & { id: string };
export const PURCHASE_STATUSES = ['DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];
/** Money in cents. */
export type PurchaseItemInput = { productId: string; quantity: number; unitCost: number };
export type PurchaseOrder = {
  id: string; number: number; supplierId: string; supplierName: string; status: PurchaseStatus;
  items: (PurchaseItemInput & { sku: string; name: string })[]; total: number; createdAt: string;
};
export type PurchaseChange = 'send' | 'cancel' | 'receive';
export type CountStatus = 'OPEN' | 'APPLIED' | 'CANCELLED';
export type CountItem = { productId: string; sku: string; name: string; location: string | null; expected: number; counted: number | null; difference: number | null };
export type InventoryCount = { id: string; number: number; status: CountStatus; items: CountItem[]; createdAt: string };
export type CountChange = 'apply' | 'cancel';
export type UserRecord = { id: string; email: string; role: Role };

export const TOKEN_COOKIE = 'token';
export const ROLE_COOKIE = 'role';

export type ErrorParams = Record<string, string | number>;
/** What a form needs to tell the user why the API refused: a code to translate, its values, and the English fallback. */
export type ApiFailure = { code?: string; params?: ErrorParams; message: string };

export class ApiError extends Error {
  constructor(readonly failure: ApiFailure, readonly status: number) {
    super(failure.message);
  }
}

const API_URL = process.env.API_URL ?? 'http://localhost:3031';

/** Waits between tries while a sleeping service starts (about 40 s in total, the cold start of a free host). */
const WAKE_DELAYS_MS = [2000, 3000, 5000, 8000, 10000, 10000];
const WAKING = new Set([502, 503, 504]);

async function send(path: string, init: { method?: string; body?: unknown } = {}): Promise<Response> {
  const token = (await cookies()).get(TOKEN_COOKIE)?.value;
  const method = init.method ?? 'GET';
  const call = () => fetch(`${API_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  let res = await call();
  // only reads and login are retried: repeating a write after a 502 could apply it twice
  if (method === 'GET' || path === '/auth/login') {
    for (const delay of WAKE_DELAYS_MS) {
      if (!WAKING.has(res.status)) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      res = await call();
    }
  }
  // expired or invalid session: send the user back to sign in (login itself returns 401 as a normal error)
  if (res.status === 401 && path !== '/auth/login') redirect('/login');
  if (!res.ok) {
    const body: { code?: string; params?: ErrorParams; message?: string } = await res.json().catch(() => ({}));
    throw new ApiError({ code: body.code, params: body.params, message: body.message ?? res.statusText }, res.status);
  }
  return res;
}

/** Path segment for an id from the client: "../users" must stay one segment, not climb the path. */
const productPath = (id: string) => `/products/${encodeURIComponent(id)}`;
const supplierPath = (id: string) => `/suppliers/${encodeURIComponent(id)}`;
const orderPath = (id: string) => `/purchase-orders/${encodeURIComponent(id)}`;
const countPath = (id: string) => `/inventory-counts/${encodeURIComponent(id)}`;

async function request<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  return (await send(path, init)).json();
}

/**
 * Starts every backend service without waiting: on a free host they sleep when idle, and this runs
 * while the visitor is still typing on the login page. Any answer (even 401) means the service is up.
 */
export function wakeServices(): void {
  for (const path of ['/auth/login', '/products', '/dashboard']) {
    void fetch(`${API_URL}${path}`, { cache: 'no-store' }).catch(() => undefined);
  }
}

export const api = {
  login: (body: { email: string; password: string }) =>
    request<{ accessToken: string; role: Role }>('/auth/login', { method: 'POST', body }),
  users: () => request<UserRecord[]>('/users'),
  createUser: (body: { email: string; password: string; role: Role }) => request<unknown>('/users', { method: 'POST', body }),
  dashboard: () => request<Dashboard>('/dashboard'),
  products: () => request<Product[]>('/products'),
  product: (id: string) => request<Product>(productPath(id)),
  movements: (id: string) => request<Movement[]>(`${productPath(id)}/movements`),
  inventory: () => request<{ aiEnabled: boolean; rows: InventoryRow[] }>('/inventory'),
  analyzeInventory: (locale: string) =>
    request<{ analysis: string; generatedAt: string }>('/inventory/analysis', { method: 'POST', body: { locale } }),
  createProduct: (body: ProductInput & { sku: string }) =>
    request<Product>('/products', { method: 'POST', body }),
  updateProduct: (id: string, body: ProductInput) =>
    request<Product>(productPath(id), { method: 'PATCH', body }),
  deleteProduct: async (id: string) => {
    await send(productPath(id), { method: 'DELETE' });
  },
  move: (id: string, body: { type: MovementType; quantity: number; note?: string }) =>
    request<Product>(`${productPath(id)}/movements`, { method: 'POST', body }),
  suppliers: () => request<Supplier[]>('/suppliers'),
  createSupplier: (body: SupplierInput) => request<Supplier>('/suppliers', { method: 'POST', body }),
  updateSupplier: (id: string, body: SupplierInput) => request<Supplier>(supplierPath(id), { method: 'PUT', body }),
  deleteSupplier: async (id: string) => {
    await send(supplierPath(id), { method: 'DELETE' });
  },
  purchaseOrders: () => request<PurchaseOrder[]>('/purchase-orders'),
  purchaseOrder: (id: string) => request<PurchaseOrder>(orderPath(id)),
  createPurchaseOrder: (body: { supplierId: string; items: PurchaseItemInput[] }) =>
    request<PurchaseOrder>('/purchase-orders', { method: 'POST', body }),
  suggestPurchaseOrder: (supplierId: string) =>
    request<PurchaseOrder>('/purchase-orders/suggest', { method: 'POST', body: { supplierId } }),
  updatePurchaseOrder: (id: string, items: PurchaseItemInput[]) =>
    request<PurchaseOrder>(orderPath(id), { method: 'PATCH', body: { items } }),
  changePurchaseOrder: (id: string, change: PurchaseChange) =>
    request<PurchaseOrder>(`${orderPath(id)}/${change}`, { method: 'POST' }),
  inventoryCounts: () => request<InventoryCount[]>('/inventory-counts'),
  inventoryCount: (id: string) => request<InventoryCount>(countPath(id)),
  startInventoryCount: () => request<InventoryCount>('/inventory-counts', { method: 'POST' }),
  enterCounted: (id: string, items: { productId: string; counted: number }[]) =>
    request<InventoryCount>(countPath(id), { method: 'PATCH', body: { items } }),
  changeInventoryCount: (id: string, change: CountChange) =>
    request<InventoryCount>(`${countPath(id)}/${change}`, { method: 'POST' }),
  auditStock: () => request<AuditEntry<StockAuditAction>[]>('/audit/stock?limit=100'),
  auditAuth: () => request<AuditEntry<AuthAuditAction>[]>('/audit/auth?limit=100'),
};

export async function currentRole(): Promise<Role | undefined> {
  const role = (await cookies()).get(ROLE_COOKIE)?.value;
  return isRole(role) ? role : undefined;
}
