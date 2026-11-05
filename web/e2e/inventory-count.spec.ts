import { expect, test } from '@playwright/test';
import { createProduct, open, signInAsAdmin, uniqueCode } from './helpers';

test('an applied stock count sets the counted quantity with a movement', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await signInAsAdmin(page);

  const sku = uniqueCode('CNT');
  const name = `Counted ${sku}`;
  await createProduct(page, sku, name);

  await open(page, '/counts');
  await page.getByRole('button', { name: 'Start count' }).click();
  await page.waitForURL(/\/counts\/[0-9a-f-]{36}$/);
  await page.waitForLoadState('networkidle');

  await page.getByLabel(`Counted quantity of ${name}`).fill('3');
  await expect(page.locator('tr', { hasText: sku }).getByText('+3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save counts' }).click();
  await expect(page.getByText('Saved.')).toBeVisible({ timeout: 5000 });

  await page.getByRole('button', { name: 'Apply count' }).click();
  await expect(page.getByText('Applied', { exact: true })).toBeVisible({ timeout: 5000 });

  await open(page, '/products');
  await page.click(`tr:has-text("${sku}") a`);
  await expect(page.getByText('+3', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Inventário #\d+/)).toBeVisible();
});
