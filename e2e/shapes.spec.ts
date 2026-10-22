import { test, expect, type Page } from '@playwright/test';
import { openApp, gridPoint, saveMap, trackErrors, view } from './helpers';

// The starter map leaves rows y >= 8 and the block x -15..-8, y -8..0 empty

async function clickAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

async function dragFrom(page: Page, from: [number, number], to: [number, number]) {
  const a = await gridPoint(page, ...from);
  const b = await gridPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}

async function topLayer(page: Page) {
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

test('the polygon tool adds a free-form room, undone in one step', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('n');
  // A triangle with a diagonal wall, closed on its first corner
  await clickAt(page, -14, -7);
  await clickAt(page, -9, -7);
  await clickAt(page, -14, -2);
  await clickAt(page, -14, -7);

  const layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(1);
  const corners = layer.shapes[0][0];
  expect(corners).toContainEqual([-9, -7]);
  expect(corners).toContainEqual([-14, -2]);

  await page.keyboard.press('Control+z');
  expect((await topLayer(page)).shapes).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('Enter finishes a path and Escape abandons one', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('h');
  await clickAt(page, -14.5, -7.5);
  await clickAt(page, -10.5, -3.5);
  await page.keyboard.press('Escape');
  expect((await topLayer(page)).shapes).toHaveLength(0);

  await clickAt(page, -14.5, -7.5);
  await clickAt(page, -10.5, -3.5);
  await clickAt(page, -8.5, -3.5);
  await page.keyboard.press('Enter');
  const layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(1);
  // Square ends reach half a cell past the end points
  const xs = layer.shapes[0][0].map(([x]) => x);
  expect(Math.max(...xs)).toBeCloseTo(-8, 5);
});

test('a circle cut carves into a room, and painting cells over it fills back', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'cut', exact: true }).click();
  // Centred on the corner of the starter map's middle room
  await dragFrom(page, [0, 2], [0, 4]);
  let layer = await topLayer(page);
  expect(layer.cuts).toHaveLength(1);
  // A click without a drag adds nothing
  await clickAt(page, 0, 2);
  expect((await topLayer(page)).cuts).toHaveLength(1);

  // The room brush takes back the cells it paints from the cut
  await page.keyboard.press('b');
  await page.getByRole('complementary', { name: 'Properties' }).locator('input[type=range]').first().fill('5');
  await clickAt(page, 0.5, 2.5);
  layer = await topLayer(page);
  const area = layer.cuts.reduce((sum, polygon) => sum + ringArea(polygon[0]), 0);
  expect(area).toBeLessThan(Math.PI * 4 - 1);

  // Lights cast shadows from the new outline without errors
  await page.getByRole('checkbox', { name: 'Darken map and show lights' }).check();
  expect(errors).toEqual([]);
});

test('shape tools lay the chosen floor texture, and the newest floor wins', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'planks' }).click();
  await dragFrom(page, [-12, -4], [-12, -1]);
  let layer = await topLayer(page);
  expect(ringArea(layer.floorAreas.planks![0][0])).toBeCloseTo(ringArea(layer.shapes[0][0]), 5);

  // A plain circle over part of it takes that part back, and stores no plain area
  await page.getByRole('button', { name: 'plain' }).click();
  await dragFrom(page, [-9, -4], [-9, -3]);
  layer = await topLayer(page);
  const planks = ringArea(layer.floorAreas.planks![0][0]);
  expect(planks).toBeLessThan(Math.PI * 9 - 0.5);
  expect(layer.floorAreas.plain).toBeUndefined();

  // Cells painted over it do too
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await clickAt(page, -12.5, -3.5);
  layer = await topLayer(page);
  // The cell becomes a hole in it
  expect(ringArea(layer.floorAreas.planks![0][0]) - ringArea(layer.floorAreas.planks![0][1])).toBeCloseTo(planks - 1, 5);
  expect(layer.floors['-13,-4']).toBe('cobbles');

  // A plain shape over textured cells keeps a plain area to hide them
  await page.keyboard.press('n');
  await page.getByRole('button', { name: 'plain' }).click();
  for (const [x, y] of [[-14, -5], [-11, -5], [-11, -2], [-14, -2], [-14, -5]]) await clickAt(page, x, y);
  layer = await topLayer(page);
  expect(layer.floorAreas.plain).toHaveLength(1);

  // A cut takes the textures with it
  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'cut', exact: true }).click();
  await dragFrom(page, [-12, -4], [-12, 0]);
  layer = await topLayer(page);
  expect(layer.floorAreas).toEqual({});
  expect(errors).toEqual([]);
});

test('the hex room brush lays the chosen floor texture', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('b');
  await page.getByRole('button', { name: 'tiles' }).click();
  await clickAt(page, -11.5, HEX_Y);
  const layer = await topLayer(page);
  expect(ringArea(layer.floorAreas.tiles![0][0])).toBeCloseTo(Math.sqrt(3) / 2, 5);
});

// The centre of pointy hex (-10, -4), in the empty block
const HEX_Y = 0.5 - 2 * Math.sqrt(3);

test('on a hex grid the room brush and eraser work in whole hexes', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('b');
  await clickAt(page, -11.5, HEX_Y);
  let layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(1);
  // One hexagon: six corners and the closing point
  expect(layer.shapes[0][0]).toHaveLength(7);
  expect(ringArea(layer.shapes[0][0])).toBeCloseTo(Math.sqrt(3) / 2, 5);

  await page.keyboard.press('e');
  await clickAt(page, -11.5, HEX_Y);
  layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('the grid shape is saved with the map', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-flat');
  expect((await saveMap(page)).gridType).toBe('hex-flat');
});

function ringArea(ring: [number, number][]): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(sum / 2);
}

test('textured areas out of view cost nothing to draw', async ({ page }) => {
  const errors = trackErrors(page);
  // Count the curves cobbles are drawn with
  await page.addInitScript(() => {
    const w = window as unknown as { curves: number };
    w.curves = 0;
    const curve = CanvasRenderingContext2D.prototype.quadraticCurveTo;
    CanvasRenderingContext2D.prototype.quadraticCurveTo = function (...args) {
      w.curves++;
      return curve.apply(this, args);
    };
  });
  await openApp(page);
  const curvesPerFrame = async () => {
    await page.evaluate(() => ((window as unknown as { curves: number }).curves = 0));
    // Hovering redraws the map
    const p = await gridPoint(page, -12, -3);
    await page.mouse.move(p.x, p.y);
    await page.mouse.move(p.x + 3, p.y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    return page.evaluate(() => (window as unknown as { curves: number }).curves);
  };

  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await dragFrom(page, [-12, -4], [-12, -1]);
  await dragFrom(page, [0, 9], [4, 9]);
  expect((await topLayer(page)).floorAreas.cobbles).toHaveLength(2);

  // Zoomed in on the first circle, the second is far out of view
  const a = await gridPoint(page, -12, -4);
  await page.mouse.move(a.x, a.y);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, -100);
  await expect.poll(async () => (await view(page)).zoom).toBe(4);
  const both = await curvesPerFrame();
  expect(both).toBeGreaterThan(0);

  // Drawing it costs nothing: textures far apart used to fill the whole box between them
  await page.keyboard.press('Control+z');
  expect((await topLayer(page)).floorAreas.cobbles).toHaveLength(1);
  expect(await curvesPerFrame()).toBe(both);
  expect(errors).toEqual([]);
});

test('zoomed out, textures fill from a tile drawn once, however far the view pans', async ({ page }) => {
  const errors = trackErrors(page);
  // Count the curves cobbles are drawn with (always off screen, on a tile or
  // scratch canvas), and the patterns filled from tiles
  await page.addInitScript(() => {
    const w = window as unknown as { curves: number; patterns: number };
    w.curves = 0;
    w.patterns = 0;
    const proto = CanvasRenderingContext2D.prototype;
    const curve = proto.quadraticCurveTo;
    proto.quadraticCurveTo = function (...args) {
      if (!this.canvas.isConnected) w.curves++;
      return curve.apply(this, args);
    };
    const createPattern = proto.createPattern;
    proto.createPattern = function (...args) {
      w.patterns++;
      return createPattern.apply(this, args);
    };
  });
  await openApp(page);
  const counts = () =>
    page.evaluate(() => {
      const { curves, patterns } = window as unknown as { curves: number; patterns: number };
      return { curves, patterns };
    });
  const reset = () => page.evaluate(() => Object.assign(window, { curves: 0, patterns: 0 }));
  const hover = async () => {
    // Hovering redraws the map
    const p = await gridPoint(page, -12, -3);
    await page.mouse.move(p.x, p.y);
    await page.mouse.move(p.x + 3, p.y);
    await page.evaluate(() => new Promise(requestAnimationFrame));
  };

  await page.keyboard.press('c');
  await page.getByRole('button', { name: 'cobbles' }).click();
  await dragFrom(page, [-12, -4], [-12, 2]);
  expect((await topLayer(page)).floorAreas.cobbles).toHaveLength(1);

  const a = await gridPoint(page, -12, -4);
  await page.mouse.move(a.x, a.y);
  for (let i = 0; i < 14; i++) await page.mouse.wheel(0, 100);
  await expect.poll(async () => (await view(page)).zoom).toBe(0.2);

  // The first frame at this zoom draws the tile; later ones only fill from it
  await hover();
  await reset();
  await hover();
  const still = await counts();
  expect(still.patterns).toBeGreaterThan(0);
  expect(still.curves).toBe(0);

  // Panning keeps the tile
  await reset();
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  await page.evaluate(() => new Promise(requestAnimationFrame));
  const panned = await counts();
  expect(panned.patterns).toBeGreaterThan(1);
  expect(panned.curves).toBe(0);
  expect(errors).toEqual([]);
});
