import { test, expect, type Page } from '@playwright/test';
import { openApp, openDarkHall, gridPoint, rgbAt, saveMap, trackErrors } from './helpers';

// The starter map leaves the block x -15..-8, y -8..0 empty. On a pointy hex
// grid hex (q, r) is centred at (q + r / 2 + 0.5, r * √3/2 + 0.5).
const ROW = Math.sqrt(3) / 2;
const HEX_AREA = Math.sqrt(3) / 2;
const centre = (q: number, r: number): [number, number] => [q + r / 2 + 0.5, r * ROW + 0.5];

async function clickAt(page: Page, gx: number, gy: number) {
  const p = await gridPoint(page, gx, gy);
  await page.mouse.click(p.x, p.y);
}

async function dragFrom(page: Page, from: [number, number], to: [number, number]) {
  const a = await gridPoint(page, ...from);
  const b = await gridPoint(page, ...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
}

async function topLayer(page: Page) {
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

async function hexMap(page: Page) {
  await openApp(page, { mapSettings: true });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
}

/** Whether (x, y) is the middle of a pointy hex */
function isHexCentre(x: number, y: number) {
  const r = (y - 0.5) / ROW;
  const q = x - 0.5 - Math.round(r) / 2;
  return Math.abs(r - Math.round(r)) < 1e-4 && Math.abs(q - Math.round(q)) < 1e-4;
}

async function brightnessAt(page: Page, gx: number, gy: number) {
  const { r, g, b } = await rgbAt(page, gx, gy);
  return (r + g + b) / 3;
}

function area(polygons: [number, number][][][]): number {
  let total = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, i) => {
      let sum = 0;
      for (let k = 0; k < ring.length - 1; k++) sum += ring[k][0] * ring[k + 1][1] - ring[k + 1][0] * ring[k][1];
      total += (i === 0 ? 1 : -1) * Math.abs(sum / 2);
    });
  }
  return total;
}

test('on a hex grid the rectangle tool lays the hexes between the two it was dragged across', async ({ page }) => {
  const errors = trackErrors(page);
  await hexMap(page);
  await page.keyboard.press('r');
  // Rows -6 to -4, from x -13.5 to -11.5: 3 + 2 + 3 hexes
  await dragFrom(page, centre(-11, -6), centre(-10, -4));
  const layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(1);
  expect(area(layer.shapes)).toBeCloseTo(8 * HEX_AREA, 4);
  expect(errors).toEqual([]);
});

test('on a hex grid the tunnel tool lays a corridor of whole hexes', async ({ page }) => {
  await hexMap(page);
  await page.keyboard.press('t');
  await dragFrom(page, centre(-12, -4), centre(-9, -4));
  const layer = await topLayer(page);
  expect(layer.shapes).toHaveLength(1);
  expect(area(layer.shapes)).toBeCloseTo(4 * HEX_AREA, 4);
});

test('on a hex grid water floods whole hexes and plants sit in their middles', async ({ page }) => {
  await hexMap(page);
  const before = Object.keys((await topLayer(page)).foliage);
  const [cx, cy] = centre(-10, -4);
  await page.keyboard.press('w');
  await clickAt(page, cx + 0.3, cy + 0.2);
  await page.keyboard.press('f');
  await clickAt(page, cx + 0.3, cy + 0.2);
  const layer = await topLayer(page);
  expect(area(layer.waterAreas)).toBeCloseTo(HEX_AREA, 4);
  const plants = Object.keys(layer.foliage)
    .filter((key) => !before.includes(key))
    .map((key) => key.split(',').map(Number));
  expect(plants).toHaveLength(1);
  expect(plants[0][0] + 0.5).toBeCloseTo(cx, 5);
  expect(plants[0][1] + 0.5).toBeCloseTo(cy, 5);

  // The eraser takes both away with the hex
  await page.keyboard.press('e');
  await clickAt(page, cx, cy);
  const after = await topLayer(page);
  expect(after.waterAreas).toEqual([]);
  expect(Object.keys(after.foliage)).toEqual(before);
});

test('on a hex grid props go in the middle of a hex and move from hex to hex', async ({ page }) => {
  const errors = trackErrors(page);
  await hexMap(page);
  const [cx, cy] = centre(-10, -4);
  await page.keyboard.press('p');
  await clickAt(page, cx + 0.3, cy - 0.2);
  let prop = (await topLayer(page)).props.at(-1)!;
  expect(prop.x + 0.5).toBeCloseTo(cx, 5);
  expect(prop.y + 0.5).toBeCloseTo(cy, 5);

  // Dragged two rows down, a little off the middle, it lands in that hex's middle
  await page.keyboard.press('v');
  const [tx, ty] = centre(-11, -2);
  await dragFrom(page, [cx + 0.1, cy], [tx + 0.3, ty + 0.1]);
  prop = (await topLayer(page)).props.at(-1)!;
  expect(prop.x + 0.5).toBeCloseTo(tx, 5);
  expect(prop.y + 0.5).toBeCloseTo(ty, 5);

  // Two steps up zigzag through the row between and end straight above
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  prop = (await topLayer(page)).props.at(-1)!;
  expect(prop.x + 0.5).toBeCloseTo(tx, 5);
  expect(prop.y + 0.5).toBeCloseTo(ty - 2 * ROW, 5);
  await page.keyboard.press('ArrowRight');
  prop = (await topLayer(page)).props.at(-1)!;
  expect(prop.x + 0.5).toBeCloseTo(tx + 1, 5);

  // Stairs and lights snap the same way
  const [sx, sy] = centre(-12, -6);
  await page.keyboard.press('s');
  await clickAt(page, sx - 0.3, sy + 0.2);
  await page.keyboard.press('i');
  await clickAt(page, ...centre(-9, -6));
  const layer = await topLayer(page);
  expect(layer.stairs.at(-1)!.x + 0.5).toBeCloseTo(sx, 5);
  expect(layer.stairs.at(-1)!.y + 0.5).toBeCloseTo(sy, 5);
  expect(layer.lights.at(-1)!.x + 0.5).toBeCloseTo(centre(-9, -6)[0], 5);
  expect(errors).toEqual([]);
});

test('on a hex grid the fill tool stops at walls on hex sides', async ({ page }) => {
  const errors = trackErrors(page);
  await hexMap(page);
  // A row of four hexes, x -13.5 to -10.5
  await page.keyboard.press('t');
  await dragFrom(page, centre(-12, -4), centre(-9, -4));
  // A wall along the side between the second and third, at x = -12
  const [, y] = centre(-10, -4);
  await page.keyboard.press('a');
  await dragFrom(page, [-12, y - 0.5 / Math.sqrt(3)], [-12, y + 0.5 / Math.sqrt(3)]);
  expect((await topLayer(page)).walls).toHaveLength(1);

  await page.keyboard.press('k');
  await page.getByRole('button', { name: 'tiles' }).click();
  await clickAt(page, ...centre(-12, -4));
  const layer = await topLayer(page);
  expect(area(layer.floorAreas.tiles!)).toBeCloseTo(2 * HEX_AREA, 4);
  expect(errors).toEqual([]);
});

test('on a hex grid a door on a room side sits in its middle, a hex side long', async ({ page }) => {
  await hexMap(page);
  const [cx, cy] = centre(-10, -4);
  await page.keyboard.press('b');
  await clickAt(page, cx, cy);
  // The hex's right side runs along the grid line x = -11
  await page.keyboard.press('d');
  await clickAt(page, cx + 0.45, cy + 0.12);
  const door = (await topLayer(page)).doors.at(-1)!;
  expect(door.x).toBeCloseTo(cx + 0.5, 3);
  expect(door.y).toBeCloseTo(cy, 3);
  expect(door.angle).toBeCloseTo(90, 1);
  expect(door.length).toBeCloseTo(1 / Math.sqrt(3), 3);

  // Away from any wall a window goes on the nearest hex side all the same
  const [ox, oy] = centre(-10, -6);
  await page.keyboard.press('j');
  await clickAt(page, ox + 0.4, oy + 0.05);
  const pane = (await topLayer(page)).windows.at(-1)!;
  expect(pane.x).toBeCloseTo(ox + 0.5, 3);
  expect(pane.y).toBeCloseTo(oy, 3);
  expect(pane.length).toBeCloseTo(1 / Math.sqrt(3), 3);
});

test('on a hex grid a window sits in the middle of a hex wall and lets light through it', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  // A dark hall lit from (2.5, 2.5), split by a wall along hex sides
  await openDarkHall(page, { walls: [], lights: [{ id: 'l1', x: 2, y: 2, color: '#ffe2a8', radius: 8, intensity: 1 }] });
  await page.getByLabel('Grid shape').selectOption('hex-pointy');
  await page.keyboard.press('a');
  await dragFrom(page, [5, -1], [5, 6]);
  const walls = (await topLayer(page)).walls;
  // The side the light faces most squarely, near the middle of the hall
  const wall = walls
    .filter((w) => Math.abs(w.dx) < 1e-6)
    .sort((a, b) => Math.abs(a.y + a.dy / 2 - 2.5) - Math.abs(b.y + b.dy / 2 - 2.5))[0];
  const [mx, my] = [wall.x, wall.y + wall.dy / 2];
  // Just beyond the wall, straight on from the light
  const beyond: [number, number] = [mx + 0.8, my + ((my - 2.5) / (mx - 2.5)) * 0.8];
  const dark = await brightnessAt(page, ...beyond);

  await page.keyboard.press('j');
  await clickAt(page, mx + 0.05, my + 0.1);
  const pane = (await topLayer(page)).windows.at(-1)!;
  expect(pane.x).toBeCloseTo(mx, 3);
  expect(pane.y).toBeCloseTo(my, 3);
  expect(pane.angle).toBeCloseTo(90, 1);
  expect(pane.length).toBeCloseTo(1 / Math.sqrt(3), 3);
  await expect.poll(() => brightnessAt(page, ...beyond)).toBeGreaterThan(dark + 10);
  expect(errors).toEqual([]);
});

test('on a hex grid pasted props land in whole hexes, singly or as a group', async ({ page }) => {
  const errors = trackErrors(page);
  await hexMap(page);
  await page.keyboard.press('p');
  await clickAt(page, ...centre(-10, -6));
  await clickAt(page, ...centre(-10, -4));
  const before = (await topLayer(page)).props.length;

  // One prop pasted at the pointer goes into the hex under it
  await page.keyboard.press('v');
  await clickAt(page, ...centre(-10, -6));
  await page.keyboard.press('Control+c');
  const [tx, ty] = centre(-12, -2);
  const target = await gridPoint(page, tx + 0.3, ty - 0.2);
  await page.mouse.move(target.x, target.y);
  await page.keyboard.press('Control+v');
  let props = (await topLayer(page)).props;
  expect(props).toHaveLength(before + 1);
  expect(props.at(-1)!.x + 0.5).toBeCloseTo(tx, 5);
  expect(props.at(-1)!.y + 0.5).toBeCloseTo(ty, 5);

  // Both, duplicated as a group, keep their layout a hex to the right
  await clickAt(page, ...centre(-10, -6));
  await page.keyboard.down('Shift');
  await clickAt(page, ...centre(-10, -4));
  await page.keyboard.up('Shift');
  await page.keyboard.press('Control+d');
  props = (await topLayer(page)).props;
  expect(props).toHaveLength(before + 3);
  const copies = props.slice(-2);
  for (const p of copies) expect(isHexCentre(p.x + 0.5, p.y + 0.5)).toBe(true);
  expect(copies.map((p) => p.x + 0.5)).toEqual([expect.closeTo(centre(-10, -6)[0] + 1, 5), expect.closeTo(centre(-10, -4)[0] + 1, 5)]);
  expect(errors).toEqual([]);
});
