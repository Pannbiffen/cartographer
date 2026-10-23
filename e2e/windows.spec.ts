import { test, expect, type Page } from '@playwright/test';
import { openApp, gridPoint, saveMap, trackErrors } from './helpers';
import type { MapData, PlacedWindow } from '../src/types/map';

/** The canvas colour at a point in grid units */
async function rgbAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  const box = (await page.locator('canvas').boundingBox())!;
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, [x, y]) => {
      const dpr = window.devicePixelRatio || 1;
      const [r, g, b] = canvas.getContext('2d')!.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
      return { r, g, b };
    },
    [p.x - box.x, p.y - box.y]
  );
}

async function brightnessAt(page: Page, gx: number, gy: number) {
  const { r, g, b } = await rgbAt(page, gx, gy);
  return (r + g + b) / 3;
}

/**
 * A dark hall x 0..9, y 0..4 split by a thin wall along x = 5, with a light
 * at (2, 2) on the left and, if given, windows in it
 */
async function openHall(page: Page, windows: PlacedWindow[] = []) {
  await openApp(page);
  const base = await saveMap(page);
  const rooms: Record<string, boolean> = {};
  for (let x = 0; x < 10; x++) for (let y = 0; y < 5; y++) rooms[`${x},${y}`] = true;
  const layer = {
    ...base.levels[0].layers[0],
    rooms,
    shapes: [],
    cuts: [],
    floors: {},
    floorAreas: {},
    water: {},
    clearWater: {},
    lava: {},
    paint: {},
    foliage: {},
    doors: [],
    stairs: [],
    props: [],
    labels: [],
    walls: [0, 1, 2, 3, 4].map((y) => ({ id: `w${y}`, x: 5, y, dx: 0, dy: 1 })),
    windows,
    lights: [{ id: 'l1', x: 2, y: 2, color: '#ffe2a8', radius: 8, intensity: 1 }],
  };
  const map: MapData = {
    ...base,
    title: 'Hall',
    outdoor: false,
    showGrid: false,
    lighting: true,
    darkness: 0.9,
    levels: [{ ...base.levels[0], layers: [layer] }],
  };
  await page.getByLabel('Open map file').setInputFiles({
    name: 'hall.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 50');
}

const PANE: PlacedWindow = { id: 'win1', x: 5, y: 2, orientation: 'vertical', tint: '#cfe8ff', clarity: 0.8 };

test('a window lets light through its wall, dimmed and tinted', async ({ page }) => {
  const errors = trackErrors(page);
  await openHall(page);
  // Beyond the wall it is as dark with or without a window's spot
  const shut = await brightnessAt(page, 6.5, 2.5);
  expect(Math.abs(shut - (await brightnessAt(page, 6.5, 0.5)))).toBeLessThanOrEqual(2);

  // The Window tool puts one in the wall nearest the click and selects it
  await page.keyboard.press('j');
  const edge = await gridPoint(page, 5.1, 2.5);
  await page.mouse.click(edge.x, edge.y);
  await expect(page.getByText('Selected: window')).toBeVisible();
  const windows = (await saveMap(page)).levels[0].layers[0].windows;
  expect(windows).toEqual([expect.objectContaining({ x: 5, y: 2, orientation: 'vertical', clarity: 0.8 })]);

  // Lit through the pane, but less than inside, and still dark beside it behind the wall
  const through = await brightnessAt(page, 6.5, 2.5);
  const inside = await brightnessAt(page, 3.5, 2.5);
  const behind = await brightnessAt(page, 6.5, 0.5);
  expect(through).toBeGreaterThan(behind + 10);
  expect(inside).toBeGreaterThan(through + 5);

  // A green pane casts greener light
  const before = await rgbAt(page, 6.5, 2.5);
  await page.getByLabel('Window tint').fill('#00ff00');
  await expect.poll(async () => {
    const after = await rgbAt(page, 6.5, 2.5);
    return after.g - after.r - (before.g - before.r);
  }).toBeGreaterThan(8);

  // Letting no light through makes it a wall again
  await page.getByLabel('Light through').fill('0');
  expect((await saveMap(page)).levels[0].layers[0].windows[0].clarity).toBe(0);
  await expect.poll(async () => Math.abs((await brightnessAt(page, 6.5, 2.5)) - shut)).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});

test('windows are selected, moved, rotated, erased and undone like doors', async ({ page }) => {
  const errors = trackErrors(page);
  await openHall(page, [PANE]);
  const windows = async () => (await saveMap(page)).levels[0].layers[0].windows;

  // Select with the Select tool and drag along the wall
  await page.keyboard.press('v');
  const from = await gridPoint(page, 5, 2.5);
  const to = await gridPoint(page, 5, 3.5);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText('Selected: window')).toBeVisible();
  expect(await windows()).toEqual([expect.objectContaining({ x: 5, y: 3, orientation: 'vertical' })]);

  // Nudge, rotate, duplicate (the copy goes along the wall and is selected)
  await page.keyboard.press('ArrowUp');
  expect(await windows()).toEqual([expect.objectContaining({ x: 5, y: 2 })]);
  await page.keyboard.press('r');
  expect(await windows()).toEqual([expect.objectContaining({ x: 5, y: 2, orientation: 'horizontal' })]);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+d');
  expect(await windows()).toEqual([
    expect.objectContaining({ x: 5, y: 2 }),
    expect.objectContaining({ x: 5, y: 3, orientation: 'vertical' }),
  ]);
  await page.keyboard.press('Delete');

  // Delete, then undo
  await page.mouse.click(from.x, from.y);
  await expect(page.getByText('Selected: window')).toBeVisible();
  await page.keyboard.press('Delete');
  expect(await windows()).toEqual([]);
  await page.keyboard.press('Control+z');
  expect(await windows()).toEqual([expect.objectContaining({ x: 5, y: 2, orientation: 'vertical' })]);

  // The eraser takes it away with the cell beside it
  await page.keyboard.press('e');
  const cell = await gridPoint(page, 4.5, 2.5);
  await page.mouse.click(cell.x, cell.y);
  expect(await windows()).toEqual([]);
  expect(errors).toEqual([]);
});
