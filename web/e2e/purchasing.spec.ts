import { expect, test } from '@playwright/test';
import { createProduct, open, signInAsAdmin, uniqueCode } from './helpers';

test('a received purchase order books its items into stock', async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await signInAsAdmin(page);

  const sku = uniqueCode('PO');
  const supplier = `Supplier ${sku}`;
  await createProduct(page, sku, `Part ${sku}`);

  await open(page, '/suppliers');
  await page.fill('input[name="name"]', supplier);
  await page.getByRole('button', { name: 'Create supplier' }).click();
  await expect(page.getByText(supplier)).toBeVisible({ timeout: 5000 });

  await open(page, '/purchases');
  const form = page.locator('section', { hasText: 'New purchase order' });
  await form.locator('select[name="supplierId"]').selectOption({ label: supplier });
  await form.getByRole('button', { name: 'Add item' }).click();
  await form.locator('select[name="items.0.productId"]').selectOption({ label: `${sku} · Part ${sku}` });
  await form.locator('input[name="items.0.quantity"]').fill('5');
  await form.locator('input[name="items.0.unitCost"]').fill('12,50');
  await form.getByRole('button', { name: 'Create draft' }).click();

  await page.waitForURL(/\/purchases\/[0-9a-f-]{36}$/);
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: 'Send to supplier' }).click();
  await page.getByRole('button', { name: 'Receive goods' }).click();
  await expect(page.getByText('Received', { exact: true })).toBeVisible({ timeout: 5000 });

  await open(page, '/products');
  await page.click(`tr:has-text("${sku}") a`);
  await expect(page.getByText('+5', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Pedido de compra #\d+/)).toBeVisible();
});
