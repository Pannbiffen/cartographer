import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, saveMap, stats } from './helpers';

async function fileMenu(page: Page, item: string | RegExp) {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function openPreferences(page: Page) {
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  return page.getByRole('dialog', { name: 'Preferences' });
}

const unsavedDialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });

test('File > New starts a blank map without asking when nothing is unsaved', async ({ page }) => {
  await openApp(page);
  expect((await stats(page)).rooms).toBeGreaterThan(0);

  await fileMenu(page, 'New');
  await expect(unsavedDialog(page)).toHaveCount(0);
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0 · Water: 0');
  await expect(page.getByLabel('Map title')).toHaveValue('Untitled map');
  // A fresh history: nothing to undo back to the old map
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();
});

test('unsaved changes are kept, discarded or saved first before a new map', async ({ page }) => {
  await openApp(page);
  const before = (await stats(page)).rooms;
  await dragCells(page, [7, 6], [10, 6]);
  const rooms = (await stats(page)).rooms;
  expect(rooms).toBeGreaterThan(before);

  // Cancel keeps the map
  await page.keyboard.press('Control+Alt+n');
  await expect(unsavedDialog(page)).toContainText('not saved to a file');
  await unsavedDialog(page).getByRole('button', { name: 'Cancel' }).click();
  expect((await stats(page)).rooms).toBe(rooms);

  // Escape does too
  await page.keyboard.press('Control+Alt+n');
  await page.keyboard.press('Escape');
  await expect(unsavedDialog(page)).toHaveCount(0);
  expect((await stats(page)).rooms).toBe(rooms);

  // Save first downloads the map, then starts the new one
  await page.getByRole('button', { name: 'New', exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    unsavedDialog(page).getByRole('button', { name: 'Save first' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('the_sunken_crypt.dndmap');
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');

  // Don't save just replaces it
  await dragCells(page, [0, 0], [2, 0]);
  await fileMenu(page, 'New');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');

  // Saving clears the unsaved state; undoing back to the saved map does too
  await dragCells(page, [0, 0], [2, 0]);
  await saveMap(page);
  await dragCells(page, [0, 2], [2, 2]);
  await page.keyboard.press('Control+z');
  await fileMenu(page, 'New');
  await expect(unsavedDialog(page)).toHaveCount(0);
});

test('opening a file over unsaved changes asks first', async ({ page }) => {
  await openApp(page);
  const map = await saveMap(page);
  await dragCells(page, [7, 6], [10, 6]);

  await page.locator('input[type=file]').setInputFiles({
    name: 'other.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...map, title: 'Other Map' })),
  });
  await expect(unsavedDialog(page)).toHaveAccessibleName('Open “other.dndmap”?');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Other Map');
});

test('new maps start with the look chosen in Preferences', async ({ page }) => {
  await openApp(page);
  const dialog = await openPreferences(page);
  const group = dialog.getByRole('group', { name: 'New maps' });
  await group.getByLabel('Map style').selectOption('blueprint');
  await group.getByLabel('Grid shape').selectOption('hex-flat');
  await group.getByLabel('Show battle grid').uncheck();
  await page.keyboard.press('Escape');

  // Kept across reloads like the other preferences. The untouched starter
  // map isn't kept in the browser, so New doesn't ask.
  await page.reload();
  await openApp(page);
  await fileMenu(page, 'New');
  await expect(page.getByLabel('Map style')).toHaveValue('blueprint');
  let map = await saveMap(page);
  expect(map).toMatchObject({ theme: 'blueprint', gridType: 'hex-flat', showGrid: false, hatchLength: 14 });

  // Copy the open map's look, then restore the defaults
  await page.getByLabel('Map style').selectOption('slate');
  await page.getByLabel('Map title').fill('Scratch');
  await (await openPreferences(page)).getByRole('button', { name: /current map/ }).click();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+Alt+n');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Untitled map');
  map = await saveMap(page);
  expect(map).toMatchObject({ theme: 'slate', gridType: 'hex-flat', showGrid: false });

  await (await openPreferences(page)).getByRole('button', { name: 'Restore defaults' }).click();
  await page.keyboard.press('Escape');
  await fileMenu(page, 'New');
  await expect(page.getByLabel('Map style')).toHaveValue('parchment');
  map = await saveMap(page);
  expect(map).toMatchObject({ theme: 'parchment', gridType: 'square', showGrid: true, gridOpacity: 0.22 });
});
