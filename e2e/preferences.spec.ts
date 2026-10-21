import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, saveMap, stats } from './helpers';

const html = (page: Page) => page.locator('html');

async function openPreferences(page: Page) {
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  return page.getByRole('dialog', { name: 'Preferences' });
}

test('dark theme by default; appearance choices apply and persist', async ({ page }) => {
  await openApp(page);
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'dark');
  const fontSize = () => html(page).evaluate((el) => getComputedStyle(el).fontSize);
  expect(await fontSize()).toBe('13px');

  const dialog = await openPreferences(page);
  await dialog.getByRole('radio', { name: 'Light' }).click();
  await dialog.getByRole('radio', { name: 'green' }).click();
  await dialog.getByRole('radio', { name: 'Large' }).click();
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'light');
  await expect(html(page)).toHaveAttribute('data-accent', 'green');
  expect(await fontSize()).toBe('15px');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  await page.reload();
  await openApp(page);
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'light');
  await expect(html(page)).toHaveAttribute('data-accent', 'green');
  expect(await fontSize()).toBe('15px');
});

test('the System theme follows the operating system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openApp(page);
  const dialog = await openPreferences(page);
  await dialog.getByRole('radio', { name: 'System' }).click();
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'dark');
});

test('autosave can be turned off, which drops the saved map', async ({ page }) => {
  await openApp(page);
  await dragCells(page, [-15, 8], [-5, 8]);
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();

  await page.keyboard.press('Control+,');
  await page.getByLabel(/Autosave the map/).uncheck();
  await expect(page.getByText('Autosave off')).toBeVisible();

  await page.reload();
  await openApp(page);
  expect((await stats(page)).rooms).toBe(194);
  await expect(page.getByText('Autosave off')).toBeVisible();
});

test('with autosave off, leaving with unsaved work asks first', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+,');
  await page.getByLabel(/Autosave the map/).uncheck();
  await page.keyboard.press('Escape');
  await dragCells(page, [-15, 8], [-5, 8]);

  // Closing asks; dismissing keeps the page open
  const warning = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const dialog = await warning;
  expect(dialog.type()).toBe('beforeunload');
  await dialog.dismiss();
  expect(page.isClosed()).toBe(false);

  // Once saved to a file it closes without asking
  await saveMap(page);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.type());
    void d.accept();
  });
  await page.close({ runBeforeUnload: true });
  await page.waitForEvent('close');
  expect(dialogs).toEqual([]);
});

test('resetting local data asks first, then restores defaults', async ({ page }) => {
  await openApp(page);
  await dragCells(page, [-15, 8], [-5, 8]);
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();
  let dialog = await openPreferences(page);
  await dialog.getByRole('radio', { name: 'Light' }).click();

  // Cancel keeps everything
  await dialog.getByRole('button', { name: /Reset all local data/ }).click();
  await expect(dialog.getByRole('alert')).toContainText('not affected');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  expect((await stats(page)).rooms).toBe(205);

  await dialog.getByRole('button', { name: /Reset all local data/ }).click();
  await Promise.all([
    page.waitForEvent('load'),
    dialog.getByRole('button', { name: 'Delete and reload' }).click(),
  ]);
  await openApp(page);
  expect((await stats(page)).rooms).toBe(194);
  await expect(html(page)).toHaveAttribute('data-ui-theme', 'dark');
  dialog = await openPreferences(page);
  await expect(dialog.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
});
