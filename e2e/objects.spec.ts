import { test, expect } from '@playwright/test';
import { openApp, gridPoint, clickCell, dragCells, saveMap } from './helpers';

test('doors snap to the nearest edge; archways are placeable', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('d');
  await page.getByRole('button', { name: 'archway' }).click();
  // Near the right edge of cell (2,-2)
  let p = await gridPoint(page, 2.9, -1.5);
  await page.mouse.click(p.x, p.y);
  await page.getByRole('button', { name: 'standard' }).click();
  // Near the bottom edge of cell (2,-2)
  p = await gridPoint(page, 2.5, -1.1);
  await page.mouse.click(p.x, p.y);

  const map = await saveMap(page);
  const placed = map.doors.slice(3).map(({ x, y, orientation, type }) => ({ x, y, orientation, type }));
  expect(placed).toEqual([
    { x: 3, y: -2, orientation: 'vertical', type: 'archway' },
    { x: 2, y: -1, orientation: 'horizontal', type: 'standard' },
  ]);
});

test('eraser removes stairs from any cell they cover', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('e');
  // Starter stairs are 2x1 at (0,-10); erase the right-hand cell
  await clickCell(page, 1, -10);
  expect((await saveMap(page)).stairs).toEqual([]);
});

test('select tool moves, rotates and deletes objects with undo', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('v');

  await dragCells(page, [9, 1], [8, 2]); // altar
  await page.keyboard.press('r');
  // Door d2 sits on the vertical edge x=6 of row 1; slide it down a row
  const a = await gridPoint(page, 6.05, 1.5);
  const b = await gridPoint(page, 6.05, 2.5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
  await clickCell(page, -3, 0); // pillar
  await page.keyboard.press('Delete');

  let map = await saveMap(page);
  expect(map.props.find((p) => p.id === 'p3')).toMatchObject({ x: 8, y: 2, rotation: 90 });
  expect(map.doors.find((d) => d.id === 'd2')).toMatchObject({ x: 6, y: 2 });
  expect(map.props.filter((p) => p.type === 'pillar')).toHaveLength(1);

  // Delete, door drag, rotate and altar drag are one undo step each
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  map = await saveMap(page);
  expect(map.props.filter((p) => p.type === 'pillar')).toHaveLength(2);
  expect(map.props.find((p) => p.id === 'p3')).toMatchObject({ x: 9, y: 1, rotation: 0 });
  expect(map.doors.find((d) => d.id === 'd2')).toMatchObject({ x: 6, y: 1 });
});

test('labels can be placed, typed, resized and dragged', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('l');
  await clickCell(page, -12, -5);
  // The text box takes focus right after the click
  await expect(page.getByPlaceholder('Label text')).toBeFocused();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Throne Room'); // letters that are also tool shortcuts
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'large' }).click();

  await page.keyboard.press('v');
  await dragCells(page, [-12, -5], [-12, -3]);

  const map = await saveMap(page);
  expect(map.labels.at(-1)).toMatchObject({ text: 'Throne Room', size: 30, x: -11.5, y: -2.5 });
});

test('room-number markers count up and can switch style', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('l');
  await page.getByRole('button', { name: 'circle', exact: true }).click();
  await clickCell(page, -12, -5);
  await clickCell(page, -10, -5);
  await page.getByRole('button', { name: 'box', exact: true }).click();
  await clickCell(page, -8, -5);
  // A select-tool click on a marker can restyle it
  await page.keyboard.press('v');
  await clickCell(page, -12, -5);
  await page.getByRole('button', { name: 'text style' }).click();

  const map = await saveMap(page);
  expect(map.labels.slice(2).map(({ text, style }) => ({ text, style }))).toEqual([
    { text: '1', style: 'text' },
    { text: '2', style: 'circle' },
    { text: '3', style: 'box' },
  ]);
});
