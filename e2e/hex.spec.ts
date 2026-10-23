import { test, expect, type Page } from '@playwright/test';
import { openApp, gridPoint, saveMap, trackErrors } from './helpers';

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
});
