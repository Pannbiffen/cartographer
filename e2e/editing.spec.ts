import { test, expect } from '@playwright/test';
import { openApp, cellCenter, dragCells, stats, trackErrors } from './helpers';

// The starter map leaves rows y >= 8 and the block x -15..-8, y -8..0 empty

test('loads the starter map without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  expect(await stats(page)).toEqual({ rooms: 194, water: 16, foliage: 4 });
  expect(errors).toEqual([]);
});

test('a brush stroke is a single undo step and can be redone', async ({ page }) => {
  await openApp(page);
  await dragCells(page, [-15, 8], [-5, 8]);
  expect((await stats(page)).rooms).toBe(194 + 11);

  await page.keyboard.press('Control+z');
  expect((await stats(page)).rooms).toBe(194);
  await page.keyboard.press('Control+y');
  expect((await stats(page)).rooms).toBe(205);
  // Nothing earlier to undo
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await stats(page)).rooms).toBe(194);
});

test('fast strokes fill every cell between samples', async ({ page }) => {
  await openApp(page);
  await dragCells(page, [-15, 8], [-1, 8], 1);
  expect((await stats(page)).rooms).toBe(194 + 15);
});

test('brush size 2 paints exactly 2x2', async ({ page }) => {
  await openApp(page);
  await page.locator('input[type=range]').first().fill('2');
  const p = await cellCenter(page, -12, 8);
  await page.mouse.click(p.x, p.y);
  expect((await stats(page)).rooms).toBe(194 + 4);
});

test('tunnel drags an L-shaped corridor', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('t');
  // Longer horizontal leg first: 6 cells along y=0, then 3 up x=-10
  await dragCells(page, [-15, 0], [-10, -3]);
  expect((await stats(page)).rooms).toBe(194 + 9);
});

test('foliage tool paints the chosen plant type', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('f');
  await page.getByRole('button', { name: 'bush' }).click();
  const p = await cellCenter(page, -12, 8);
  await page.mouse.click(p.x, p.y);
  expect((await stats(page)).foliage).toBe(5);
});

test('space + drag pans instead of drawing', async ({ page }) => {
  await openApp(page);
  const footer = page.locator('footer div').first();
  const start = await cellCenter(page, -1, -1);
  await page.mouse.move(start.x, start.y);
  await expect(footer).toContainText('Grid: (-1, -1)');

  await page.keyboard.down('Space');
  await page.mouse.down();
  await page.mouse.move(start.x + 120, start.y, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Space');

  await page.mouse.move(start.x, start.y);
  await expect(footer).toContainText('Grid: (-4, -1)');
  expect((await stats(page)).rooms).toBe(194);
});
