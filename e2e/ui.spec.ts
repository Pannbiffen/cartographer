import { test, expect } from '@playwright/test';
import { openApp, dragCells, gridPoint, saveMap, view } from './helpers';

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

test('dialogs take keyboard focus, keep Tab inside and give focus back', async ({ page }) => {
  await openApp(page);
  const trigger = page.getByRole('button', { name: 'Export' });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Export' });
  await expect(dialog).toBeFocused();
  const focusInside = () => dialog.evaluate((el) => el.contains(document.activeElement));

  // Shift+Tab from the dialog wraps to its last control; Tab from there to the first
  await page.keyboard.press('Shift+Tab');
  expect(await focusInside()).toBe(true);
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Close' }).first()).toBeFocused();
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    expect(await focusInside()).toBe(true);
  }

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // A control with autoFocus keeps it
  await dragCells(page, [7, 6], [10, 6]);
  await page.keyboard.press('Control+Alt+n');
  await expect(page.getByRole('dialog', { name: /\?$/ }).getByRole('button', { name: 'Save first' })).toBeFocused();
});

test('the keyboard shortcuts dialog lists menu, tool and map shortcuts', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(dialog).toBeVisible();
  // Read from the menus (File, Tools) plus the map-only keys
  const row = (action: string) => dialog.locator('dt', { hasText: action }).locator('xpath=following-sibling::dd[1]');
  await expect(row('Save')).toHaveText('Ctrl+S');
  await expect(row('Rectangle Room')).toHaveText('R');
  await expect(row('Remove last point')).toHaveText('Backspace');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('menuitem', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name: /Keyboard Shortcuts/ }).click();
  await expect(dialog).toBeVisible();
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

test('map-wide settings live in a bottom drawer that remembers whether it is open', async ({ page }) => {
  await openApp(page);
  const drawer = page.getByRole('region', { name: 'Map settings' });
  const toggle = drawer.getByRole('button', { name: 'Map settings' });
  const canvasHeight = async () => (await page.locator('canvas').boundingBox())!.height;
  const closedHeight = await canvasHeight();

  // Closed at first; the right panel keeps tool options and layers only
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Map title')).toHaveCount(0);
  const panel = page.getByRole('complementary', { name: 'Properties' });
  await expect(panel.getByRole('list', { name: 'Layers' })).toBeVisible();

  // M opens it under the canvas, which gets shorter
  await page.keyboard.press('m');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await expect(drawer.getByLabel('Map title')).toBeVisible();
  await expect(drawer.getByLabel('Wall style')).toBeVisible();
  await expect(drawer.getByLabel('Grid shape')).toBeVisible();
  await expect(panel.getByLabel('Map title')).toHaveCount(0);
  await expect.poll(canvasHeight).toBeLessThan(closedHeight);

  // Kept across reloads, and shown as checked in the View menu
  await page.reload();
  await openApp(page);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('menuitem', { name: 'View' }).click();
  const item = page.getByRole('menuitemcheckbox', { name: /Map Settings/ });
  await expect(item).toHaveAttribute('aria-checked', 'true');
  await item.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(canvasHeight).toBe(closedHeight);

  // The title bar opens it again
  await toggle.click();
  await expect(drawer.getByLabel('Map title')).toBeVisible();
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

  await page.getByLabel('Open map file').setInputFiles({
    name: 'far.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        ...map,
        levels: [
          {
            ...map.levels[0],
            layers: [{ ...map.levels[0].layers[0], rooms, water: {}, foliage: {}, doors: [], stairs: [], props: [], labels: [] }],
          },
        ],
      })
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

test('on a Mac, menus and the shortcuts dialog show ⌘ and ⌥', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
  await openApp(page);
  await page.getByRole('menuitem', { name: 'File' }).click();
  await expect(page.getByRole('menuitem', { name: /^New/ })).toContainText('⌥⌘N');
  await expect(page.getByRole('menuitem', { name: /^Save/ })).toContainText('⌘S');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveAttribute('title', 'Undo (⌘Z)');
  await expect(page.getByRole('button', { name: 'Redo' })).toHaveAttribute('title', 'Redo (⇧⌘Z)');

  await page.keyboard.press('?');
  const dialog = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  const row = (action: string) => dialog.locator('dt', { hasText: action }).locator('xpath=following-sibling::dd[1]');
  await expect(row('Preferences')).toHaveText('⌘,');
  await expect(row('Redo')).toHaveText('⇧⌘Z');
  await expect(row('Pan faster')).toHaveText('⇧ + arrows');
  await expect(row('Rectangle Room')).toHaveText('R');
  await expect(dialog).not.toContainText('On a Mac');
});
