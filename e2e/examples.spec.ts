import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, stats, trackErrors } from './helpers';

async function openExample(page: Page, title: string) {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Examples' }).hover();
  await page.getByRole('menu', { name: 'Examples' }).getByRole('menuitem', { name: title }).click();
}

const unsavedDialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });

test('every example opens and renders without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  const looks: [string, string][] = [
    ['Riverside Farm', 'grass'],
    ['Ember Cavern', 'rough-stone'],
    ['The Sunken Crypt', 'fitted-stone'],
  ];
  for (const [title, background] of looks) {
    // An untouched example has nothing to lose, so switching doesn't ask
    await openExample(page, title);
    await expect(unsavedDialog(page)).toHaveCount(0);
    await expect(page.getByLabel('Map title')).toHaveValue(title);
    await expect(page.getByLabel('Background')).toHaveValue(background);
  }
  // The crypt is the starter map again
  expect(await stats(page)).toEqual({ rooms: 194, water: 16, foliage: 4 });
  expect(errors).toEqual([]);
});

test('opening an example with unsaved changes asks first', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await openExample(page, 'Ember Cavern');
  await dragCells(page, [-15, 8], [-12, 8]);
  await openExample(page, 'The Sunken Crypt');
  await expect(unsavedDialog(page)).toBeVisible();
  await unsavedDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Ember Cavern');

  await openExample(page, 'The Sunken Crypt');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('The Sunken Crypt');
});
