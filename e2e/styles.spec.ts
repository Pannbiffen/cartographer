import { test, expect } from '@playwright/test';
import { openApp, clickCell, dragCells, saveMap, trackErrors } from './helpers';

// The starter map leaves rows y >= 8 empty

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
