// Repeating patterns drawn once per zoom into a cached tile and filled from it
// as a CanvasPattern (#59): floor textures and wall hatching. A pattern must
// repeat exactly every `period` world units for its tile to join up.

// Tiles wider than this aren't made: zoomed in that far, few cells are in view
// and drawing them directly costs no more than a huge tile
export const MAX_TILE = 2048;
// Pixels kept in cached tiles (4 bytes each), enough for a few of the largest
const MAX_CACHED_PIXELS = 16e6;
// Tiles by key and size in pixels, most recently used last
const tileCache = new Map<string, HTMLCanvasElement>();
let cachedPixels = 0;

/**
 * One `period` (in world units) of a pattern, drawn by `draw` in world
 * coordinates at the canvas's scale, as a pattern that fills in world
 * coordinates. Its pixels land on whole canvas pixels, so draw with image
 * smoothing off: smoothed across a fraction of a pixel, fine lines would blur.
 * Null when the canvas is rotated, or when the tile would be wider than
 * MAX_TILE and `fit` isn't set; with `fit` such a tile is drawn at MAX_TILE
 * and stretched.
 */
export function tilePattern(
  ctx: CanvasRenderingContext2D,
  key: string,
  period: number,
  draw: (tileCtx: CanvasRenderingContext2D) => void,
  { fit = false } = {}
): CanvasPattern | null {
  const t = ctx.getTransform();
  // Patterns are only ever drawn unrotated
  if (t.b !== 0 || t.c !== 0) return null;
  let size = Math.max(1, Math.round(period * Math.abs(t.a)));
  if (size > MAX_TILE) {
    if (!fit) return null;
    size = MAX_TILE;
  }
  const cacheKey = `${key}|${size}`;
  let canvas = tileCache.get(cacheKey);
  if (canvas) {
    tileCache.delete(cacheKey);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const tctx = canvas.getContext('2d');
    if (!tctx) return null;
    const scale = size / period;
    tctx.setTransform(scale, 0, 0, scale, 0, 0);
    draw(tctx);
    cachedPixels += size * size;
    for (const [oldKey, old] of tileCache) {
      if (cachedPixels <= MAX_CACHED_PIXELS) break;
      tileCache.delete(oldKey);
      cachedPixels -= old.width * old.height;
    }
  }
  tileCache.set(cacheKey, canvas);

  const pattern = ctx.createPattern(canvas, 'repeat');
  if (!pattern) return null;
  // Tile pixels in world units, shifted so they land on whole canvas pixels
  const shiftX = (Math.round(t.e) - t.e) / t.a;
  const shiftY = (Math.round(t.f) - t.f) / t.d;
  pattern.setTransform(new DOMMatrix().translate(shiftX, shiftY).scale(period / size));
  return pattern;
}

/** `n` wrapped into 0..m-1: random numbers keyed by it repeat every m steps, as a tile does */
export const wrap = (n: number, m: number) => ((n % m) + m) % m;

/** The world area the canvas shows (a whole export, or the view on screen), from its transform */
export function viewRect(ctx: CanvasRenderingContext2D) {
  const inverse = ctx.getTransform().inverse();
  const { width, height } = ctx.canvas;
  const corners = [
    inverse.transformPoint({ x: 0, y: 0 }),
    inverse.transformPoint({ x: width, y: 0 }),
    inverse.transformPoint({ x: 0, y: height }),
    inverse.transformPoint({ x: width, y: height }),
  ];
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}
