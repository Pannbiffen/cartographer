import { test, expect, type Page } from '@playwright/test';
import { openApp, saveMap, trackErrors } from './helpers';

async function setLook(page: Page) {
  await page.getByLabel('Map style').selectOption('blueprint');
  await page.getByLabel('Wall style').selectOption('rough');
  await page.getByLabel('Hatching', { exact: true }).selectOption('stipple');
  await page.getByLabel('Grid shape').selectOption('hex-flat');
}

async function savePreset(page: Page, name: string) {
  await page.getByLabel('Preset name').fill(name);
  await page.getByRole('region', { name: 'Map settings' }).getByRole('button', { name: 'Save' }).click();
}

test('a saved look can be applied to another map, undone, and survives a reload', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await setLook(page);
  await savePreset(page, 'Night plans');
  await expect(page.getByRole('status')).toHaveText('Saved “Night plans”');

  // Back to the defaults, then apply the preset: only the look changes
  await page.getByLabel('Map style').selectOption('parchment');
  await page.getByLabel('Wall style').selectOption('bold');
  await page.getByLabel('Hatching', { exact: true }).selectOption('dyson');
  await page.getByLabel('Grid shape').selectOption('square');
  await page.getByRole('button', { name: 'Night plans', exact: true }).click();
  let map = await saveMap(page);
  expect(map).toMatchObject({ theme: 'blueprint', wallStyle: 'rough', hatchStyle: 'stipple', gridType: 'hex-flat' });

  await page.keyboard.press('Control+z');
  map = await saveMap(page);
  expect(map).toMatchObject({ theme: 'parchment', wallStyle: 'bold', hatchStyle: 'dyson', gridType: 'square' });

  await page.reload();
  await openApp(page);
  await page.getByRole('button', { name: 'Night plans', exact: true }).click();
  expect((await saveMap(page)).theme).toBe('blueprint');
  expect(errors).toEqual([]);
});

test('saving under an existing name replaces that preset; presets can be deleted', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  await savePreset(page, 'Mine');
  await page.getByLabel('Map style').selectOption('slate');
  await savePreset(page, 'mine');
  await expect(page.getByRole('status')).toHaveText('Updated “mine”');
  const list = page.getByRole('list', { name: 'Saved style presets' });
  await expect(list.getByRole('listitem')).toHaveCount(1);

  await page.getByLabel('Map style').selectOption('parchment');
  await list.getByRole('button', { name: 'Mine', exact: true }).click();
  expect((await saveMap(page)).theme).toBe('slate');

  await page.getByRole('button', { name: 'Delete preset Mine' }).click();
  await expect(list).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Map settings' }).getByRole('button', { name: 'Download presets file' })).toBeDisabled();
});

test('presets export to a file and import from one', async ({ page }) => {
  const errors = trackErrors(page);
  await openApp(page, { mapSettings: true });
  await setLook(page);
  await savePreset(page, 'Shared look');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('region', { name: 'Map settings' }).getByRole('button', { name: 'Download presets file' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('style-presets.json');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(exported.presets).toEqual([
    expect.objectContaining({ name: 'Shared look', look: expect.objectContaining({ theme: 'blueprint', wallStyle: 'rough' }) }),
  ]);

  // A friend's file: one valid preset with a bad field, one nameless entry
  const friend = {
    kind: 'cartographer-style-presets',
    version: 1,
    presets: [{ name: 'Friend', look: { theme: 'slate', hatchLength: 999, wallStyle: 'wobbly' } }, { look: {} }],
  };
  await page.getByLabel('Import style presets').setInputFiles({
    name: 'friend.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(friend)),
  });
  await expect(page.getByRole('status')).toHaveText('Imported 1 preset');
  await page.getByRole('button', { name: 'Friend', exact: true }).click();
  expect(await saveMap(page)).toMatchObject({ theme: 'slate', hatchLength: 24, wallStyle: 'rough' });

  // Anything else is refused
  await page.getByLabel('Import style presets').setInputFiles({
    name: 'map.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"version":2}'),
  });
  await expect(page.getByRole('status')).toHaveText('That file has no style presets');
  await expect(page.getByRole('list', { name: 'Saved style presets' }).getByRole('listitem')).toHaveCount(2);
  expect(errors).toEqual([]);
});
