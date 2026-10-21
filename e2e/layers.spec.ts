import { test, expect } from '@playwright/test';
import { openApp, clickCell, dragCells, saveMap, stats } from './helpers';

test('new layers take drawing, and can be renamed, reordered and deleted with undo', async ({ page }) => {
  await openApp(page);
  const layers = page.getByRole('list', { name: 'Layers' });
  await page.getByRole('button', { name: 'New layer' }).click();
  await page.getByLabel('Layer name').fill('Water');
  await page.keyboard.press('Enter');

  // The water tool paints on the new, active layer
  await page.keyboard.press('w');
  await dragCells(page, [-15, 8], [-12, 8]);
  let map = await saveMap(page);
  expect(map.layers.map((l) => l.name)).toEqual(['Dungeon', 'Water']);
  expect(Object.keys(map.layers[1].water)).toHaveLength(4);
  expect(Object.keys(map.layers[0].water)).toHaveLength(16);

  await page.getByRole('button', { name: 'Move layer down' }).click();
  map = await saveMap(page);
  expect(map.layers.map((l) => l.name)).toEqual(['Water', 'Dungeon']);
  // The list shows the top layer first
  await expect(layers.getByRole('button', { pressed: true })).toHaveText('Water');
  await expect(layers.getByRole('listitem').first()).toContainText('Dungeon');

  await page.getByRole('button', { name: 'Delete layer' }).click();
  expect((await saveMap(page)).layers.map((l) => l.name)).toEqual(['Dungeon']);
  await expect(page.getByRole('button', { name: 'Delete layer' })).toBeDisabled();
  await page.keyboard.press('Control+z');
  expect((await saveMap(page)).layers.map((l) => l.name)).toEqual(['Water', 'Dungeon']);
});

test('hidden and locked layers block drawing and selection', async ({ page }) => {
  await openApp(page);
  const roomsBefore = (await stats(page)).rooms;

  await page.getByRole('button', { name: 'Lock Dungeon' }).click();
  await expect(page.getByText('Layer “Dungeon” is locked')).toBeVisible();
  await page.keyboard.press('b');
  await dragCells(page, [-15, 8], [-12, 8]);
  expect((await stats(page)).rooms).toBe(roomsBefore);
  // A locked layer's objects can't be picked
  await page.keyboard.press('v');
  await clickCell(page, 9, 1); // altar
  await expect(page.getByText('Selected:')).toHaveCount(0);

  await page.getByRole('button', { name: 'Unlock Dungeon' }).click();
  await page.getByRole('button', { name: 'Hide Dungeon' }).click();
  await expect(page.getByText('Layer “Dungeon” is hidden')).toBeVisible();
  await clickCell(page, 9, 1);
  await expect(page.getByText('Selected:')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show Dungeon' }).click();
  await clickCell(page, 9, 1);
  await expect(page.getByText('Selected: altar')).toBeVisible();
  const map = await saveMap(page);
  expect(map.layers[0]).toMatchObject({ visible: true, locked: false });
});

test('selecting an object on another layer makes that layer active', async ({ page }) => {
  await openApp(page);
  const layers = page.getByRole('list', { name: 'Layers' });
  await page.getByRole('button', { name: 'New layer' }).click();
  await page.getByLabel('Layer opacity').fill('0.5');
  await expect(layers.getByRole('button', { pressed: true })).toHaveText('Layer 2');

  await page.keyboard.press('v');
  await clickCell(page, 9, 1); // altar on the Dungeon layer
  await expect(layers.getByRole('button', { pressed: true })).toHaveText('Dungeon');
  await page.keyboard.press('Delete');

  const map = await saveMap(page);
  expect(map.layers[0].props.find((p) => p.id === 'p3')).toBeUndefined();
  expect(map.layers[1].opacity).toBe(0.5);
});
