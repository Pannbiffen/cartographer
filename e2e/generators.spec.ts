import { test, expect, type Page } from '@playwright/test';
import { openApp, newEmptyMap, saveMap, trackErrors } from './helpers';

async function openGenerator(page: Page, name: 'Generate Dungeon' | 'Generate Cave') {
  await page.getByRole('menuitem', { name: 'Tools' }).click();
  await page.getByRole('menuitem', { name: new RegExp(`^${name}`) }).click();
  return page.getByRole('region', { name });
}

async function topLayer(page: Page) {
  // Out of the seed field, so the shortcut saves
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const map = await saveMap(page);
  return map.levels[0].layers[map.levels[0].layers.length - 1];
}

test('the dungeon generator gives the same layout for a seed, with doors, props and stairs', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  const before = await topLayer(page);

  const panel = await openGenerator(page, 'Generate Dungeon');
  await expect(panel).toBeVisible();
  await panel.getByRole('spinbutton', { name: 'Seed' }).fill('42');

  // The starter map has content, so the first Generate asks
  const asked: string[] = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    void d.accept();
  });
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  expect(asked).toHaveLength(1);
  const first = await topLayer(page);

  // Generating again in the same session doesn't ask, and gives the same layout
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  expect(asked).toHaveLength(1);
  const second = await topLayer(page);
  expect(second).toEqual(first);

  expect(Object.keys(first.rooms).length).toBeGreaterThan(50);
  expect(first.doors.length).toBeGreaterThan(0);
  expect(first.props.length).toBeGreaterThan(0);
  expect(first.stairs).toHaveLength(1);
  expect(first.labels).toHaveLength(0);
  // Every door sits on an edge with floor on both sides, and stairs and props on floor
  for (const d of first.doors) {
    const other = d.orientation === 'horizontal' ? `${d.x},${d.y - 1}` : `${d.x - 1},${d.y}`;
    expect(first.rooms[`${d.x},${d.y}`] && first.rooms[other]).toBe(true);
  }
  for (const p of first.props) expect(first.rooms[`${p.x},${p.y}`]).toBe(true);
  const s = first.stairs[0];
  for (let i = 0; i < s.width; i++) for (let j = 0; j < s.height; j++) expect(first.rooms[`${s.x + i},${s.y + j}`]).toBe(true);

  // Fewer rooms give another layout
  await panel.getByRole('slider', { name: /^Rooms/ }).fill('3');
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  const fewer = await topLayer(page);
  expect(fewer.rooms).not.toEqual(first.rooms);

  // Doors, props and stairs can each be left out
  await panel.getByRole('checkbox', { name: /^Doors/ }).uncheck();
  await panel.getByRole('checkbox', { name: 'Props' }).uncheck();
  await panel.getByRole('checkbox', { name: 'Entrance stairs' }).uncheck();
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  const bare = await topLayer(page);
  expect(bare.rooms).toEqual(fewer.rooms);
  expect([bare.doors, bare.props, bare.stairs]).toEqual([[], [], []]);

  // Reroll picks a new seed
  await panel.getByRole('button', { name: 'Reroll' }).click();
  await expect(panel.getByRole('spinbutton', { name: 'Seed' })).not.toHaveValue('42');

  // All the layouts tried were one undo step
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Control+z');
  expect(await topLayer(page)).toEqual(before);

  // Picking a tool closes the generator
  await openGenerator(page, 'Generate Dungeon');
  await page.keyboard.press('v');
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});

test('declining to replace the layer keeps it', async ({ page }) => {
  await openApp(page);
  const before = await topLayer(page);
  const panel = await openGenerator(page, 'Generate Dungeon');
  page.on('dialog', (d) => void d.dismiss());
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  expect(await topLayer(page)).toEqual(before);
});

test('the cave generator lays caves with pools and rocks, dropping small pockets', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page);
  await newEmptyMap(page);
  const asked: string[] = [];
  page.on('dialog', (d) => {
    asked.push(d.message());
    void d.accept();
  });

  const panel = await openGenerator(page, 'Generate Cave');
  await panel.getByRole('spinbutton', { name: 'Seed' }).fill('7');
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  // An empty layer is replaced without asking
  expect(asked).toEqual([]);
  const cave = await topLayer(page);
  const floor = Object.keys(cave.rooms);
  expect(floor.length).toBeGreaterThan(100);
  expect(Object.keys(cave.water).length).toBeGreaterThan(0);
  for (const k of Object.keys(cave.water)) expect(cave.rooms[k]).toBe(true);
  const rocks = Object.entries(cave.foliage);
  expect(rocks.length).toBeGreaterThan(0);
  for (const [k, f] of rocks) {
    expect(f.type).toBe('rock');
    expect(cave.rooms[k]).toBe(true);
  }

  // No cave is smaller than the minimum size
  const minimum = Number(await panel.getByRole('slider', { name: /^Smallest cave/ }).inputValue());
  const seen = new Set<string>();
  for (const start of floor) {
    if (seen.has(start)) continue;
    const queue = [start];
    seen.add(start);
    for (let i = 0; i < queue.length; i++) {
      const [x, y] = queue[i].split(',').map(Number);
      for (const n of [`${x + 1},${y}`, `${x - 1},${y}`, `${x},${y + 1}`, `${x},${y - 1}`]) {
        if (cave.rooms[n] && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    expect(queue.length).toBeGreaterThanOrEqual(minimum);
  }

  // Without pools or rocks
  await panel.getByRole('checkbox', { name: 'Pools' }).uncheck();
  await panel.getByRole('checkbox', { name: 'Rocks' }).uncheck();
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();
  const plain = await topLayer(page);
  expect(plain.rooms).toEqual(cave.rooms);
  expect([plain.water, plain.foliage]).toEqual([{}, {}]);

  await panel.getByRole('button', { name: 'Close generator' }).click();
  await expect(panel).toBeHidden();
  expect(errors).toEqual([]);
});
