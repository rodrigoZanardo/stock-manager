import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button.btn-primary[type="submit"]');
}

// Forms are interactive only after hydration; waiting for the network to settle keeps clicks from submitting natively.
async function openProducts(page: Page) {
  await page.goto('/products');
  await page.waitForLoadState('networkidle');
}

test('the team list shows the admin account', async ({ page }) => {
  await signIn(page, 'admin@example.com', 'change-me-please');
  await page.waitForURL((url) => url.pathname === '/');
  await page.goto('/users');
  await expect(page.locator('table').getByText('admin@example.com')).toBeVisible();
});

test('a wrong password shows the translated error', async ({ page }) => {
  await signIn(page, 'admin@example.com', 'wrong-password');
  await expect(page.getByText('Invalid email or password.')).toBeVisible();
});

test('a VIEWER cannot sign in to the web app', async ({ page }) => {
  const email = process.env.VIEWER_EMAIL;
  const password = process.env.VIEWER_PASSWORD;
  test.skip(!email || !password, 'needs VIEWER_EMAIL and VIEWER_PASSWORD seeded');
  if (!email || !password) return;
  await signIn(page, email, password);
  await expect(page.getByText('This account is for integrations only and cannot sign in to the web app.')).toBeVisible();
  expect((await page.context().cookies()).some((c) => c.name === 'token')).toBe(false);
});

test('a new product appears in the list without reloading', async ({ page }) => {
  await signIn(page, 'admin@example.com', 'change-me-please');
  await page.waitForURL((url) => url.pathname === '/');

  const sku = `E2E-${Date.now().toString(36).toUpperCase()}`;
  await openProducts(page);
  await page.fill('input[name="sku"]', sku);
  await page.fill('input[name="name"]', 'Created by e2e');
  await page.fill('input[name="minQuantity"]', '1');
  await page.click('button.btn-primary[type="submit"]');

  await expect(page.locator('table').getByText(sku)).toBeVisible({ timeout: 5000 });
});

test('a stock movement appears in the product history without reloading', async ({ page }) => {
  await signIn(page, 'admin@example.com', 'change-me-please');
  await page.waitForURL((url) => url.pathname === '/');

  const sku = `MOV-${Date.now().toString(36).toUpperCase()}`;
  await openProducts(page);
  await page.fill('input[name="sku"]', sku);
  await page.fill('input[name="name"]', 'Movement e2e');
  await page.fill('input[name="minQuantity"]', '1');
  await page.click('button.btn-primary[type="submit"]');
  await expect(page.locator('table').getByText(sku)).toBeVisible({ timeout: 5000 });

  await page.click(`tr:has-text("${sku}") a`);
  await page.waitForLoadState('networkidle');
  await page.selectOption('select[name="type"]', 'IN');
  await page.fill('input[name="quantity"]', '7');
  await page.click('button.btn-primary[type="submit"]');

  await expect(page.getByText('+7', { exact: true })).toBeVisible({ timeout: 5000 });
});
