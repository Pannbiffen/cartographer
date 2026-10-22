import { test, expect } from '@playwright/test';
import { openApp, cellCenter, clickCell, dragCells, saveMap, stats } from './helpers';

test('levels keep their own layers, and can be switched, renamed, reordered and deleted with undo', async ({ page }) => {
  await openApp(page);
  const levels = page.getByRole('list', { name: 'Levels' });
  const starterRooms = (await stats(page)).rooms;
  await expect(page.getByTestId('current-level')).toBeHidden();

  await page.getByRole('button', { name: 'New level' }).click();
  await expect(page.getByTestId('current-level')).toHaveText('Level 2');
  await expect(levels.getByRole('button', { pressed: true })).toHaveText('Level 2');
  expect((await stats(page)).rooms).toBe(0);
  await page.getByLabel('Level name').fill('Cellar');
  await page.keyboard.press('Enter');

  // Drawing goes on the new level only
  await page.keyboard.press('r');
  await dragCells(page, [0, 0], [2, 1]);
  expect((await stats(page)).rooms).toBe(6);
  await page.keyboard.press('PageUp');
  await expect(page.getByTestId('current-level')).toHaveText('Level 1');
  expect((await stats(page)).rooms).toBe(starterRooms);
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('current-level')).toHaveText('Cellar');

  // Layers belong to the level they were added on
  await page.getByRole('button', { name: 'New layer' }).click();
  let map = await saveMap(page);
  expect(map.version).toBe(3);
  expect(map.levels.map((l) => l.name)).toEqual(['Level 1', 'Cellar']);
  expect(map.levels.map((l) => l.layers.length)).toEqual([1, 2]);
  expect(Object.keys(map.levels[1].layers[0].rooms)).toHaveLength(6);
  expect(Object.keys(map.levels[0].layers[0].rooms)).toHaveLength(starterRooms);

  // Exports draw the current level
  await page.keyboard.press('Control+e');
  await expect(page.getByRole('dialog', { name: 'Export' })).toContainText('Exports the current level, “Cellar”');
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Move level up' }).click();
  await expect(levels.getByRole('listitem').first()).toHaveText('Cellar');
  await page.getByRole('button', { name: 'Delete level' }).click();
  await expect(page.getByTestId('current-level')).toBeHidden();
  expect((await stats(page)).rooms).toBe(starterRooms);
  await expect(page.getByRole('button', { name: 'Delete level' })).toBeDisabled();
  await page.keyboard.press('Control+z');
  map = await saveMap(page);
  expect(map.levels.map((l) => l.name)).toEqual(['Cellar', 'Level 1']);
});

test('stairs link levels; taking them opens the other level at the stairs leading back', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('v');
  await clickCell(page, 0, -10);
  await expect(page.getByText('Add a level (Level > New Level)')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Level' }).click();
  await page.getByRole('menuitem', { name: 'New Level' }).click();
  await page.getByLabel('Level name').fill('Catacombs');
  await page.keyboard.press('Enter');
  // Stairs on the new level, leading back up
  await page.keyboard.press('s');
  await clickCell(page, 8, 5);
  await page.keyboard.press('v');
  await clickCell(page, 8, 5);
  await page.getByLabel('Stairs go to level').selectOption({ label: 'Level 1' });

  await page.getByRole('list', { name: 'Levels' }).getByRole('button', { name: 'Level 1' }).click();
  await clickCell(page, 0, -10);
  await page.getByLabel('Stairs go to level').selectOption({ label: 'Catacombs' });
  await expect(page.getByRole('button', { name: 'Take stairs to Catacombs' })).toBeVisible();

  // Double-clicking the stairs goes down, selecting and centring the stairs there
  const p = await cellCenter(page, 0, -10);
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByTestId('current-level')).toHaveText('Catacombs');
  await expect(page.getByRole('button', { name: 'Take stairs to Level 1' })).toBeVisible();
  const map = await saveMap(page);
  const down = map.levels[1].layers[0].stairs[0];
  const box = (await page.locator('canvas').boundingBox())!;
  const centre = await cellCenter(page, down.x + down.width / 2 - 0.5, down.y + down.height / 2 - 0.5);
  expect(Math.abs(centre.x - (box.x + box.width / 2))).toBeLessThan(2);
  expect(Math.abs(centre.y - (box.y + box.height / 2))).toBeLessThan(2);

  await page.getByRole('button', { name: 'Take stairs to Level 1' }).click();
  await expect(page.getByTestId('current-level')).toHaveText('Level 1');
  await expect(page.getByRole('button', { name: 'Take stairs to Catacombs' })).toBeVisible();

  expect(map.levels[0].layers[0].stairs.find((s) => s.id === 's1')?.toLevel).toBe(map.levels[1].id);
  expect(down.toLevel).toBe(map.levels[0].id);
});

test('a version 2 file, with its layers at the top level, opens as one level', async ({ page }) => {
  await openApp(page);
  const { levels, ...settings } = await saveMap(page);
  const old = { ...settings, version: 2, title: 'Two Layers', layers: levels[0].layers };

  await page.getByLabel('Open map file').setInputFiles({
    name: 'old.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(page.getByTestId('map-stats')).toContainText(`Rooms: ${Object.keys(levels[0].layers[0].rooms).length}`);
  const loaded = await saveMap(page);
  expect(loaded.title).toBe('Two Layers');
  expect(loaded.levels).toHaveLength(1);
  expect(loaded.levels[0].layers).toEqual(levels[0].layers);
  expect(loaded).not.toHaveProperty('layers');
});
