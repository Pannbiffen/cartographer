import { test, expect, type Page } from '@playwright/test';
import { openApp, cellCenter, clickCell, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

async function floors(page: Page) {
  return (await saveMap(page)).levels[0].layers[0].floors;
}

/** Two plain rooms joined by a corridor, with a door where it meets the second */
async function twoRooms(page: Page) {
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-13, -5]);
  await dragCells(page, [-12, -6], [-11, -6]);
  await dragCells(page, [-10, -7], [-8, -5]);
  await page.keyboard.press('d');
  const edge = await gridPoint(page, -10.1, -5.5);
  await page.mouse.click(edge.x, edge.y);
}

test('the fill tool re-textures one room up to its doors, undone in one step', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await twoRooms(page);
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await clickCell(page, -14, -6);

  let f = await floors(page);
  expect(f['-15,-7']).toBe('cobbles');
  expect(f['-13,-5']).toBe('cobbles');
  // The corridor joins the first room; the door stops the fill
  expect(f['-11,-6']).toBe('cobbles');
  expect(f['-10,-6']).toBeUndefined();

  // Clicking off the floor does nothing
  await clickCell(page, -14, -2);
  await page.keyboard.press('Control+z');
  f = await floors(page);
  expect(f['-15,-7']).toBeUndefined();
  expect(f['-11,-6']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('right-clicking floor offers Fill Room With', async ({ page }) => {
  await openApp(page);
  await twoRooms(page);
  await page.keyboard.press('v');
  const spot = await cellCenter(page, -9, -6);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  const menu = page.getByRole('menu');
  await menu.getByRole('menuitem', { name: 'Fill Room With' }).hover();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Plain' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: 'Tiles' }).click();

  const f = await floors(page);
  expect(f['-8,-5']).toBe('tiles');
  expect(f['-14,-6']).toBeUndefined();

  // No fill on empty ground
  const ground = await cellCenter(page, -14, -2);
  await page.mouse.click(ground.x, ground.y, { button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Fill Room With' })).toHaveCount(0);
});

test('the fill tool re-textures free-form floor, and stops at a door', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  // A circle room with a cell corridor, behind a door, leading to a square room
  await page.keyboard.press('c');
  const centre = await gridPoint(page, -12, -4);
  const edge = await gridPoint(page, -12, -2);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('r');
  await dragCells(page, [-11, -5], [-9, -5]);
  await page.keyboard.press('d');
  const door = await gridPoint(page, -9.1, -4.5);
  await page.mouse.click(door.x, door.y);

  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'planks' }).click();
  await clickCell(page, -12, -4);
  const layer = (await saveMap(page)).levels[0].layers[0];
  const planks = layer.floorAreas.planks!;
  expect(planks).toHaveLength(1);
  // The whole circle and the corridor up to the door
  const xs = planks[0][0].map(([x]) => x);
  expect(Math.min(...xs)).toBeCloseTo(-14, 1);
  expect(Math.max(...xs)).toBeCloseTo(-9, 5);
  expect(layer.floors['-10,-5']).toBe('planks');
  expect(layer.floors['-9,-5']).toBeUndefined();
  expect(errors).toEqual([]);
});

test('Alt+click and the right-click menu pick up the floor texture', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'dirt' }).click();
  await dragCells(page, [-15, -7], [-14, -7]);
  await page.getByRole('button', { name: 'plain' }).click();

  // Alt+click with a room tool takes the texture under the pointer...
  const textured = await cellCenter(page, -15, -7);
  await page.keyboard.down('Alt');
  await page.mouse.click(textured.x, textured.y);
  await page.keyboard.up('Alt');
  await expect(page.getByRole('button', { name: 'dirt' })).toHaveAttribute('aria-pressed', 'true');
  // ...and draws nothing
  expect(Object.keys(await floors(page))).toEqual(['-15,-7', '-14,-7']);
  await dragCells(page, [-12, -7], [-11, -7]);
  expect((await floors(page))['-11,-7']).toBe('dirt');

  // The menu does the same from any tool
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'tiles' }).click();
  await page.mouse.click(textured.x, textured.y, { button: 'right' });
  await page.getByRole('menuitem', { name: 'Pick Floor Texture' }).click();
  await expect(page.getByRole('button', { name: 'dirt' })).toHaveAttribute('aria-pressed', 'true');
});
