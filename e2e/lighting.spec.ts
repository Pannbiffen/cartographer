import { test, expect, type Page } from '@playwright/test';
import { openApp, openDarkHall, clickCell, rgbAt, saveMap, trackErrors } from './helpers';

// The starter map has a torch at (-4, 2) in the Grand Hall

async function downloadText(page: Page, trigger: () => Promise<void>) {
  const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

test('the light tool places a light, turns lighting on and edits it', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  expect((await saveMap(page)).lighting).toBe(false);

  await page.keyboard.press('i');
  await clickCell(page, -2, 4);
  await expect(page.getByText('Selected: light')).toBeVisible();
  await page.getByRole('slider').first().fill('8');

  let map = await saveMap(page);
  expect(map.lighting).toBe(true);
  expect(map.levels[0].layers[0].lights).toEqual([
    expect.objectContaining({ x: -2, y: 4, radius: 8 }),
  ]);

  // Clicking the light again selects it rather than adding another; Delete removes it
  await page.keyboard.press('Escape');
  await clickCell(page, -2, 4);
  await expect(page.getByText('Selected: light')).toBeVisible();
  await page.keyboard.press('Delete');
  map = await saveMap(page);
  expect(map.levels[0].layers[0].lights).toEqual([]);
  expect(errors).toEqual([]);
});

test('torches carry editable light settings', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('v');
  await clickCell(page, -4, 2);
  await expect(page.getByText('Selected: torch')).toBeVisible();
  await page.getByLabel('Light colour').fill('#3366ff');
  const torch = (await saveMap(page)).levels[0].layers[0].props.find((p) => p.type === 'torch');
  expect(torch?.light?.color).toBe('#3366ff');
});

test('Universal VTT export includes placed lights and torches', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await page.keyboard.press('i');
  await clickCell(page, -2, 4);
  // Lighting on must not break any export
  await page.keyboard.press('Control+e');
  const vtt = JSON.parse(
    await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click())
  );
  expect(vtt.lights).toHaveLength(2);
  expect(vtt.lights.map((l: { range: number }) => l.range).sort()).toEqual([4, 5]);
  expect(vtt.lights[0].color).toMatch(/^ff[0-9a-f]{6}$/);
  await downloadText(page, () => page.getByRole('button', { name: /PNG/ }).first().click());
  expect(errors).toEqual([]);
});

test('lava glows in the dark, lighting its shore up to the walls', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  // Two lava cells against the hall's thin wall at x = 5
  await openDarkHall(page, { lava: { '3,2': true, '4,2': true } });
  const brightness = async (gx: number, gy: number) => {
    const { r, g, b } = await rgbAt(page, gx, gy);
    return (r + g + b) / 3;
  };
  const far = await brightness(0.5, 0.5);
  expect(await brightness(3.5, 2.5)).toBeGreaterThan(far + 20);
  // The floor beside it catches an orange glow
  const shore = await rgbAt(page, 3.5, 1.5);
  expect((shore.r + shore.g + shore.b) / 3).toBeGreaterThan(far + 5);
  expect(shore.r).toBeGreaterThan(shore.b + 10);
  // ...but none reaches past the wall
  expect(Math.abs((await brightness(5.5, 2.5)) - (await brightness(8.5, 0.5)))).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
