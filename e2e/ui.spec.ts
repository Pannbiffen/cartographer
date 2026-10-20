import { test, expect } from '@playwright/test';
import { openApp, saveMap } from './helpers';

test('menus run commands and show their state', async ({ page }) => {
  await openApp(page);
  const menubar = page.getByRole('menubar');

  // Tools menu picks a tool and checks it; the toolbox follows
  await menubar.getByRole('menuitem', { name: 'Tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Water/ }).click();
  await expect(page.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // View > Show Grid toggles the map setting
  await menubar.getByRole('menuitem', { name: 'View' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Show Grid/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: /Show Grid/ }).click();
  expect((await saveMap(page)).showGrid).toBe(false);

  // Hovering along the bar switches menus once one is open; Escape closes
  await menubar.getByRole('menuitem', { name: 'File' }).click();
  await menubar.getByRole('menuitem', { name: 'Edit' }).hover();
  await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Rotate Selection/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // File > Export opens the export dialog; Escape closes it
  await menubar.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Export/ }).click();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the properties panel can be hidden from the View menu', async ({ page }) => {
  await openApp(page);
  const canvasWidth = async () => (await page.locator('canvas').boundingBox())!.width;
  const before = await canvasWidth();

  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Properties Panel/ }).click();
  await expect(page.getByRole('complementary', { name: 'Properties' })).toHaveCount(0);
  expect(await canvasWidth()).toBeGreaterThan(before);
});
