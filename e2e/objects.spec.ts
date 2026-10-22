import { test, expect } from '@playwright/test';
import { openApp, gridPoint, clickCell, dragCells, saveMap, view } from './helpers';

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
  const placed = map.levels[0].layers[0].doors.slice(3).map(({ x, y, orientation, type }) => ({ x, y, orientation, type }));
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
  expect((await saveMap(page)).levels[0].layers[0].stairs).toEqual([]);
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
  expect(map.levels[0].layers[0].props.find((p) => p.id === 'p3')).toMatchObject({ x: 8, y: 2, rotation: 90 });
  expect(map.levels[0].layers[0].doors.find((d) => d.id === 'd2')).toMatchObject({ x: 6, y: 2 });
  expect(map.levels[0].layers[0].props.filter((p) => p.type === 'pillar')).toHaveLength(1);

  // Delete, door drag, rotate and altar drag are one undo step each
  for (let i = 0; i < 4; i++) await page.keyboard.press('Control+z');
  map = await saveMap(page);
  expect(map.levels[0].layers[0].props.filter((p) => p.type === 'pillar')).toHaveLength(2);
  expect(map.levels[0].layers[0].props.find((p) => p.id === 'p3')).toMatchObject({ x: 9, y: 1, rotation: 0 });
  expect(map.levels[0].layers[0].doors.find((d) => d.id === 'd2')).toMatchObject({ x: 6, y: 1 });
});

test('arrow keys nudge the selected object instead of panning', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('v');
  await clickCell(page, 9, 1); // altar
  const before = await view(page);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  expect(await view(page)).toEqual(before);

  let map = await saveMap(page);
  // Grid-snapped objects move a whole cell either way
  expect(map.levels[0].layers[0].props.find((p) => p.id === 'p3')).toMatchObject({ x: 10, y: 2 });
  await page.keyboard.press('Control+z');
  map = await saveMap(page);
  expect(map.levels[0].layers[0].props.find((p) => p.id === 'p3')).toMatchObject({ x: 10, y: 1 });

  // Labels move half a cell, a whole one with Shift
  await page.keyboard.press('l');
  await clickCell(page, -12, -5);
  await page.keyboard.press('Enter');
  await page.keyboard.press('v');
  await clickCell(page, -12, -5);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowUp');
  map = await saveMap(page);
  // Placed at the clicked cell's centre, (-11.5, -4.5)
  const label = map.levels[0].layers[0].labels.at(-1)!;
  expect(label.x).toBeCloseTo(-12);
  expect(label.y).toBeCloseTo(-5.5);

  // Escape closes an open dialog first and keeps the selection...
  await page.keyboard.press('?');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  map = await saveMap(page);
  expect(map.levels[0].layers[0].labels.at(-1)!.x).toBeCloseTo(-11.5);

  // ...then clears it, and with nothing selected the arrows pan again
  await page.keyboard.press('Escape');
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(150);
  await page.keyboard.up('ArrowRight');
  expect((await view(page)).x).not.toEqual(before.x);
});

test('duplicate, copy and paste objects', async ({ page }) => {
  await openApp(page);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByRole('menuitem', { name: /^Paste/ })).toBeDisabled();
  await page.keyboard.press('Escape');

  // Ctrl+D copies the altar one cell to the right and selects the copy
  await page.keyboard.press('v');
  await clickCell(page, 9, 1);
  await page.keyboard.press('Control+d');
  await page.keyboard.press('ArrowDown');
  let map = await saveMap(page);
  const altar = map.levels[0].layers[0].props.find((p) => p.id === 'p3')!;
  const copies = () => map.levels[0].layers.flatMap((l) => l.props).filter((p) => p.type === altar.type && p.id !== 'p3');
  expect(altar).toMatchObject({ x: 9, y: 1 });
  expect(copies()).toMatchObject([{ x: 10, y: 2, rotation: altar.rotation }]);

  // Each paste steps on from the last one; Edit > Paste lands on the active layer
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await page.getByRole('menuitem', { name: 'Layer' }).click();
  await page.getByRole('menuitem', { name: 'New Layer' }).click();
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await page.getByRole('menuitem', { name: /^Paste/ }).click();
  map = await saveMap(page);
  expect(copies().map((p) => [p.x, p.y])).toEqual([[10, 2], [11, 2], [12, 2]]);
  expect(map.levels[0].layers.at(-1)!.props).toMatchObject([{ x: 12, y: 2 }]);

  // Doors are copied along their wall; the copy is one undo step
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const door = await gridPoint(page, 6.05, 1.5);
  await page.mouse.click(door.x, door.y);
  await page.keyboard.press('Control+d');
  map = await saveMap(page);
  const d2 = map.levels[0].layers[0].doors.find((d) => d.id === 'd2')!;
  expect(map.levels[0].layers[0].doors.filter((d) => d.x === d2.x && d.orientation === d2.orientation && d.y === 2)).toHaveLength(1);
  await page.keyboard.press('Control+z');
  expect((await saveMap(page)).levels[0].layers[0].doors).toHaveLength(map.levels[0].layers[0].doors.length - 1);
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
  expect(map.levels[0].layers[0].labels.at(-1)).toMatchObject({ text: 'Throne Room', size: 30, x: -11.5, y: -2.5 });
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
  expect(map.levels[0].layers[0].labels.slice(2).map(({ text, style }) => ({ text, style }))).toEqual([
    { text: '1', style: 'text' },
    { text: '2', style: 'circle' },
    { text: '3', style: 'box' },
  ]);
});
