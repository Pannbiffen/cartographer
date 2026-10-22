import { test, expect, type Page } from '@playwright/test';
import { openApp, openMapSettings, dragCells, saveMap, stats } from './helpers';

async function createLink(page: Page) {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: /Share Link/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Share Link' });
  const field = dialog.getByLabel('Share link');
  await expect(field).toHaveValue(/#map=1:/);
  return { dialog, link: await field.inputValue() };
}

test('a share link opens a copy of the map in another browser', async ({ page, browser, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openApp(page, { mapSettings: true });
  await dragCells(page, [7, 6], [10, 6]);
  await page.getByLabel('Map title').fill('Shared Crypt');
  await page.getByLabel('Map title').blur();
  const original = await saveMap(page);

  const { dialog, link } = await createLink(page);
  await dialog.getByRole('button', { name: 'Copy link' }).click();
  await expect(dialog.getByRole('button', { name: 'Copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  // Small maps make links short enough for any chat app
  expect(link.length).toBeLessThan(4000);

  // A friend with no autosave gets the map straight away
  const friend = await (await browser.newContext()).newPage();
  await friend.goto(link);
  await openMapSettings(friend);
  await expect(friend.getByLabel('Map title')).toHaveValue('Shared Crypt');
  expect(await stats(friend)).toEqual(await stats(page));
  // The link is cleared from the address bar so a reload keeps the friend's own edits
  expect(new URL(friend.url()).hash).toBe('');
  const opened = await saveMap(friend);
  expect(opened.layers).toEqual(original.layers);
  await friend.context().close();
});

test('opening a share link over unsaved work asks first', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  const { link } = await createLink(page);
  await page.keyboard.press('Escape');
  await page.getByLabel('Map title').fill('My own map');

  // Pasting the link into the open tab only changes the fragment
  await page.goto(link);
  const ask = page.getByRole('dialog', { name: 'Open shared map “The Sunken Crypt”?' });
  await ask.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('My own map');

  await page.goto(link);
  await ask.getByRole('button', { name: 'Don’t save' }).click();
  await expect(page.getByLabel('Map title')).toHaveValue('The Sunken Crypt');
});

test('a damaged share link says so and keeps the current map', async ({ page }) => {
  await openApp(page, { mapSettings: true });
  const message = new Promise<string>((resolve) =>
    page.once('dialog', (d) => {
      resolve(d.message());
      void d.dismiss();
    })
  );
  await page.goto('/#map=1:not-a-real-map');
  expect(await message).toContain('damaged or incomplete');
  await expect(page.getByLabel('Map title')).toHaveValue('The Sunken Crypt');
});
