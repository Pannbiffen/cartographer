import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

/** How many distinct colours the canvas shows over a block of grid units */
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

async function topLayer(page: Page) {
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

async function setWaterHere(page: Page, gx: number, gy: number, style: 'Solid' | 'See-through') {
  const spot = await gridPoint(page, gx, gy);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Water Here' }).hover();
  await page.getByRole('menuitemcheckbox', { name: style }).click();
}

test('solid water hides the ground, and right-clicking makes it see-through', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Show battle grid').uncheck();
  await page.getByLabel('Ground').selectOption('grass');

  // A straight river, at least two cells wide, along y = -3.5
  await page.keyboard.press('y');
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await expect(panel.getByRole('button', { name: 'solid' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByLabel(/^Wander/).fill('0');
  await panel.getByLabel(/^Narrowest/).fill('2');
  for (const x of [-14.5, -11.5, -8.5]) {
    const p = await gridPoint(page, x, -3.5);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Enter');

  // Inside the river the grass is hidden: one flat colour
  await expect.poll(() => colours(page, [-13, -4], [-10, -3])).toBeLessThanOrEqual(2);

  await setWaterHere(page, -11.5, -3.5, 'See-through');
  await expect.poll(() => colours(page, [-13, -4], [-10, -3])).toBeGreaterThan(10);
  const layer = await topLayer(page);
  expect(layer.waterAreas).toHaveLength(0);
  expect(layer.clearWaterAreas).toHaveLength(1);

  // One undo makes it solid again
  await page.keyboard.press('Control+z');
  await expect.poll(() => colours(page, [-13, -4], [-10, -3])).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('each body of water keeps its own style, and new water takes the panel style', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('w');
  // Two separate pools
  await dragCells(page, [-14, -7], [-13, -7]);
  await dragCells(page, [-10, -7], [-9, -7]);

  await setWaterHere(page, -13.5, -6.5, 'See-through');
  let layer = await topLayer(page);
  expect(layer.clearWater).toEqual({ '-14,-7': true, '-13,-7': true });
  expect(layer.water['-10,-7']).toBe(true);
  expect(layer.water['-14,-7']).toBeUndefined();

  // The menu shows the style of the water under the pointer
  const pool = await gridPoint(page, -9.5, -6.5);
  await page.mouse.click(pool.x, pool.y, { button: 'right' });
  await page.getByRole('menu').getByRole('menuitem', { name: 'Water Here' }).hover();
  await expect(page.getByRole('menuitemcheckbox', { name: 'Solid' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');

  // Solid water painted over see-through water replaces it
  await dragCells(page, [-14, -7], [-13, -7]);
  layer = await topLayer(page);
  expect(layer.clearWater).toEqual({});
  expect(layer.water['-14,-7']).toBe(true);

  // A see-through river, from the panel
  await page.keyboard.press('y');
  await page.getByRole('complementary', { name: 'Properties' }).getByRole('button', { name: 'see-through' }).click();
  for (const [x, y] of [[-14.5, -3.5], [-9.5, -2.5]]) {
    const p = await gridPoint(page, x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.keyboard.press('Enter');
  layer = await topLayer(page);
  expect(layer.clearWaterAreas).toHaveLength(1);
  expect(layer.waterAreas).toHaveLength(0);
  expect(errors).toEqual([]);
});
