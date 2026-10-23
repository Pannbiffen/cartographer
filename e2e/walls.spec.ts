import { test, expect, type Page } from '@playwright/test';
import { openApp, cellCenter, clickCell, downloadText, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

async function layer(page: Page) {
  return (await saveMap(page)).levels[0].layers[0];
}

/** Drags with the left button between two grid points (corners, not cell centres) */
async function dragPoints(page: Page, from: [number, number], to: [number, number], modifiers: 'Shift'[] = []) {
  const a = await gridPoint(page, ...from);
  const b = await gridPoint(page, ...to);
  for (const key of modifiers) await page.keyboard.down(key);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  for (const key of modifiers) await page.keyboard.up(key);
}

/** Brightness (0-255) of the canvas at the centre of a cell */
async function brightness(page: Page, gx: number, gy: number) {
  const p = await cellCenter(page, gx, gy);
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

/** A 7x5 room with a light in its left half */
async function litRoom(page: Page) {
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-9, -3]);
  await page.keyboard.press('i');
  await clickCell(page, -14, -5);
  await page.keyboard.press('Escape');
}

test('a wall splits a room: it stops the fill and the light, and undoes in one step', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await litRoom(page);
  const lit = await brightness(page, -10, -5);

  await page.keyboard.press('a');
  await dragPoints(page, [-12, -7], [-12, -2]);
  let walls = (await layer(page)).walls;
  expect(walls).toHaveLength(5);
  expect(walls.every((w) => w.x === -12 && w.dx === 0 && Math.abs(w.dy) === 1)).toBe(true);

  // The far side of the wall is in shadow
  const shaded = await brightness(page, -10, -5);
  expect(shaded).toBeLessThan(lit - 20);

  // The fill stops at the wall
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await clickCell(page, -14, -4);
  const floors = (await layer(page)).floors;
  expect(floors['-13,-4']).toBe('cobbles');
  expect(floors['-12,-4']).toBeUndefined();

  // Undo the fill, then the whole wall stroke in one step
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  walls = (await layer(page)).walls;
  expect(walls).toEqual([]);
  await expect.poll(() => brightness(page, -10, -5)).toBeGreaterThan(lit - 5);
  expect(errors).toEqual([]);
});

test('Shift+drag erases walls, and a door on a wall lets the fill through', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-9, -3]);
  await page.keyboard.press('a');
  await dragPoints(page, [-12, -7], [-12, -2]);
  // Erase the bottom two edges of it
  await dragPoints(page, [-12, -4], [-12, -2], ['Shift']);
  expect((await layer(page)).walls).toHaveLength(3);
  // Draw them back, then open one edge with an archway
  await dragPoints(page, [-12, -4], [-12, -2]);
  expect((await layer(page)).walls).toHaveLength(5);
  await page.keyboard.press('d');
  await page.getByRole('button', { name: 'archway' }).click();
  const edge = await gridPoint(page, -12.05, -4.5);
  await page.mouse.click(edge.x, edge.y);

  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'tiles' }).click();
  await clickCell(page, -14, -4);
  expect((await layer(page)).floors['-10,-4']).toBe('tiles');
  expect(errors).toEqual([]);
});

test('walls can be selected, deleted and exported as VTT walls', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-9, -3]);

  await page.keyboard.press('Control+e');
  const losBefore = JSON.parse(
    await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click())
  ).line_of_sight.length;
  await page.keyboard.press('Escape');

  await page.keyboard.press('a');
  await dragPoints(page, [-12, -7], [-12, -2]);
  await page.keyboard.press('Control+e');
  const vtt = JSON.parse(
    await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click())
  );
  expect(vtt.line_of_sight.length).toBe(losBefore + 5);
  await page.keyboard.press('Escape');

  // Pick one wall edge with the select tool and delete it
  await page.keyboard.press('v');
  const onWall = await gridPoint(page, -11.95, -5.5);
  await page.mouse.click(onWall.x, onWall.y);
  await expect(page.getByText('Selected: wall')).toBeVisible();
  await page.keyboard.press('Delete');
  const walls = (await layer(page)).walls;
  expect(walls).toHaveLength(4);
  expect(walls.some((w) => Math.min(w.y, w.y + w.dy) === -6)).toBe(false);
  expect(errors).toEqual([]);
});

test('on a hex grid, walls follow hex edges', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('a');
  await dragPoints(page, [-14, -5], [-10, -5]);
  const walls = (await layer(page)).walls;
  expect(walls.length).toBeGreaterThan(4);
  // Every wall is one hex side long
  for (const w of walls) expect(Math.hypot(w.dx, w.dy)).toBeCloseTo(1 / Math.sqrt(3), 5);
  expect(errors).toEqual([]);
});

/** One stroke through several grid points */
async function tracePoints(page: Page, points: [number, number][]) {
  const [first, ...rest] = await Promise.all(points.map((p) => gridPoint(page, ...p)));
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const p of rest) await page.mouse.move(p.x, p.y, { steps: 10 });
  await page.mouse.up();
}

const roomCells = async (page: Page) => Object.keys((await layer(page)).rooms).filter((k) => {
  const [x, y] = k.split(',').map(Number);
  return x >= -15 && x <= -8 && y >= -8 && y <= 0;
});

test('walls that close off ground make it a room with the chosen floor, undone with the stroke', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Background').selectOption('grass');
  await page.keyboard.press('a');
  await page.getByRole('button', { name: 'cobbles' }).click();

  // One stroke all the way round a 4x4 square
  await tracePoints(page, [[-15, -7], [-11, -7], [-11, -3], [-15, -3], [-15, -7]]);
  expect(await roomCells(page)).toHaveLength(16);
  let l = await layer(page);
  expect(l.floors['-14,-6']).toBe('cobbles');
  expect(l.walls).toHaveLength(16);

  // It is a room now, so the fill tool re-textures it
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'tiles' }).click();
  await clickCell(page, -13, -5);
  expect((await layer(page)).floors['-12,-4']).toBe('tiles');

  // Undo the fill, then the stroke takes its room with it
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  l = await layer(page);
  expect(await roomCells(page)).toHaveLength(0);
  expect(l.walls).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('an outline closed over several strokes becomes a room, one with a gap does not', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('a');
  // Three sides leave a gap: no room
  await tracePoints(page, [[-15, -7], [-11, -7], [-11, -3], [-15, -3]]);
  expect(await roomCells(page)).toHaveLength(0);
  // The last side closes it
  await tracePoints(page, [[-15, -3], [-15, -7]]);
  expect(await roomCells(page)).toHaveLength(16);
  // A wall splitting the new room changes no floor
  await tracePoints(page, [[-13, -7], [-13, -3]]);
  expect(await roomCells(page)).toHaveLength(16);
});

test('on a hex grid, walls that close off a hex make it floor', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('a');
  // Round the six corners of the hex centred near (-12.5, -4.5)
  const corners: [number, number][] = await page.evaluate(() => {
    const s = Math.sqrt(3) / 6;
    // Hex (q, r) with centre on the lattice; pick r = -6 row, nearest q
    const r = -6;
    const q = Math.round(-13 - r / 2);
    const cx = q + r / 2 + 0.5;
    const cy = r * 3 * s + 0.5;
    const offsets: [number, number][] = [[0.5, s], [0, 2 * s], [-0.5, s], [-0.5, -s], [0, -2 * s], [0.5, -s]];
    return offsets.map(([dx, dy]) => [cx + dx, cy + dy] as [number, number]);
  });
  await tracePoints(page, [...corners, corners[0]]);
  const l = await layer(page);
  expect(l.walls).toHaveLength(6);
  // Exactly one hex of floor: √3/2 square units
  const area = l.shapes.flat().reduce((sum, ring) => {
    let a = 0;
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    return sum + Math.abs(a) / 2;
  }, 0);
  expect(area).toBeCloseTo(Math.sqrt(3) / 2, 4);
});
