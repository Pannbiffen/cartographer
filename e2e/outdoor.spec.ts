import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

/** How many distinct colours the canvas shows over a block of cells */
async function colours(page: Page, from: [number, number], to: [number, number]) {
  const a = await gridPoint(page, ...from);
  const b = await gridPoint(page, ...to);
  const box = (await page.locator('canvas').boundingBox())!;
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, [x0, y0, x1, y1]) => {
      const dpr = window.devicePixelRatio || 1;
      const { data } = canvas
        .getContext('2d')!
        .getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), Math.round((x1 - x0) * dpr), Math.round((y1 - y0) * dpr));
      const seen = new Set<number>();
      for (let i = 0; i < data.length; i += 4) seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
      return seen.size;
    },
    [a.x - box.x, a.y - box.y, b.x - box.x, b.y - box.y]
  );
}

/** Brightness (0-255) of the canvas at a point in grid units */
async function brightnessAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  const box = (await page.locator('canvas').boundingBox())!;
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const dpr = window.devicePixelRatio || 1;
      const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return (r + g + b) / 3;
    },
    [p.x - box.x, p.y - box.y]
  );
}

test('an outdoor map has ground everywhere, rooms on it get walls, and it is saved', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  // The starter map is outdoors; indoors the paper is one flat colour, give or take the grid
  await expect(page.getByLabel('Ground')).toHaveValue('grass');
  await page.getByLabel('Ground').selectOption('indoor');
  await page.getByLabel('Show battle grid').uncheck();
  const blank = await colours(page, [-15, -7], [-12, -4]);
  expect(blank).toBeLessThanOrEqual(2);

  await page.getByLabel('Ground').selectOption('grass');
  await expect.poll(() => colours(page, [-15, -7], [-12, -4])).toBeGreaterThan(10);

  // A room drawn on the ground is walled
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-12, -4]);
  expect(await brightnessAt(page, -13.5, -7)).toBeLessThan(90);

  const map = await saveMap(page);
  expect(map.outdoor).toBe(true);
  expect(map.ground).toBe('grass');

  // Kept in the browser across a reload
  await page.reload();
  await expect(page.getByLabel('Ground')).toHaveValue('grass');
  expect(errors).toEqual([]);
});

test('files without ground settings get the default ground', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Ground').selectOption('indoor');
  const map = await saveMap(page);
  const { outdoor, ground, ...old } = map;
  expect([outdoor, ground]).toEqual([false, 'grass']);
  await page.getByLabel('Open map file').setInputFiles({
    name: 'old.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await expect(page.getByLabel('Ground')).toHaveValue('grass');
});

test('the ground is part of the new-map look', async ({ page }) => {
  await openApp(page);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const prefs = page.getByRole('dialog', { name: 'Preferences' });
  await prefs.getByLabel('Ground').selectOption('sand');
  await page.keyboard.press('Escape');

  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');
  const map = await saveMap(page);
  expect(map.outdoor).toBe(true);
  expect(map.ground).toBe('sand');
});
