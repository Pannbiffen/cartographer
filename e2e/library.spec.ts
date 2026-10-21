import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, saveMap, stats, trackErrors } from './helpers';

async function fileMenu(page: Page, item: string | RegExp) {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

async function openRecent(page: Page, title: string) {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'Open Recent' }).hover();
  await page.getByRole('menu', { name: 'Open Recent' }).getByRole('menuitem', { name: title }).click();
}

/** Draws a corridor of 11 cells, names the map and waits for the autosave */
async function drawMap(page: Page, title: string, row = 8) {
  await dragCells(page, [-15, row], [-5, row]);
  await page.getByLabel('Map title').fill(title);
  // Shortcuts are ignored while the title field has focus
  await page.getByLabel('Map title').blur();
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();
}

const unsavedDialog = (page: Page) => page.getByRole('dialog', { name: /\?$/ });
const myMaps = (page: Page) => page.getByRole('dialog', { name: 'My Maps' });
const mapRow = (page: Page, title: string) => myMaps(page).getByRole('option', { name: new RegExp(`^${title}`) });

test('New keeps the previous map, which Open Recent brings back', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await expect(page.getByRole('menuitem', { name: 'Open Recent' })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open Recent' })).toBeDisabled();
  await page.keyboard.press('Escape');

  await drawMap(page, 'First Map');
  await fileMenu(page, 'New');
  await expect(unsavedDialog(page)).toContainText('stays in File > My Maps');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Untitled map');

  // The untouched new map has nothing to lose, so this doesn't ask
  await openRecent(page, 'First Map');
  await expect(unsavedDialog(page)).toHaveCount(0);
  await expect(page.getByLabel('Map title')).toHaveValue('First Map');
  expect((await stats(page)).rooms).toBe(205);
  // ...and wasn't stored either
  await page.getByRole('menuitem', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: 'Open Recent' })).toBeDisabled();
  expect(errors).toEqual([]);
});

test('edits made just before switching maps are kept', async ({ page }) => {
  await openApp(page);
  await drawMap(page, 'Quick');
  await page.getByLabel('Map title').fill('Quick Edit');
  // No waiting for the autosave: opening another map stores this one first
  await fileMenu(page, 'New');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await openRecent(page, 'Quick Edit');
  await expect(page.getByLabel('Map title')).toHaveValue('Quick Edit');
});

test('My Maps opens, renames, duplicates and deletes maps', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await drawMap(page, 'Alpha');
  await page.keyboard.press('Control+Alt+n');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await drawMap(page, 'Beta', 2);

  await fileMenu(page, 'My Maps…');
  await expect(myMaps(page).getByRole('option')).toHaveCount(2);
  await expect(mapRow(page, 'Beta')).toContainText('Open now');
  // The most recent map that isn't open starts selected
  await expect(mapRow(page, 'Alpha')).toHaveAttribute('aria-selected', 'true');
  await expect(myMaps(page).getByRole('button', { name: 'Open' })).toBeEnabled();

  // Rename and duplicate a stored map
  await myMaps(page).getByRole('button', { name: 'Rename' }).click();
  await myMaps(page).getByLabel('New name').fill('Gamma');
  await page.keyboard.press('Enter');
  await expect(mapRow(page, 'Gamma')).toBeVisible();
  await myMaps(page).getByRole('button', { name: 'Duplicate' }).click();
  await expect(mapRow(page, 'Gamma \\(copy\\)')).toHaveAttribute('aria-selected', 'true');
  await expect(myMaps(page).getByRole('option')).toHaveCount(3);

  // Delete asks first
  await myMaps(page).getByRole('button', { name: 'Delete…' }).click();
  await myMaps(page).getByRole('alert').getByRole('button', { name: 'Delete' }).click();
  await expect(myMaps(page).getByRole('option')).toHaveCount(2);
  await expect(mapRow(page, 'Gamma \\(copy\\)')).toHaveCount(0);

  // The open map can be renamed but not deleted
  await mapRow(page, 'Beta').click();
  await expect(myMaps(page).getByRole('button', { name: 'Delete…' })).toBeDisabled();
  await myMaps(page).getByRole('button', { name: 'Rename' }).click();
  await myMaps(page).getByLabel('New name').fill('Delta');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Map title')).toHaveValue('Delta');

  // Double-click opens a map; Delta isn't saved to a file, so that asks
  await mapRow(page, 'Gamma').dblclick();
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Gamma');
  expect((await stats(page)).rooms).toBe(205);

  // The map last open comes back after a reload, with Delta still kept
  await page.reload();
  await openApp(page);
  await expect(page.getByLabel('Map title')).toHaveValue('Gamma');
  await fileMenu(page, 'My Maps…');
  await expect(mapRow(page, 'Delta')).toBeVisible();
  // Arrow keys move the selection and Enter opens it
  await mapRow(page, 'Gamma').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await unsavedDialog(page).getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('Delta');
  expect(errors).toEqual([]);
});

test('a map saved to a file still counts as saved after a reload', async ({ page }) => {
  await openApp(page);
  await drawMap(page, 'Filed');
  await saveMap(page);
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('cartographer.maps') ?? '[]')[0]?.saved))
    .toBe(true);

  await page.reload();
  await openApp(page);
  await expect(page).toHaveTitle(/^Filed/);
  await fileMenu(page, 'New');
  await expect(unsavedDialog(page)).toHaveCount(0);
  await expect(page.getByLabel('Map title')).toHaveValue('Untitled map');

  // Changed after the save, it asks again
  await openRecent(page, 'Filed');
  await page.getByLabel('Map title').fill('Filed and changed');
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();
  await page.reload();
  await openApp(page);
  await expect(page).toHaveTitle(/^• Filed and changed/);
});

test('a map autosaved before My Maps existed moves into it', async ({ page }) => {
  await openApp(page);
  const legacy = await saveMap(page);
  await page.evaluate((map) => {
    localStorage.clear();
    localStorage.setItem('cartographer.autosave.v1', JSON.stringify({ ...map, title: 'Old Autosave' }));
  }, legacy);
  await page.reload();
  await openApp(page);
  await expect(page.getByLabel('Map title')).toHaveValue('Old Autosave');
  expect(await page.evaluate(() => localStorage.getItem('cartographer.autosave.v1'))).toBeNull();
  await fileMenu(page, 'My Maps…');
  await expect(mapRow(page, 'Old Autosave')).toContainText('Open now');
});
