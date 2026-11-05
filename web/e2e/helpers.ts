import { expect, type Page } from '@playwright/test';

export async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button.btn-primary[type="submit"]');
}

export async function signInAsAdmin(page: Page) {
  await signIn(page, 'admin@example.com', 'change-me-please');
  await page.waitForURL((url) => url.pathname === '/');
}

// Forms are interactive only after hydration; waiting for the network to settle keeps clicks from submitting natively.
export async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
}

/** A unique code per run, so specs never collide with data left by earlier runs. */
export const uniqueCode = (prefix: string) => `${prefix}-${Date.now().toString(36).toUpperCase()}`;

/** Creates a product from the products page and waits for it in the list. */
export async function createProduct(page: Page, sku: string, name: string) {
  await open(page, '/products');
  await page.fill('input[name="sku"]', sku);
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="minQuantity"]', '1');
  await page.click('button.btn-primary[type="submit"]');
  await expect(page.locator('table').getByText(sku, { exact: true })).toBeVisible({ timeout: 5000 });
}
