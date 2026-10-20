import { test, expect } from '@playwright/test';
import { openApp, dragCells, stats, saveMap } from './helpers';

test('autosave restores the map after a reload', async ({ page }) => {
  await openApp(page);
  await dragCells(page, [-15, 8], [-5, 8]);
  await page.getByLabel('Map title').fill('My Test Map');
  await expect(page.getByText('Autosaved in this browser')).toBeVisible();

  await page.reload();
  await openApp(page);
  expect((await stats(page)).rooms).toBe(205);
  await expect(page.getByLabel('Map title')).toHaveValue('My Test Map');
});

test('exports WebP images and tiled PDFs', async ({ page }) => {
  await openApp(page);
  await page.getByRole('button', { name: 'Export' }).click();

  await page.locator('select').filter({ hasText: 'PNG (lossless)' }).selectOption('webp');
  const [image] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download WEBP/ }).click(),
  ]);
  expect(image.suggestedFilename()).toBe('the_sunken_crypt.webp');

  const [pdf] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /True scale/ }).click(),
  ]);
  const chunks: Buffer[] = [];
  for await (const c of await pdf.createReadStream()) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString('latin1');
  // 24 x 19 squares with 1-inch cells on A4 portrait (7 x 10 per page) = 4 x 2 pages
  expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(8);
});

test('project files round-trip and old files without labels still load', async ({ page }) => {
  await openApp(page);
  const map = await saveMap(page);
  const { labels: _labels, ...legacy } = map;

  await page.locator('input[type=file]').setInputFiles({
    name: 'old.dndmap',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ ...legacy, title: 'Legacy Map' })),
  });
  await expect(page.getByLabel('Map title')).toHaveValue('Legacy Map');
  expect((await saveMap(page)).labels).toEqual([]);
});
