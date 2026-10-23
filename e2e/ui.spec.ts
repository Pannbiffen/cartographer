import { test, expect } from '@playwright/test';
import { openApp, newEmptyMap, cellCenter, dragCells, gridPoint, saveMap, view } from './helpers';

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
  await newEmptyMap(page, 'key');
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

test('the Levels and Layers sections fold from their headers', async ({ page }) => {
  await openApp(page);
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const layersHeader = panel.getByRole('button', { name: 'Layers' });
  await expect(layersHeader).toHaveAttribute('aria-expanded', 'true');

  await layersHeader.click();
  await expect(layersHeader).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('list', { name: 'Layers' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Levels' })).toBeVisible();

  // Kept across reloads
  await page.reload();
  await openApp(page);
  await expect(layersHeader).toHaveAttribute('aria-expanded', 'false');
  await expect(panel.getByRole('list', { name: 'Layers' })).toHaveCount(0);

  // Each folds on its own
  const levelsHeader = panel.getByRole('button', { name: 'Levels' });
  await levelsHeader.click();
  await expect(panel.getByRole('list', { name: 'Levels' })).toHaveCount(0);
  await layersHeader.click();
  await expect(panel.getByRole('list', { name: 'Layers' })).toBeVisible();
  await expect(levelsHeader).toHaveAttribute('aria-expanded', 'false');
});

test('the Levels and Layers sections can be hidden from their menus', async ({ page }) => {
  await openApp(page);
  const panel = page.getByRole('complementary', { name: 'Properties' });
  const menu = async (name: string) => {
    await page.getByRole('menubar').getByRole('menuitem', { name, exact: true }).click();
  };

  await menu('Layer');
  await page.getByRole('menuitemcheckbox', { name: 'Show Layers in Panel' }).click();
  await expect(panel.getByRole('heading', { name: 'Layers' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Layers' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Levels' })).toBeVisible();
  // The menu still works on the hidden section
  await menu('Layer');
  await page.getByRole('menuitem', { name: 'New Layer' }).click();
  expect((await saveMap(page)).levels[0].layers).toHaveLength(2);

  await menu('Level');
  await page.getByRole('menuitemcheckbox', { name: 'Show Levels in Panel' }).click();
  await expect(panel.getByRole('list', { name: 'Levels' })).toHaveCount(0);
  await menu('Level');
  await page.getByRole('menuitem', { name: 'New Level Above' }).click();
  expect((await saveMap(page)).levels).toHaveLength(2);
  await expect(page.getByTestId('current-level')).toHaveText('Level 2');

  // Kept across reloads; turned back on from the menu
  await page.reload();
  await openApp(page);
  await expect(panel.getByRole('list', { name: 'Layers' })).toHaveCount(0);
  await expect(panel.getByRole('list', { name: 'Levels' })).toHaveCount(0);
  await menu('Layer');
  const showLayers = page.getByRole('menuitemcheckbox', { name: 'Show Layers in Panel' });
  await expect(showLayers).toHaveAttribute('aria-checked', 'false');
  await showLayers.click();
  await expect(panel.getByRole('list', { name: 'Layers' })).toBeVisible();
  await menu('Level');
  await page.getByRole('menuitemcheckbox', { name: 'Show Levels in Panel' }).click();
  await expect(panel.getByRole('list', { name: 'Levels' })).toBeVisible();
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

test('right-clicking the map opens a menu for what is under the pointer', async ({ page }) => {
  await openApp(page);
  const altar = await cellCenter(page, 9, 1);
  const props = async () => (await saveMap(page)).levels[0].layers[0].props.filter((p) => p.id === 'p3' || p.id.startsWith('prop_'));

  // On an object: selects it (switching to the select tool) and offers its actions
  await page.mouse.click(altar.x, altar.y, { button: 'right' });
  const objectMenu = page.getByRole('menu', { name: 'Object' });
  await expect(objectMenu).toBeVisible();
  await expect(page.getByRole('button', { name: 'Select' })).toHaveAttribute('aria-pressed', 'true');
  await objectMenu.getByRole('menuitem', { name: 'Prop' }).hover();
  await page.getByRole('menuitemcheckbox', { name: 'Chest' }).click();
  await expect(objectMenu).toHaveCount(0);
  expect(await props()).toMatchObject([{ id: 'p3', type: 'chest' }]);

  await page.mouse.click(altar.x, altar.y, { button: 'right' });
  await objectMenu.getByRole('menuitem', { name: /^Copy/ }).click();

  // On empty map: Paste Here puts the copy where the menu was opened
  const spot = await cellCenter(page, 14, 3);
  await page.mouse.click(spot.x, spot.y, { button: 'right' });
  const mapMenu = page.getByRole('menu', { name: 'Map' });
  await mapMenu.getByRole('menuitem', { name: /Paste Here/ }).click();
  expect((await props()).map((p) => [p.type, p.x, p.y])).toEqual([['chest', 9, 1], ['chest', 14, 3]]);

  // Show Grid toggles; a click on the map only closes the menu
  const empty = await cellCenter(page, 14, -2);
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await mapMenu.getByRole('menuitemcheckbox', { name: /Show Grid/ }).click();
  expect((await saveMap(page)).showGrid).toBe(false);
  await page.keyboard.press('e');
  await page.mouse.click(empty.x, empty.y, { button: 'right' });
  await expect(mapMenu.getByRole('menuitem', { name: 'Brush Size' })).toBeVisible();
  await page.mouse.click(altar.x, altar.y);
  await expect(mapMenu).toHaveCount(0);
  expect((await props()).map((p) => [p.x, p.y])).toEqual([[9, 1], [14, 3]]);

  // Escape closes the menu but keeps the selection
  await page.keyboard.press('v');
  await page.mouse.click(altar.x, altar.y, { button: 'right' });
  await page.keyboard.press('Escape');
  await expect(objectMenu).toHaveCount(0);
  await expect(page.getByText('Selected: chest')).toBeVisible();

  // Shift+F10 opens it from the keyboard, at the selection; arrows move, Enter picks
  await page.keyboard.press('Shift+F10');
  await expect(objectMenu.getByRole('menuitem', { name: /^Rotate/ })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(objectMenu.getByRole('menuitem', { name: /^Duplicate/ })).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await props()).map((p) => [p.x, p.y])).toEqual([[9, 1], [14, 3], [10, 1]]);
  await expect(objectMenu).toHaveCount(0);
});

test('a long press opens the menu on a touch screen', async ({ page }) => {
  await openApp(page);
  const altar = await cellCenter(page, 9, 1);
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchEnd', points: { x: number; y: number }[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points });
  await touch('touchStart', [altar]);
  await page.waitForTimeout(700);
  await expect(page.getByRole('menu', { name: 'Object' })).toBeVisible();
  await touch('touchEnd', []);
  await expect(page.getByRole('menu', { name: 'Object' })).toBeVisible();
});

test('the toolbar can sit along the top, and the choice is kept', async ({ page }) => {
  await openApp(page);
  const tools = page.getByRole('toolbar', { name: 'Tools' });
  const canvas = page.locator('canvas');
  await expect(tools).toHaveAttribute('aria-orientation', 'vertical');
  let toolsBox = (await tools.boundingBox())!;
  let canvasBox = (await canvas.boundingBox())!;
  expect(toolsBox.x + toolsBox.width).toBeLessThanOrEqual(canvasBox.x + 1);
  const heightBefore = canvasBox.height;
  const widthBefore = canvasBox.width;

  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Toolbar on Top' }).click();
  await expect(tools).toHaveAttribute('aria-orientation', 'horizontal');
  toolsBox = (await tools.boundingBox())!;
  canvasBox = (await canvas.boundingBox())!;
  expect(toolsBox.y + toolsBox.height).toBeLessThanOrEqual(canvasBox.y + 1);
  // The canvas gives up height, not width
  expect(canvasBox.height).toBeLessThan(heightBefore);
  expect(canvasBox.width).toBeGreaterThan(widthBefore);

  // Tools still work from the row and from their keys
  await tools.getByRole('button', { name: 'Door' }).click();
  await expect(tools.getByRole('button', { name: 'Door' })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('r');
  await expect(tools.getByRole('button', { name: 'Rectangle Room' })).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await expect(tools).toHaveAttribute('aria-orientation', 'horizontal');

  // Back to the left from Preferences
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /Preferences/ }).click();
  const prefs = page.getByRole('dialog', { name: 'Preferences' });
  await prefs.getByRole('radiogroup', { name: 'Toolbar' }).getByRole('radio', { name: 'Left' }).click();
  await expect(tools).toHaveAttribute('aria-orientation', 'vertical');
});

test('a narrow window wraps the top toolbar instead of scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 700 });
  await openApp(page);
  await page.getByRole('menuitem', { name: 'View' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Toolbar on Top' }).click();
  const tools = page.getByRole('toolbar', { name: 'Tools' });
  const fits = await tools.evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);
  const first = (await tools.getByRole('button').first().boundingBox())!;
  const last = (await tools.getByRole('button').last().boundingBox())!;
  expect(last.y).toBeGreaterThan(first.y);
});
