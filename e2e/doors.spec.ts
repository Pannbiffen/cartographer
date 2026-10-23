import { test, expect, type Page } from '@playwright/test';
import { openApp, clickCell, downloadText, dragCells, gridPoint, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty

async function clickAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

async function doors(page: Page) {
  return (await saveMap(page)).levels[0].layers[0].doors;
}

/** A triangle room whose long wall runs diagonally from (-9, -7) to (-14, -2), along x + y = -16 */
async function triangle(page: Page) {
  await page.keyboard.press('n');
  for (const [x, y] of [[-14, -7], [-9, -7], [-14, -2], [-14, -7]]) await clickAt(page, x, y);
}

test('doors snap to a diagonal wall and turn with it, elsewhere to cell edges', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  const before = (await doors(page)).length;
  await triangle(page);
  await page.keyboard.press('d');
  await clickAt(page, -11.4, -4.7);
  // Inside the room, away from the diagonal, a door still takes a cell edge
  await clickAt(page, -12.5, -6.05);

  let placed = (await doors(page)).slice(before);
  expect(placed).toHaveLength(2);
  const [angled, square] = placed;
  expect(angled.angle).toBeCloseTo(135, 5);
  // Centred on the wall, under the pointer
  expect(angled.x + angled.y).toBeCloseTo(-16, 3);
  expect(angled.x).toBeCloseTo(-11.35, 2);
  expect(square).toMatchObject({ x: -13, y: -6, orientation: 'horizontal' });
  expect(square.angle).toBeUndefined();

  // Placing on the same stretch of wall replaces the door there
  await page.getByRole('button', { name: 'secret' }).click();
  await clickAt(page, -11.3, -4.6);
  placed = (await doors(page)).slice(before);
  expect(placed).toHaveLength(2);
  expect(placed[1]).toMatchObject({ type: 'secret' });
  expect(placed[1].angle).toBeCloseTo(135, 5);

  // Selected, it rotates a quarter turn, and dragged it follows the wall back round
  await page.keyboard.press('v');
  await clickAt(page, -11.3, -4.7);
  await expect(page.getByText('Selected: secret door')).toBeVisible();
  await page.keyboard.press('r');
  expect((await doors(page)).at(-1)!.angle).toBeCloseTo(45, 5);
  const from = await gridPoint(page, -11.3, -4.7);
  const to = await gridPoint(page, -10.1, -5.95);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  const dragged = (await doors(page)).at(-1)!;
  expect(dragged.angle).toBeCloseTo(135, 5);
  expect(dragged.x + dragged.y).toBeCloseTo(-16, 3);
  expect(dragged.x).toBeCloseTo(-10.05, 1);

  // The drag and the turn are one undo step each
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  const restored = (await doors(page)).at(-1)!;
  expect(restored.x).toBeCloseTo(-11.35, 2);
  expect(restored.angle).toBeCloseTo(135, 5);
  expect(errors).toEqual([]);
});

test('a door on a diagonal wall exports as a VTT portal along it', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await triangle(page);
  await page.keyboard.press('d');
  await clickAt(page, -11.5, -4.5);

  await page.keyboard.press('Control+e');
  const vtt = JSON.parse(await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click()));
  const turned = vtt.portals.filter((p: { rotation: number }) => Math.abs(p.rotation) > 0.1 && Math.abs(p.rotation - Math.PI / 2) > 0.1);
  expect(turned).toHaveLength(1);
  const [a, b] = turned[0].bounds;
  // Along the wall's direction, 0.8 of a cell long, centred on the door
  expect(Math.abs(b.x - a.x)).toBeCloseTo(0.8 / Math.SQRT2, 3);
  expect(b.y - a.y).toBeCloseTo(-(b.x - a.x), 3);
  expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeCloseTo(0.8, 3);
  expect(turned[0].rotation).toBeCloseTo((135 * Math.PI) / 180, 3);
  expect(errors).toEqual([]);
});

test('the fill tool stops at a door in a curved wall', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  // A circle room centred on (-12, -4), radius 2, with a door on its wall up and to the right
  await page.keyboard.press('c');
  const centre = await gridPoint(page, -12, -4);
  const edge = await gridPoint(page, -12, -2);
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.down();
  await page.mouse.move(edge.x, edge.y, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('d');
  await clickAt(page, -10.58, -5.42);
  const door = (await doors(page)).at(-1)!;
  expect(door.angle).toBeCloseTo(45, -1);

  // A room through the doorway, over the circle's wall where the door stands
  await page.keyboard.press('r');
  await dragCells(page, [-11, -6], [-9, -6]);
  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'planks' }).click();
  await clickCell(page, -12, -4);

  const layer = (await saveMap(page)).levels[0].layers[0];
  const planks = layer.floorAreas.planks!;
  expect(planks).toHaveLength(1);
  // The circle, but nothing past the door
  const xs = planks[0][0].map(([x]) => x);
  expect(Math.min(...xs)).toBeCloseTo(-14, 1);
  // The circle reaches x = -10; the room past the door reaches -8
  expect(Math.max(...xs)).toBeLessThanOrEqual(-10 + 1e-6);
  expect(layer.floors['-10,-6']).toBeUndefined();
  expect(layer.floors['-9,-6']).toBeUndefined();

  // Filling beyond the door leaves the circle as it was
  await page.getByRole('button', { name: 'tiles' }).click();
  await clickCell(page, -9, -6);
  const after = (await saveMap(page)).levels[0].layers[0];
  const keptXs = after.floorAreas.planks!.flat(2).map(([x]) => x);
  expect(Math.min(...keptXs)).toBeCloseTo(Math.min(...xs), 5);
  expect(Math.max(...keptXs)).toBeCloseTo(Math.max(...xs), 5);
  expect(after.floors['-9,-6']).toBe('tiles');
  expect(errors).toEqual([]);
});

test('on a hex grid, a door on a thin wall sits at its middle and opens it', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('a');
  const a = await gridPoint(page, -14, -5);
  const b = await gridPoint(page, -10, -5);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  const wall = (await saveMap(page)).levels[0].layers[0].walls[2];
  const [mx, my] = [wall.x + wall.dx / 2, wall.y + wall.dy / 2];

  await page.keyboard.press('d');
  await clickAt(page, mx + 0.05, my + 0.05);
  const door = (await doors(page)).at(-1)!;
  expect(door.x).toBeCloseTo(mx, 3);
  expect(door.y).toBeCloseTo(my, 3);
  expect(door.angle).toBeCloseTo(((((Math.atan2(wall.dy, wall.dx) * 180) / Math.PI) % 180) + 180) % 180, 1);
  // As long as the hex side, not a whole cell
  expect(door.length).toBeCloseTo(Math.hypot(wall.dx, wall.dy), 3);

  // The wall under the door no longer blocks: one wall fewer in the VTT export
  await page.keyboard.press('Control+e');
  const withDoor = JSON.parse(await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click()));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+e');
  const without = JSON.parse(await downloadText(page, () => page.getByRole('button', { name: 'Download .dd2vtt' }).click()));
  expect(withDoor.line_of_sight.length).toBe(without.line_of_sight.length - 1);
  expect(errors).toEqual([]);
});
