import { test, expect, type Page } from '@playwright/test';
import { openApp, dragCells, gridPoint, saveMap, trackErrors } from './helpers';
import type { Pair, Polygon } from '../src/types/map';

// The starter map leaves the block x -15..-8, y -8..0 empty

/** The canvas pixels over a block of grid units: how many colours, and a fingerprint of them */
async function pixels(page: Page, from: [number, number], to: [number, number]) {
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
      let hash = 0;
      for (let i = 0; i < data.length; i += 4) {
        const colour = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
        seen.add(colour);
        hash = (Math.imul(hash, 31) + colour) | 0;
      }
      return { colours: seen.size, hash };
    },
    [a.x - box.x, a.y - box.y, b.x - box.x, b.y - box.y]
  );
}

/** Drags a brush stroke, then moves the pointer off so its preview doesn't cover the stroke */
async function stroke(page: Page, from: [number, number], to: [number, number]) {
  await dragCells(page, from, to);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width - 5, box.y + 5);
}

async function topLayer(page: Page) {
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

test('paint floor lays a texture on the ground without rooms or walls, and the eraser takes it away', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Show battle grid').uncheck();
  await page.getByLabel('Ground').selectOption('grass');
  const before = await topLayer(page);
  const grass = await pixels(page, [-13, -6], [-11, -4]);

  await page.keyboard.press('u');
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await expect(panel.getByRole('heading', { name: 'Paint Floor' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'dirt' })).toHaveAttribute('aria-pressed', 'true');
  await panel.getByLabel(/^Brush size/).fill('3');
  await stroke(page, [-13, -5], [-11, -5]);

  let layer = await topLayer(page);
  expect(layer.paint['-14,-6']).toBe('dirt');
  expect(layer.paint['-10,-4']).toBe('dirt');
  expect(Object.values(layer.paint).every((t) => t === 'dirt')).toBe(true);
  // No floor, walls or anything else
  expect(layer.rooms).toEqual(before.rooms);
  expect(layer.walls).toEqual(before.walls);
  expect(layer.shapes).toEqual(before.shapes);
  // The grass is painted over
  await expect.poll(async () => (await pixels(page, [-13, -6], [-11, -4])).hash).not.toBe(grass.hash);

  // Plain paint hides the ground under one flat colour
  await panel.getByRole('button', { name: 'plain' }).click();
  await stroke(page, [-13, -5], [-11, -5]);
  await expect.poll(async () => (await pixels(page, [-13, -6], [-11, -4])).colours).toBeLessThanOrEqual(4);

  // One stroke is one undo step: back to dirt
  await page.keyboard.press('Control+z');
  layer = await topLayer(page);
  expect(layer.paint['-12,-5']).toBe('dirt');

  // The eraser takes it away
  await page.keyboard.press('e');
  await stroke(page, [-13, -5], [-11, -5]);
  layer = await topLayer(page);
  expect(layer.paint).toEqual({});
  await expect.poll(async () => (await pixels(page, [-13, -6], [-11, -4])).hash).toBe(grass.hash);
  expect(errors).toEqual([]);
});

test('on a hex grid paint covers whole hexes, which the eraser takes away', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('u');
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await panel.getByRole('button', { name: 'cobbles' }).click();
  await dragCells(page, [-12, -5], [-12, -5]);

  let layer = await topLayer(page);
  expect(layer.paintAreas.cobbles).toHaveLength(1);
  expect(layer.paint).toEqual({});

  await page.keyboard.press('e');
  await dragCells(page, [-12, -5], [-12, -5]);
  layer = await topLayer(page);
  expect(layer.paintAreas).toEqual({});
  expect(errors).toEqual([]);
});

function inside(polygons: Polygon[], [x, y]: Pair): boolean {
  let hit = false;
  for (const ring of polygons.flat()) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

async function clickAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

test('the road tool paints a winding dirt track through the clicked points, undone in one step', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Ground').selectOption('grass');
  const before = await topLayer(page);

  await page.keyboard.press('o');
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await expect(panel.getByRole('heading', { name: 'Road / Path' })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'dirt' })).toHaveAttribute('aria-pressed', 'true');

  // Escape mid-road draws nothing
  await clickAt(page, -14.5, -7.5);
  await clickAt(page, -11.5, -3);
  await page.keyboard.press('Escape');
  expect((await topLayer(page)).paintAreas).toEqual({});

  const points: Pair[] = [[-14.5, -7.5], [-11.5, -3], [-9, -0.5]];
  for (const [x, y] of points) await clickAt(page, x, y);
  await page.keyboard.press('Enter');

  let layer = await topLayer(page);
  const dirt = layer.paintAreas.dirt!;
  expect(dirt).toHaveLength(1);
  for (const point of points) expect(inside(dirt, point)).toBe(true);
  expect(inside(dirt, [-9, -7])).toBe(false);
  // Only paint: no floor, walls or water
  expect(layer.rooms).toEqual(before.rooms);
  expect(layer.shapes).toEqual(before.shapes);
  expect(layer.walls).toEqual(before.walls);
  expect(layer.waterAreas).toEqual(before.waterAreas);

  // A cobbled ring road closes on its first point
  await panel.getByRole('button', { name: 'cobbles' }).click();
  for (const [x, y] of [[-14, -2], [-10, -2], [-12, 1], [-14, -2]] as Pair[]) await clickAt(page, x, y);
  layer = await topLayer(page);
  expect(layer.paintAreas.cobbles).toHaveLength(1);
  // A ring: an outline with the hole in the middle
  expect(layer.paintAreas.cobbles![0]).toHaveLength(2);

  // One undo step each
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  expect((await topLayer(page)).paintAreas).toEqual({});
  expect(errors).toEqual([]);
});
