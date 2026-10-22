import { test, expect, type Page } from '@playwright/test';
import { openApp, cellCenter, clickCell, dragCells, saveMap, stats } from './helpers';

test('a new level goes above or below the active one, undone in one step', async ({ page }) => {
  await openApp(page);
  const levels = page.getByRole('list', { name: 'Levels' });
  await page.getByRole('button', { name: 'New below' }).click();
  await expect(levels.getByRole('listitem')).toHaveText(['Level 1', 'Level 2']);
  await expect(levels.getByRole('button', { pressed: true })).toHaveText('Level 2');
  expect((await saveMap(page)).levels.map((l) => l.name)).toEqual(['Level 2', 'Level 1']);

  await page.getByRole('menuitem', { name: 'Level' }).click();
  await page.getByRole('menuitem', { name: 'New Level Above' }).click();
  await expect(levels.getByRole('listitem')).toHaveText(['Level 1', 'Level 3', 'Level 2']);
  await expect(levels.getByRole('button', { pressed: true })).toHaveText('Level 3');
  expect((await saveMap(page)).levels.map((l) => l.name)).toEqual(['Level 2', 'Level 3', 'Level 1']);

  await page.keyboard.press('Control+z');
  expect((await saveMap(page)).levels.map((l) => l.name)).toEqual(['Level 2', 'Level 1']);
});

test('levels keep their own layers, and can be switched, renamed, reordered and deleted with undo', async ({ page }) => {
  await openApp(page);
  const levels = page.getByRole('list', { name: 'Levels' });
  const starterRooms = (await stats(page)).rooms;
  await expect(page.getByTestId('current-level')).toBeHidden();

  await page.getByRole('button', { name: 'New above' }).click();
  await expect(page.getByTestId('current-level')).toHaveText('Level 2');
  await expect(levels.getByRole('button', { pressed: true })).toHaveText('Level 2');
  expect((await stats(page)).rooms).toBe(0);
  await page.getByLabel('Level name').fill('Cellar');
  await page.keyboard.press('Enter');
  // Listed top level first, like floors seen from above
  await expect(levels.getByRole('listitem')).toHaveText(['Cellar', 'Level 1']);

  // Drawing goes on the new level only
  await page.keyboard.press('r');
  await dragCells(page, [0, 0], [2, 1]);
  expect((await stats(page)).rooms).toBe(6);
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('current-level')).toHaveText('Level 1');
  expect((await stats(page)).rooms).toBe(starterRooms);
  await page.keyboard.press('PageUp');
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

  await expect(page.getByRole('button', { name: 'Move level up' })).toBeDisabled();
  await page.getByRole('button', { name: 'Move level down' }).click();
  await expect(levels.getByRole('listitem')).toHaveText(['Level 1', 'Cellar']);
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
  await expect(page.getByText('Add a level (Level > New Level Above)')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Level' }).click();
  await page.getByRole('menuitem', { name: 'New Level Above' }).click();
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

test('the level below shows faintly, at a chosen opacity, from the View menu or the Levels panel', async ({ page }) => {
  await openApp(page);
  const levelBelow = page.getByRole('menuitemcheckbox', { name: 'Level Below' });
  const panelToggle = page.getByRole('checkbox', { name: 'Show level below' });
  const opacity = page.getByRole('slider', { name: 'Level below opacity' });
  const openViewMenu = async () => {
    await page.getByRole('menuitem', { name: 'View' }).click();
  };
  const pixel = (gx: number, gy: number) => cellColour(page, gx, gy);

  // Nothing to show with one level
  await openViewMenu();
  await expect(levelBelow).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(panelToggle).toBeDisabled();

  // A floor cell of level 1; level 2 is empty there
  const map = await saveMap(page);
  const [gx, gy] = Object.keys(map.levels[0].layers[0].rooms)[0].split(',').map(Number);
  await page.getByRole('button', { name: 'New above' }).click();
  await expect(page.getByTestId('current-level')).toHaveText('Level 2');
  const empty = await pixel(gx, gy);

  await openViewMenu();
  await levelBelow.click();
  await expect.poll(() => pixel(gx, gy)).not.toBe(empty);
  const faint = await pixel(gx, gy);

  // The panel shows the same setting, and how strongly it shows through
  await expect(panelToggle).toBeChecked();
  await opacity.fill('0.8');
  await expect.poll(() => pixel(gx, gy)).not.toBe(faint);
  const strong = await pixel(gx, gy);

  // Drawing floor on this level covers the faint one
  await page.keyboard.press('r');
  await clickCell(page, gx, gy);
  await expect.poll(() => pixel(gx, gy)).not.toBe(strong);

  // Level 1 has nothing under it, so it looks the same with or without
  await page.keyboard.press('PageDown');
  await expect(page.getByTestId('current-level')).toHaveText('Level 1');
  const first = await pixel(gx, gy);
  await openViewMenu();
  await levelBelow.click();
  await openViewMenu();
  await expect(levelBelow).not.toBeChecked();
  await page.keyboard.press('Escape');
  expect(await pixel(gx, gy)).toBe(first);

  await expect(panelToggle).not.toBeChecked();
  await expect(opacity).toBeHidden();

  // The choice is kept for next time
  await panelToggle.check();
  await page.reload();
  await expect(page.getByTestId('map-stats')).toBeVisible();
  await openViewMenu();
  await expect(levelBelow).toBeChecked();
  await page.keyboard.press('Escape');
  await expect(opacity).toHaveValue('0.8');
});

test('further levels below show fainter by a step each, down to none', async ({ page }) => {
  await openApp(page);
  const pixel = (gx: number, gy: number) => cellColour(page, gx, gy);
  const furtherBelow = page.getByRole('checkbox', { name: 'Show multiple levels below' });
  const map = await saveMap(page);
  const [gx, gy] = Object.keys(map.levels[0].layers[0].rooms)[0].split(',').map(Number);

  // Level 1 has floor at the cell; levels 2 and 3 above it are empty
  await page.getByRole('button', { name: 'New above' }).click();
  await page.getByRole('checkbox', { name: 'Show level below' }).check();
  await expect(furtherBelow).toBeHidden();
  await page.getByRole('button', { name: 'New above' }).click();
  await expect(page.getByTestId('current-level')).toHaveText('Level 3');
  await page.getByRole('slider', { name: 'Level below opacity' }).fill('0.3');
  const empty = await pixel(gx, gy);

  // Two down at 30% - 10%
  await furtherBelow.check();
  await expect(page.getByRole('slider', { name: 'Fade per level' })).toHaveValue('0.1');
  await expect.poll(() => pixel(gx, gy)).not.toBe(empty);

  // 30% - 30% leaves nothing of it
  await page.getByRole('slider', { name: 'Fade per level' }).fill('0.3');
  await expect.poll(() => pixel(gx, gy)).toBe(empty);
});

/** Colour of the canvas at the centre of a cell, with the pointer moved off it */
async function cellColour(page: Page, gx: number, gy: number) {
  const p = await cellCenter(page, gx, gy);
  // Off the canvas, so no cursor preview tints the cell
  await page.mouse.move(1, 1);
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, at) => {
      const box = canvas.getBoundingClientRect();
      const scale = canvas.width / box.width;
      const data = canvas.getContext('2d')!.getImageData((at.x - box.x) * scale, (at.y - box.y) * scale, 1, 1).data;
      return Array.from(data).join(',');
    },
    p
  );
}

test('lights on the level below show through it, faded with it, but not on this level\'s floors', async ({ page }) => {
  await openApp(page);
  // A red light in the Grand Hall
  await page.keyboard.press('i');
  await clickCell(page, -2, 4);
  await page.getByLabel('Light colour').fill('#ff0000');
  await page.keyboard.press('Escape');

  // A level above with one small room over part of the light
  await page.getByRole('button', { name: 'New above' }).click();
  await page.getByRole('checkbox', { name: 'Show level below' }).check();
  await page.keyboard.press('r');
  await dragCells(page, [0, 3], [1, 5]);
  const redness = async (gx: number, gy: number) => {
    const [r, g] = (await cellColour(page, gx, gy)).split(',').map(Number);
    return r - g;
  };
  const open = await redness(-1, 4);
  const covered = await redness(0, 4);
  // Stronger with the level below
  const opacity = page.getByLabel('Level below opacity');
  await opacity.fill('0.8');
  expect(await redness(-1, 4)).toBeGreaterThan(open + 3);
  await opacity.fill('0.3');
  expect(await redness(-1, 4)).toBe(open);

  // Without the light, the open spot is less red and the covered one the same
  await page.keyboard.press('PageDown');
  await page.keyboard.press('v');
  await clickCell(page, -2, 4);
  await expect(page.getByText('Selected: light')).toBeVisible();
  await page.keyboard.press('Delete');
  await page.keyboard.press('PageUp');
  await expect(page.getByTestId('current-level')).toHaveText('Level 2');
  expect(await redness(-1, 4)).toBeLessThan(open - 3);
  expect(await redness(0, 4)).toBe(covered);
});
