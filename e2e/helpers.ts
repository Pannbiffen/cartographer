import { expect, type Page } from '@playwright/test';
import type { MapData } from '../src/types/map';

/** Opens the app with the starter map (each test gets fresh browser storage) */
export async function openApp(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  // Wait until the app's keyboard listeners are attached
  await expect(page.getByText(/Rooms: \d+/)).toBeVisible();
}

/**
 * Screen position of a point in grid units at the default viewport (zoom 1,
 * origin centred horizontally and 20px above the window's vertical centre).
 * Pass fractional values to aim at edges, e.g. (6, 1.5) for a vertical edge.
 */
export async function gridPoint(page: Page, gx: number, gy: number) {
  const box = await page.locator('canvas').boundingBox();
  const size = page.viewportSize();
  if (!box || !size) throw new Error('canvas not ready');
  return {
    x: box.x + size.width / 2 + gx * 40,
    y: box.y + size.height / 2 - 20 + gy * 40,
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

/** The sidebar's live counters, e.g. { rooms: 194, water: 16, foliage: 4 } */
export async function stats(page: Page) {
  const text = await page.getByText(/Rooms: \d+/).locator('..').innerText();
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
