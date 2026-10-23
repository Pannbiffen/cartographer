import { test, expect, type Page } from '@playwright/test';
import { openApp, newEmptyMap, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

/** Distinct colours, mean and highest brightness (0-255) the canvas shows over a block of cells */
async function pixels(page: Page, from: [number, number], to: [number, number]) {
  const a = await gridPoint(page, ...from);
  const b = await gridPoint(page, ...to);
  const box = (await page.locator('canvas').boundingBox())!;
  return page.locator('canvas').evaluate(
    (canvas: HTMLCanvasElement, [x0, y0, x1, y1]) => {
      const dpr = window.devicePixelRatio || 1;
      const { data } = canvas
        .getContext('2d')!
        .getImageData(Math.round(x0 * dpr), Math.round(y0 * dpr), Math.max(1, Math.round((x1 - x0) * dpr)), Math.max(1, Math.round((y1 - y0) * dpr)));
      const seen = new Set<number>();
      let sum = 0;
      let max = 0;
      let min = 255;
      for (let i = 0; i < data.length; i += 4) {
        seen.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
        const v = (data[i] + data[i + 1] + data[i + 2]) / 3;
        sum += v;
        max = Math.max(max, v);
        min = Math.min(min, v);
      }
      return { colours: seen.size, mean: sum / (data.length / 4), max, min };
    },
    [a.x - box.x, a.y - box.y, b.x - box.x, b.y - box.y]
  );
}

const BLOCK: [[number, number], [number, number]] = [[-15, -7], [-12, -4]];

test('the background fills the map around the rooms, rooms on it get walls, and it is saved', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  // The starter crypt lies on paving stones; paper is one flat colour, give or take the grid
  await expect(page.getByLabel('Background')).toHaveValue('paving');
  await page.getByLabel('Show battle grid').uncheck();
  expect((await pixels(page, ...BLOCK)).colours).toBeGreaterThan(10);
  await page.getByLabel('Background').selectOption('paper');
  await expect.poll(async () => (await pixels(page, ...BLOCK)).colours).toBeLessThanOrEqual(2);

  await page.getByLabel('Background').selectOption('grass');
  await expect.poll(async () => (await pixels(page, ...BLOCK)).colours).toBeGreaterThan(10);

  // A room drawn on it is walled; bold walls, as rough ones wobble off a sampled pixel
  await page.getByLabel('Wall style').selectOption('bold');
  await page.keyboard.press('r');
  await dragCells(page, [-15, -7], [-12, -4]);
  expect((await pixels(page, [-13.5, -7], [-13.5, -7])).mean).toBeLessThan(90);

  expect((await saveMap(page)).background).toBe('grass');

  // Kept in the browser across a reload
  await page.reload();
  await expect(page.getByLabel('Background')).toHaveValue('grass');
  expect(errors).toEqual([]);
});

test('every background shows away from the rooms', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Show battle grid').uncheck();
  const select = page.getByLabel('Background');
  const choices = await select.locator('option').evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
  expect(choices).toEqual(['paper', 'black', 'rough-stone', 'fitted-stone', 'paving', 'brick', 'packed-earth', 'grass', 'sand', 'dirt']);
  expect(await select.locator('optgroup').evaluateAll((groups) => groups.map((g) => (g as HTMLOptGroupElement).label))).toEqual([
    'Plain',
    'Dungeon',
    'Outdoor',
  ]);

  const means = new Map<string, number>();
  for (const choice of choices) {
    await select.selectOption(choice);
    await expect(async () => {
      const { colours, mean } = await pixels(page, ...BLOCK);
      if (choice === 'paper' || choice === 'black') expect(colours).toBeLessThanOrEqual(2);
      else expect(colours).toBeGreaterThan(10);
      if (choice === 'black') expect(mean).toBeLessThan(5);
      means.set(choice, mean);
    }).toPass();
  }
  // Paper is the style's paper, and the textures all differ from it and each other
  expect(means.get('paper')).toBeGreaterThan(190);
  expect(new Set([...means.values()].map(Math.round)).size).toBe(choices.length);
  expect(errors).toEqual([]);
});

test('on black the hatching and grid turn light, and walls still show', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Background').selectOption('black');
  await page.getByLabel('Wall style').selectOption('bold');
  await page.keyboard.press('r');
  await dragCells(page, [-14, -6], [-11, -3]);
  // Hatching just above the room, and grid lines in the empty space beside it
  await expect.poll(async () => (await pixels(page, [-13, -6.4], [-12, -6.05])).max).toBeGreaterThan(150);
  expect((await pixels(page, [-9.8, -1.8], [-8.2, -0.2])).max).toBeGreaterThan(40);
  // The wall's ink along the floor's edge, and the floor itself light
  const edge = await pixels(page, [-13, -6.02], [-12, -5.9]);
  expect(edge.min).toBeLessThan(90);
  expect((await pixels(page, [-12.6, -4.6], [-12.4, -4.4])).mean).toBeGreaterThan(190);
});

test('the background is part of the new-map look', async ({ page }) => {
  await openApp(page);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const prefs = page.getByRole('dialog', { name: 'Preferences' });
  await prefs.getByLabel('Background').selectOption('packed-earth');
  await page.keyboard.press('Escape');

  await newEmptyMap(page);
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 0');
  expect((await saveMap(page)).background).toBe('packed-earth');
});
