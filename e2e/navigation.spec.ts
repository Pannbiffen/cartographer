import { test, expect, type Page } from '@playwright/test';
import { openApp, view } from './helpers';

async function wheelOverCanvas(page: Page, deltaY: number, times = 1) {
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < times; i++) await page.mouse.wheel(0, deltaY);
}

async function zoomAfterWheel(page: Page, deltaY: number, times = 1) {
  const before = (await view(page)).zoom;
  await wheelOverCanvas(page, deltaY, times);
  await expect.poll(async () => (await view(page)).zoom).not.toBe(before);
  // Wheel events can land over a few frames
  await page.waitForTimeout(100);
  return (await view(page)).zoom / before;
}

test('arrow keys pan the map while held, faster with Shift', async ({ page }) => {
  await openApp(page);
  const start = await view(page);

  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowRight');
  const afterRight = await view(page);
  // The view moves right, so the map slides left
  const slow = start.x - afterRight.x;
  expect(slow).toBeGreaterThan(50);
  expect(afterRight.y).toBe(start.y);
  expect(afterRight.zoom).toBe(start.zoom);

  await page.keyboard.down('Shift');
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.up('Shift');
  const afterUp = await view(page);
  expect(afterUp.y - afterRight.y).toBeGreaterThan(slow * 1.5);

  // Panning stops once the key is released
  await page.waitForTimeout(150);
  expect(await view(page)).toEqual(afterUp);
});

test('arrow keys in a form field do not pan the map', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Map title').focus();
  const start = await view(page);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(200);
  await page.keyboard.up('ArrowLeft');
  expect(await view(page)).toEqual(start);
});

test('wheel zoom follows the scroll distance and the zoom speed preference', async ({ page }) => {
  await openApp(page);

  // One mouse-wheel notch zooms about 15%
  const notch = await zoomAfterWheel(page, -100);
  expect(notch).toBeGreaterThan(1.1);
  expect(notch).toBeLessThan(1.2);

  // Ten small trackpad-like events add up to about the same
  const trackpad = await zoomAfterWheel(page, 10, 10);
  expect(trackpad).toBeGreaterThan(1 / 1.2);
  expect(trackpad).toBeLessThan(1 / 1.1);

  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Preferences' });
  await dialog.getByRole('radiogroup', { name: 'Wheel zoom speed' }).getByRole('radio', { name: 'Fast' }).click();
  await page.keyboard.press('Escape');

  const fast = await zoomAfterWheel(page, -100);
  expect(fast).toBeGreaterThan(1.25);
});
