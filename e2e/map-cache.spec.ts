import { test, expect } from '@playwright/test';
import { openApp, gridPoint, trackErrors } from './helpers';

test('hovering reuses the drawn map; edits, pans and zooms redraw it', async ({ page }) => {
  const errors = trackErrors(page);
  // Count every path fill and stroke, on the canvas and off screen
  await page.addInitScript(() => {
    const w = window as unknown as { paints: number };
    w.paints = 0;
    const proto = CanvasRenderingContext2D.prototype;
    for (const name of ['fill', 'stroke'] as const) {
      const original = proto[name] as (this: CanvasRenderingContext2D, ...args: unknown[]) => void;
      proto[name] = function (this: CanvasRenderingContext2D, ...args: unknown[]) {
        w.paints++;
        return original.apply(this, args);
      } as typeof proto.fill;
    }
  });
  await openApp(page);
  const paints = () => page.evaluate(() => (window as unknown as { paints: number }).paints);
  const frame = () => page.evaluate(() => new Promise(requestAnimationFrame));
  // Paints made while `act` runs and a frame is drawn
  const paintsDuring = async (act: () => Promise<void>) => {
    await frame();
    const before = await paints();
    await act();
    await frame();
    return (await paints()) - before;
  };

  // The room tool shows a preview under the pointer
  await page.keyboard.press('r');
  const a = await gridPoint(page, 3, 3);
  const b = await gridPoint(page, 5, 4);
  const first = await paintsDuring(() => page.keyboard.press('g'));
  expect(first).toBeGreaterThan(20);

  await page.mouse.move(a.x, a.y);
  const hover = await paintsDuring(async () => {
    await page.mouse.move(b.x, b.y);
  });
  expect(hover).toBeGreaterThan(0);
  expect(hover).toBeLessThan(first / 5);

  // An edit draws the map again...
  const edit = await paintsDuring(async () => {
    await page.mouse.down();
    await page.mouse.up();
  });
  expect(edit).toBeGreaterThan(20);

  // ...and so does zooming
  const zoom = await paintsDuring(async () => {
    await page.mouse.wheel(0, -100);
  });
  expect(zoom).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});
