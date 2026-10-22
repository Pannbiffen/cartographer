import { test, expect, type Page } from '@playwright/test';
import { openApp, gridPoint, saveMap, trackErrors } from './helpers';
import type { Pair, Polygon } from '../src/types/map';

// The starter map leaves the block x -15..-8, y -8..0 empty

async function clickAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

async function topLayer(page: Page) {
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

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

/** Distance from a point to a line through `points` */
function distanceToLine([x, y]: Pair, points: Pair[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const [[ax, ay], [bx, by]] = [points[i], points[i + 1]];
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / len2));
    best = Math.min(best, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
  }
  return best;
}

test('the river tool lays water along the clicked points, undone in one step', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  const pool = (await topLayer(page)).water;
  await page.keyboard.press('y');
  const points: Pair[] = [[-14.5, -7.5], [-11.5, -3], [-9, -0.5]];
  for (const [x, y] of points) await clickAt(page, x, y);
  await page.keyboard.press('Enter');

  const layer = await topLayer(page);
  // The starter map's pool of water cells stays as it was
  expect(layer.water).toEqual(pool);
  expect(layer.waterAreas.length).toBeGreaterThan(0);
  for (const point of points) expect(inside(layer.waterAreas, point)).toBe(true);
  // Half the widest width (3 cells) plus the wander (1 cell), with some room for the curve
  const outline = layer.waterAreas.flat(2);
  expect(Math.max(...outline.map((p) => distanceToLine(p, points)))).toBeLessThan(3);

  await page.keyboard.press('Control+z');
  expect((await topLayer(page)).waterAreas).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a river swells and narrows within its widths, and the eraser takes it away', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('y');
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await panel.getByLabel(/^Wander/).fill('0');
  await panel.getByLabel(/^Narrowest/).fill('1');
  await panel.getByLabel(/^Widest/).fill('3');
  // A straight river, so its banks lie half its width from the line
  for (const x of [-14.5, -11.5, -8.5]) await clickAt(page, x, -4);
  await clickAt(page, -8.5, -4);

  const water = (await topLayer(page)).waterAreas;
  const halves = water
    .flat(2)
    .filter(([x]) => x > -14.4 && x < -8.6)
    .map(([, y]) => Math.abs(y + 4));
  expect(Math.min(...halves)).toBeGreaterThan(0.5 - 0.01);
  expect(Math.max(...halves)).toBeLessThan(1.5 + 0.01);
  expect(Math.max(...halves) - Math.min(...halves)).toBeGreaterThan(0.25);

  // Another seed lays another river along the same points
  await page.keyboard.press('Control+z');
  await panel.getByRole('spinbutton').fill('7');
  for (const x of [-14.5, -11.5, -8.5]) await clickAt(page, x, -4);
  await page.keyboard.press('Enter');
  const reseeded = (await topLayer(page)).waterAreas;
  expect(reseeded).toHaveLength(1);
  expect(JSON.stringify(reseeded)).not.toEqual(JSON.stringify(water));

  // Erasing across the middle splits it in two
  await page.keyboard.press('e');
  const a = await gridPoint(page, -11.5, -6.5);
  const b = await gridPoint(page, -11.5, -1.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  const erased = (await topLayer(page)).waterAreas;
  expect(inside(erased, [-11.5, -4])).toBe(false);
  expect(inside(erased, [-14, -4])).toBe(true);
  expect(inside(erased, [-9, -4])).toBe(true);
  expect(errors).toEqual([]);
});
