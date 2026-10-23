import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, newEmptyMap, stats, trackErrors } from './helpers';

const welcome = (page: Page) => page.getByRole('dialog', { name: 'New map' });
const card = (page: Page, title: string) => welcome(page).getByRole('button', { name: new RegExp(`^${title}`) });
const unsavedDialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });
const STARTER = { rooms: 194, water: 16, foliage: 4 };

test('a first visit shows the welcome dialog, and Escape keeps the starter map', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { welcome: true });
  await expect(welcome(page)).toBeVisible();
  for (const title of ['Empty map', 'The Sunken Crypt', 'Riverside Farm', 'Ember Cavern']) {
    await expect(card(page, title)).toBeVisible();
  }
  // Every example has a drawn thumbnail
  const sizes = await welcome(page).locator('img').evaluateAll((imgs) =>
    imgs.map((img) => (img as HTMLImageElement).naturalWidth)
  );
  expect(sizes).toEqual([320, 320, 320]);
  await expect(card(page, 'Empty map')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(welcome(page)).toHaveCount(0);
  expect(await stats(page)).toEqual(STARTER);
  expect(errors).toEqual([]);
});

test('each card opens its map', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { welcome: true, mapSettings: true });
  await card(page, 'Riverside Farm').click();
  await expect(welcome(page)).toHaveCount(0);
  await expect(page.getByLabel('Map title')).toHaveValue('Riverside Farm');

  // An untouched example has nothing to lose, so the next one doesn't ask
  for (const title of ['Ember Cavern', 'The Sunken Crypt']) {
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'New' }).click();
    await card(page, title).click();
    await expect(unsavedDialog(page)).toHaveCount(0);
    await expect(page.getByLabel('Map title')).toHaveValue(title);
  }
  expect(errors).toEqual([]);
});

test('File > New offers an empty map in the Preferences look, and asks first over unsaved changes', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await expect(welcome(page)).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  await page.getByRole('dialog', { name: 'Preferences' }).getByLabel('Background').selectOption('sand');
  await page.keyboard.press('Escape');

  await dragCells(page, [7, 6], [10, 6]);
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await card(page, 'Ember Cavern').click();
  await expect(unsavedDialog(page)).toBeVisible();
  await unsavedDialog(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('The Sunken Crypt');

  await newEmptyMap(page);
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');
  await expect(page.getByLabel('Background')).toHaveValue('sand');
});

test('switched off, it no longer opens on start; a resumed map never shows it', async ({ page }) => {
  await openApp(page, { welcome: true });
  await welcome(page).getByLabel('Show this when I start').uncheck();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('map-stats')).toBeVisible();
  await expect(welcome(page)).toHaveCount(0);

  // The setting is in Preferences too, and File > New still shows the dialog
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const prefs = page.getByRole('dialog', { name: 'Preferences' });
  await expect(prefs.getByLabel('Show the welcome dialog on start')).not.toBeChecked();
  await prefs.getByLabel('Show the welcome dialog on start').check();
  await page.keyboard.press('Escape');

  // A changed map is stored and reopened on the next visit, without the dialog
  await dragCells(page, [7, 6], [10, 6]);
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('map-stats')).toBeVisible();
  expect((await stats(page)).rooms).toBeGreaterThan(STARTER.rooms);
  await expect(welcome(page)).toHaveCount(0);
});
