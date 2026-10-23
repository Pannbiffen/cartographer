import { test, expect, type Page } from '@playwright/test';
import { openApp, clickCell, dragCells, gridPoint, saveMap, trackErrors, view } from './helpers';

// The starter map leaves rows y >= 8 empty

/** Share of a square's pixels inked darker than the paper (with the pointer off the canvas) */
async function inkShare(page: Page, gx: number, gy: number, size: number) {
  const a = await gridPoint(page, gx, gy);
  const b = await gridPoint(page, gx + size, gy + size);
  await page.mouse.move(1, 1);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, [a, b]) => {
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const x = Math.round((a.x - box.x) * scale);
    const y = Math.round((a.y - box.y) * scale);
    const w = Math.max(1, Math.round((b.x - a.x) * scale));
    const h = Math.max(1, Math.round((b.y - a.y) * scale));
    const data = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
    let dark = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] + data[i + 1] + data[i + 2] < 600) dark++;
    return dark / (w * h);
  }, [a, b]);
}

/** Average colour of a square's pixels, as [r, g, b] (with the pointer off the canvas) */
async function averageColour(page: Page, gx: number, gy: number, size: number) {
  const a = await gridPoint(page, gx, gy);
  const b = await gridPoint(page, gx + size, gy + size);
  await page.mouse.move(1, 1);
  await page.evaluate(() => new Promise(requestAnimationFrame));
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement, [a, b]) => {
    const box = canvas.getBoundingClientRect();
    const scale = canvas.width / box.width;
    const x = Math.round((a.x - box.x) * scale);
    const y = Math.round((a.y - box.y) * scale);
    const w = Math.max(1, Math.round((b.x - a.x) * scale));
    const h = Math.max(1, Math.round((b.y - a.y) * scale));
    const data = canvas.getContext('2d')!.getImageData(x, y, w, h).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) sum[c] += data[i + c];
    return sum.map((v) => v / (w * h));
  }, [a, b]);
}

test('room tools lay the chosen floor texture, and plain clears it', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'planks' }).click();
  await dragCells(page, [-15, 8], [-13, 8]);

  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await dragCells(page, [-10, 8], [-9, 9]);

  let floors = (await saveMap(page)).levels[0].layers[0].floors;
  expect(floors).toMatchObject({ '-15,8': 'planks', '-13,8': 'planks', '-10,8': 'cobbles', '-9,9': 'cobbles' });

  // Painting plain over a textured cell clears its texture; erasing drops it
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'plain' }).click();
  await clickCell(page, -15, 8);
  await page.keyboard.press('e');
  await clickCell(page, -10, 8);
  floors = (await saveMap(page)).levels[0].layers[0].floors;
  expect(floors['-15,8']).toBeUndefined();
  expect(floors['-10,8']).toBeUndefined();
  expect(floors['-14,8']).toBe('planks');
  expect(errors).toEqual([]);
});

test('grass, sand, carpet, slabs and marble can be laid and are drawn', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  // A blank map, framed around the origin
  await page.keyboard.press('Control+Alt+n');
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');
  await page.keyboard.press('r');
  // A plain room for comparison, then one room per texture, a cell apart
  const textures = ['plain', 'grass', 'sand', 'carpet', 'slabs', 'marble'];
  for (const [i, texture] of textures.entries()) {
    await page.getByRole('button', { name: texture, exact: true }).click();
    await dragCells(page, [-11 + i * 4, 0], [-9 + i * 4, 1]);
  }
  const floors = (await saveMap(page)).levels[0].layers[0].floors;
  for (const [i, texture] of textures.entries()) {
    expect(floors[`${-10 + i * 4},1`]).toBe(texture === 'plain' ? undefined : texture);
  }

  // Each inks its room clearly more than the grid alone does in the plain one
  const room = (i: number) => inkShare(page, -11 + i * 4, 0, 2);
  const plain = await room(0);
  for (let i = 1; i < textures.length; i++) {
    expect(await room(i), textures[i]).toBeGreaterThan(plain + 0.01);
  }
  expect(errors).toEqual([]);
});

test('wall and hatching styles are saved with the map', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Wall style').selectOption('rough');
  for (const style of ['crosshatch', 'stipple', 'shadow', 'none']) {
    await page.getByLabel('Hatching', { exact: true }).selectOption(style);
  }
  const map = await saveMap(page);
  expect(map.wallStyle).toBe('rough');
  expect(map.hatchStyle).toBe('none');
  expect(errors).toEqual([]);
});

test('a layer can override the map hatching, and keeps it after a reload', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  // Ink outside the rooms is only measurable on blank paper
  await page.getByLabel('Background').selectOption('paper');
  // A room on the starter layer, then one on a new layer three cells along
  await page.keyboard.press('r');
  await dragCells(page, [-15, 8], [-13, 10]);
  await page.getByRole('button', { name: 'New layer' }).click();
  await dragCells(page, [-9, 8], [-7, 10]);
  await page.getByRole('button', { name: 'Zoom to fit' }).click();

  // Just outside each room's left wall, clear of grid lines and the hatching
  // of the room above them
  const outsideFirst = () => inkShare(page, -15.8, 9.15, 0.7);
  const outsideSecond = () => inkShare(page, -9.8, 9.15, 0.7);
  expect(await outsideFirst()).toBeGreaterThan(0.02);
  expect(await outsideSecond()).toBeGreaterThan(0.02);

  const hatching = page.getByLabel('Layer hatching', { exact: true });
  await expect(hatching).toHaveValue('map');
  await expect(page.getByLabel('Layer hatching width')).toHaveCount(0);
  await hatching.selectOption('none');
  expect(await outsideSecond()).toBe(0);
  expect(await outsideFirst()).toBeGreaterThan(0.02);
  await expect(page.getByLabel('Layer hatching width')).toHaveCount(0);

  let layers = (await saveMap(page)).levels[0].layers;
  expect(layers[0].hatching).toBeUndefined();
  expect(layers[1].hatching).toEqual({ style: 'none', length: 12, density: 3 });

  // Kept in the browser's copy of the map
  await page.reload();
  await expect(page.getByTestId('map-stats')).toBeVisible();
  await page.getByRole('list', { name: 'Layers' }).getByRole('button', { name: 'Layer 2', exact: true }).click();
  await expect(hatching).toHaveValue('none');
  expect(await outsideSecond()).toBe(0);
  expect(await outsideFirst()).toBeGreaterThan(0.02);

  // Its own style gets its own width; back to the map's, the override goes
  await hatching.selectOption('shadow');
  await page.getByLabel('Layer hatching width').fill('20');
  expect((await saveMap(page)).levels[0].layers[1].hatching).toEqual({ style: 'shadow', length: 20, density: 3 });
  await hatching.selectOption('map');
  layers = (await saveMap(page)).levels[0].layers;
  expect(layers[1].hatching).toBeUndefined();
  expect(await outsideSecond()).toBeGreaterThan(0.02);
  expect(errors).toEqual([]);
});

test('stipple hatching on a large map draws from a tile, zoomed out and back in', async ({ page }) => {
  const errors = trackErrors(page);
  // Count the dots drawn, on any canvas
  await page.addInitScript(() => {
    const w = window as unknown as { arcs: number };
    w.arcs = 0;
    const arc = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.arc = function (...args) {
      w.arcs++;
      return arc.apply(this, args);
    };
  });
  await openApp(page);
  // 2,500 small rooms with 20,000 walls between them: dot by dot, this took
  // seconds a frame, and sometimes nothing was drawn at all
  const map = await saveMap(page);
  const rooms: Record<string, boolean> = {};
  for (let y = 0; y < 150; y += 3) {
    for (let x = 0; x < 150; x += 3) {
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) rooms[`${x + dx},${y + dy}`] = true;
    }
  }
  map.levels[0].layers = [{ ...map.levels[0].layers[0], rooms, floors: {}, doors: [], stairs: [], props: [], labels: [] }];
  Object.assign(map, { theme: 'parchment', background: 'paper', hatchStyle: 'stipple', hatchDensity: 5, hatchLength: 24 });
  await page.getByLabel('Open map file').setInputFiles({
    name: 'large.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 10000');
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame));
  const arcs = () => page.evaluate(() => (window as unknown as { arcs: number }).arcs);

  const ink = (gx: number, gy: number, size = 1) => inkShare(page, gx, gy, size);

  // Zoom out as far as it goes, then back in on the gap between two rooms
  const zoomAt = async (gx: number, gy: number, deltaY: number, times: number) => {
    const p = await gridPoint(page, gx, gy);
    await page.mouse.move(p.x, p.y);
    for (let i = 0; i < times; i++) await page.mouse.wheel(0, deltaY);
  };
  await zoomAt(75, 75, 100, 15);
  await expect.poll(async () => (await view(page)).zoom).toBe(0.2);
  expect(await ink(73.5, 73.5)).toBeGreaterThan(0.05);
  await zoomAt(74.5, 73, -100, 12);
  await expect.poll(async () => (await view(page)).zoom).toBeGreaterThan(1);

  // The gap is dotted, the floor covering the band's inner half is not
  const gap = await ink(74, 73);
  expect(gap).toBeGreaterThan(0.05);
  expect(gap).toBeLessThan(0.6);
  expect(await ink(75.2, 72.2, 0.6)).toBe(0);

  // Panning reuses the tile: no dots drawn one by one (thousands are in view)
  const before = await arcs();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(100);
  await page.keyboard.up('ArrowRight');
  await frame();
  expect((await arcs()) - before).toBeLessThan(50);
  expect(errors).toEqual([]);
});

test('the colour style colours floors by texture and is saved with the map', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.keyboard.press('Control+Alt+n');
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');
  await page.getByLabel('Map style').selectOption('parchment');
  await page.keyboard.press('r');
  for (const [i, texture] of ['grass', 'planks', 'plain'].entries()) {
    await page.getByRole('button', { name: texture, exact: true }).click();
    await dragCells(page, [-7 + i * 5, -1], [-4 + i * 5, 1]);
  }
  // The middle of each room, clear of its walls
  const grass = () => averageColour(page, -6.5, -0.5, 2);
  const planks = () => averageColour(page, -1.5, -0.5, 2);
  const plain = () => averageColour(page, 3.5, -0.5, 2);

  // Ink on one floor colour: no texture tints its room
  const parchment = [await grass(), await planks()];
  for (const [r, g, b] of parchment) {
    expect(Math.abs(g - r)).toBeLessThan(15);
    expect(Math.abs(g - b)).toBeLessThan(40);
  }

  await page.getByLabel('Map style').selectOption('colour');
  const [gr, gg, gb] = await grass();
  expect(gg).toBeGreaterThan(gr + 20);
  expect(gg).toBeGreaterThan(gb + 40);
  const [pr, pg, pb] = await planks();
  expect(pr).toBeGreaterThan(pg + 30);
  expect(pg).toBeGreaterThan(pb + 20);
  // Plain floor keeps a pale, uncoloured look
  const [fr, fg, fb] = await plain();
  expect(Math.min(fr, fg, fb)).toBeGreaterThan(190);
  expect(Math.max(fr, fg, fb) - Math.min(fr, fg, fb)).toBeLessThan(40);

  expect((await saveMap(page)).theme).toBe('colour');
  await page.reload();
  await expect(page.getByLabel('Map style')).toHaveValue('colour');
  // The view is framed afresh, so a pixel or two may differ
  const near = (a: number[], b: number[]) => a.every((v, c) => Math.abs(v - b[c]) < 3);
  expect(near(await grass(), [gr, gg, gb])).toBe(true);

  // Back to parchment, floors are as they were
  await page.getByLabel('Map style').selectOption('parchment');
  expect(near(await grass(), parchment[0])).toBe(true);
  expect(near(await planks(), parchment[1])).toBe(true);
  expect(errors).toEqual([]);
});
