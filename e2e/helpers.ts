import { expect, type Page } from '@playwright/test';
import type { MapData } from '../src/types/map';

/**
 * Opens the app with the starter map (each test gets fresh browser storage).
 * `mapSettings` starts with the map settings drawer open, as if left open last time,
 * so the map is framed in the canvas above it.
 */
export async function openApp(page: Page, { mapSettings = false } = {}) {
  if (mapSettings) {
    await page.addInitScript(() => {
      const key = 'cartographer.preferences.v1';
      const prefs = JSON.parse(localStorage.getItem(key) ?? '{}');
      if (prefs.showMapSettings === undefined) {
        localStorage.setItem(key, JSON.stringify({ ...prefs, showMapSettings: true }));
      }
    });
  }
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  // Wait until the app's keyboard listeners are attached
  await expect(page.getByTestId('map-stats')).toBeVisible();
  // ...and the view has been placed for the canvas size
  await expect(page.locator('canvas')).not.toHaveAttribute('data-view', '0,0,1');
}

/** Opens the map settings drawer (title, style, walls, lighting, grid) if it is closed */
export async function openMapSettings(page: Page) {
  const toggle = page.getByRole('region', { name: 'Map settings' }).getByRole('button', { name: 'Map settings' });
  if ((await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
}

/** The canvas view transform: screen offset of the grid origin and zoom */
export async function view(page: Page) {
  const [x, y, zoom] = (await page.locator('canvas').getAttribute('data-view'))!
    .split(',')
    .map(Number);
  return { x, y, zoom };
}

/** On-screen size of one grid cell at the current zoom */
export async function cellPixels(page: Page) {
  return 40 * (await view(page)).zoom;
}

/**
 * Screen position of a point in grid units at the current view.
 * Pass fractional values to aim at edges, e.g. (6, 1.5) for a vertical edge.
 */
export async function gridPoint(page: Page, gx: number, gy: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('canvas not ready');
  const v = await view(page);
  return {
    x: box.x + v.x + gx * 40 * v.zoom,
    y: box.y + v.y + gy * 40 * v.zoom,
  };
}

/** Screen position of the centre of grid cell (gx, gy) */
export function cellCenter(page: Page, gx: number, gy: number) {
  return gridPoint(page, gx + 0.5, gy + 0.5);
}

export async function clickCell(page: Page, gx: number, gy: number) {
  const p = await cellCenter(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

/** Drags with the left button between two grid positions */
export async function dragCells(
  page: Page,
  from: [number, number],
  to: [number, number],
  steps = 6
) {
  const a = await cellCenter(page, ...from);
  const b = await cellCenter(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps });
  await page.mouse.up();
}

/** Saves the project with Ctrl+S and returns the parsed map */
export async function saveMap(page: Page): Promise<MapData> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.keyboard.press('Control+s'),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** The status bar's live counters, e.g. { rooms: 194, water: 16, foliage: 4 } */
export async function stats(page: Page) {
  const text = await page.getByTestId('map-stats').innerText();
  const num = (label: string) => Number(new RegExp(`${label}: (\\d+)`).exec(text)?.[1]);
  return { rooms: num('Rooms'), water: num('Water'), foliage: num('Foliage') };
}

/** Fails the test on any uncaught page error or console error */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}
