import { test, expect } from '@playwright/test';
import { openApp, gridPoint, saveMap, view } from './helpers';

test('menus run commands and show their state', async ({ page }) => {
  await openApp(page);
  const menubar = page.getByRole('menubar');

  // Tools menu picks a tool and checks it; the toolbox follows
  await menubar.getByRole('menuitem', { name: 'Tools' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Water/ }).click();
  await expect(page.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // View > Show Grid toggles the map setting
  await menubar.getByRole('menuitem', { name: 'View' }).click();
  await expect(page.getByRole('menuitemcheckbox', { name: /Show Grid/ })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('menuitemcheckbox', { name: /Show Grid/ }).click();
  expect((await saveMap(page)).showGrid).toBe(false);

  // Hovering along the bar switches menus once one is open; Escape closes
  await menubar.getByRole('menuitem', { name: 'File' }).click();
  await menubar.getByRole('menuitem', { name: 'Edit' }).hover();
  await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Rotate Selection/ })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  // File > Export opens the export dialog; Escape closes it
  await menubar.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Export/ }).click();
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('the properties panel can be hidden from the View menu', async ({ page }) => {
  await openApp(page);
  const canvasWidth = async () => (await page.locator('canvas').boundingBox())!.width;
  const before = await canvasWidth();

  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: /Properties Panel/ }).click();
  await expect(page.getByRole('complementary', { name: 'Properties' })).toHaveCount(0);
  expect(await canvasWidth()).toBeGreaterThan(before);
});

test('the map is framed on open and by Zoom to fit', async ({ page }) => {
  await openApp(page);
  const box = (await page.locator('canvas').boundingBox())!;
  const inCanvas = (p: { x: number; y: number }) =>
    p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height;

  // The starter map spans cells x -12..11, y -10..7
  const fitted = await view(page);
  expect(inCanvas(await gridPoint(page, -12, -10))).toBe(true);
  expect(inCanvas(await gridPoint(page, 12, 8))).toBe(true);
  // ...and fills most of the canvas height
  const top = await gridPoint(page, 0, -10);
  const bottom = await gridPoint(page, 0, 8);
  expect(bottom.y - top.y).toBeGreaterThan(box.height * 0.8);

  // Wander off, then come back with Ctrl+0 and the View menu
  await page.keyboard.press('-');
  await page.keyboard.press('-');
  expect((await view(page)).zoom).toBeLessThan(fitted.zoom);
  await page.keyboard.press('Control+0');
  expect(await view(page)).toEqual(fitted);

  await page.keyboard.press('Control+1');
  expect((await view(page)).zoom).toBe(1);
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitem', { name: /Zoom to Fit/ }).click();
  expect(await view(page)).toEqual(fitted);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom to fit' }).click();
  expect(await view(page)).toEqual(fitted);
});

test('opening a project frames the new map', async ({ page }) => {
  await openApp(page);
  const map = await saveMap(page);
  // A small room far from the origin
  const rooms: Record<string, boolean> = {};
  for (let x = 100; x < 104; x++) for (let y = 50; y < 53; y++) rooms[`${x},${y}`] = true;

  await page.locator('input[type=file]').setInputFiles({
    name: 'far.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({ ...map, rooms, water: {}, foliage: {}, doors: [], stairs: [], props: [], labels: [] })
    ),
  });
  await expect(page.getByTestId('map-stats')).toContainText('Rooms: 12');
  const box = (await page.locator('canvas').boundingBox())!;
  const centre = await gridPoint(page, 102, 51.5);
  expect(Math.abs(centre.x - (box.x + box.width / 2))).toBeLessThan(2);
  expect(Math.abs(centre.y - (box.y + box.height / 2))).toBeLessThan(2);
  // A tiny map is not blown up past 200%
  expect((await view(page)).zoom).toBe(2);
});
