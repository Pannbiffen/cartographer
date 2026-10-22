// Procedural floor patterns drawn over floor cells. Every pattern is laid out
// in world coordinates, so neighbouring cells continue each other seamlessly.
import type { FloorTexture, LayerContent, Polygon } from '../../types/map';
import { floorPath, polygonBounds } from '../geometry/region';
import { pseudoRandom } from '../geometry/hatching';

// `seen` lets patterns that reach past a cell skip shapes a neighbour already drew
type PatternFn = (ctx: CanvasRenderingContext2D, gx: number, gy: number, g: number, seen: Set<string>) => void;

// Square tiles, four to a cell
const tiles: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const y = gy * g;
  for (const f of [0, 0.5]) {
    ctx.moveTo(x + f * g, y);
    ctx.lineTo(x + f * g, y + g);
    ctx.moveTo(x, y + f * g);
    ctx.lineTo(x + g, y + f * g);
  }
};

// Horizontal boards, four to a cell, with staggered joints
const PLANK_ROWS = 4;
const PLANK_LENGTH = 1.75; // cells
const planks: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const h = g / PLANK_ROWS;
  for (let i = 0; i < PLANK_ROWS; i++) {
    const row = gy * PLANK_ROWS + i;
    const y = row * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + g, y);
    // Joints sit at offset + k * length along each row
    const offset = pseudoRandom(row, 0, 5) * PLANK_LENGTH;
    const first = Math.ceil((gx - offset) / PLANK_LENGTH);
    for (let k = first; offset + k * PLANK_LENGTH < gx + 1; k++) {
      const jx = (offset + k * PLANK_LENGTH) * g;
      ctx.moveTo(jx, y);
      ctx.lineTo(jx, y + h);
    }
    // A short grain line in some boards
    if (pseudoRandom(gx, row, 9) < 0.4) {
      const gxStart = x + (0.15 + pseudoRandom(gx, row, 11) * 0.4) * g;
      ctx.moveTo(gxStart, y + h * 0.5);
      ctx.lineTo(gxStart + g * 0.3, y + h * 0.5);
    }
  }
};

// Slabs in rows two to a cell, of varied width, each a rounded block with a
// thin gap to its neighbours. Joints come from the row and slab index, so
// slabs line up across cells.
const FLAG_ROWS = 2;
const FLAG_LENGTH = 0.8; // cells, on average
const flagstones: PatternFn = (ctx, gx, gy, g, seen) => {
  const h = g / FLAG_ROWS;
  const gap = Math.max(1, g * 0.035);
  for (let i = 0; i < FLAG_ROWS; i++) {
    const row = gy * FLAG_ROWS + i;
    const offset = pseudoRandom(row, 1, 25) * FLAG_LENGTH;
    const joint = (k: number) => (offset + (k + (pseudoRandom(row, k, 27) - 0.5) * 0.5) * FLAG_LENGTH) * g;
    const first = Math.floor((gx - offset) / FLAG_LENGTH) - 1;
    const last = Math.ceil((gx + 1 - offset) / FLAG_LENGTH);
    for (let k = first; k <= last; k++) {
      const key = `${row},${k}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const x1 = joint(k);
      const x2 = joint(k + 1);
      ctx.roundRect(x1 + gap, row * h + gap, x2 - x1 - gap * 2, h - gap * 2, g * 0.06);
    }
  }
};

// Rounded, slightly lumpy stones in offset rows, three to a cell edge
const COBBLES_PER_CELL = 3;
const cobbles: PatternFn = (ctx, gx, gy, g, seen) => {
  const s = g / COBBLES_PER_CELL;
  for (let j = gy * COBBLES_PER_CELL - 1; j <= (gy + 1) * COBBLES_PER_CELL; j++) {
    const shift = j % 2 === 0 ? 0 : 0.5;
    for (let i = gx * COBBLES_PER_CELL - 1; i <= (gx + 1) * COBBLES_PER_CELL; i++) {
      const key = `${i},${j}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const cx = (i + shift + 0.5) * s + (pseudoRandom(i, j, 31) - 0.5) * s * 0.12;
      const cy = (j + 0.5) * s + (pseudoRandom(i, j, 33) - 0.5) * s * 0.12;
      // Six jittered points joined by curves through their midpoints
      const pts = Array.from({ length: 6 }, (_, n) => {
        const angle = (n / 6) * Math.PI * 2 + pseudoRandom(i, j, 35) * 1.0;
        const r = s * (0.32 + pseudoRandom(i, j, 40 + n) * 0.12);
        return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
      });
      const mid = (n: number) => {
        const p = pts[n % 6];
        const q = pts[(n + 1) % 6];
        return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      };
      const start = mid(5);
      ctx.moveTo(start.x, start.y);
      for (let n = 0; n < 6; n++) {
        const end = mid(n);
        ctx.quadraticCurveTo(pts[n].x, pts[n].y, end.x, end.y);
      }
      ctx.closePath();
    }
  }
};

// Packed earth: scattered specks and the odd pebble (filled, not stroked)
const DIRT_SPECKS = 14;
const dirt: PatternFn = (ctx, gx, gy, g) => {
  for (let n = 0; n < DIRT_SPECKS; n++) {
    const px = (gx + pseudoRandom(gx, gy, 40 + n)) * g;
    const py = (gy + pseudoRandom(gx, gy, 70 + n)) * g;
    const r = n < 2 ? g * 0.05 : 0.6 + pseudoRandom(gx, gy, 100 + n) * 0.9;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, Math.PI * 2);
  }
};

const PATTERNS: Record<Exclude<FloorTexture, 'plain'>, PatternFn> = {
  tiles,
  planks,
  flagstones,
  cobbles,
  dirt,
};

// Fainter for busy patterns, stronger for sparse ones
const TEXTURE_ALPHA: Partial<Record<FloorTexture, number>> = { dirt: 0.35, cobbles: 0.55, flagstones: 0.5 };

/** Draws each floor cell's texture, clipped to the cells that carry it, then
 * the textured areas of free-form floor over them. Only cells in view are drawn. */
export function renderFloorTextures(ctx: CanvasRenderingContext2D, layer: LayerContent, gridSize: number, inkColor: string) {
  const { rooms, floors, floorAreas } = layer;
  const view = viewCells(ctx, gridSize);
  const inView = (gx: number, gy: number) => gx >= view.minX && gx < view.maxX && gy >= view.minY && gy < view.maxY;
  const groups = new Map<FloorTexture, [number, number][]>();
  for (const key of Object.keys(floors)) {
    const texture = floors[key];
    if (!rooms[key] || texture === 'plain' || !PATTERNS[texture]) continue;
    const cell = key.split(',').map(Number) as [number, number];
    if (!inView(...cell)) continue;
    const cells = groups.get(texture);
    if (cells) cells.push(cell);
    else groups.set(texture, [cell]);
  }

  const areas = Object.entries(floorAreas) as [FloorTexture, Polygon[]][];
  ctx.save();
  if (areas.length > 0 && groups.size > 0) {
    // Areas win over the cells beneath them: clip those out
    const outside = floorPath(areas.flatMap(([, polygons]) => polygons), gridSize);
    outside.rect(-1e7, -1e7, 2e7, 2e7);
    ctx.clip(outside, 'evenodd');
  }
  for (const [texture, cells] of groups) {
    const clip = new Path2D();
    for (const [gx, gy] of cells) clip.rect(gx * gridSize, gy * gridSize, gridSize, gridSize);
    drawPattern(ctx, texture, clip, cells, gridSize, inkColor);
  }
  ctx.restore();

  for (const [texture, polygons] of areas) {
    if (!PATTERNS[texture as Exclude<FloorTexture, 'plain'>] || polygons.length === 0) continue;
    // The cells under each polygon, not the box around them all: areas far
    // apart would otherwise fill the whole space between them
    const keys = new Set<string>();
    const cells: [number, number][] = [];
    for (const polygon of polygons) {
      const b = polygonBounds([polygon]);
      for (let gy = Math.max(Math.floor(b.minY), view.minY); gy < Math.min(Math.ceil(b.maxY), view.maxY); gy++) {
        for (let gx = Math.max(Math.floor(b.minX), view.minX); gx < Math.min(Math.ceil(b.maxX), view.maxX); gx++) {
          const key = `${gx},${gy}`;
          if (keys.has(key)) continue;
          keys.add(key);
          cells.push([gx, gy]);
        }
      }
    }
    if (cells.length > 0) drawPattern(ctx, texture, floorPath(polygons, gridSize), cells, gridSize, inkColor);
  }
}

/** The cells the canvas shows (a whole export, or the view on screen), from its transform */
function viewCells(ctx: CanvasRenderingContext2D, gridSize: number) {
  const inverse = ctx.getTransform().inverse();
  const { width, height } = ctx.canvas;
  const corners = [
    inverse.transformPoint({ x: 0, y: 0 }),
    inverse.transformPoint({ x: width, y: 0 }),
    inverse.transformPoint({ x: 0, y: height }),
    inverse.transformPoint({ x: width, y: height }),
  ];
  const xs = corners.map((p) => p.x / gridSize);
  const ys = corners.map((p) => p.y / gridSize);
  // A cell further out, as patterns reach a little past their own cell
  return {
    minX: Math.floor(Math.min(...xs)) - 1,
    minY: Math.floor(Math.min(...ys)) - 1,
    maxX: Math.ceil(Math.max(...xs)) + 1,
    maxY: Math.ceil(Math.max(...ys)) + 1,
  };
}

// Cells drawn per path: canvas paths get slower to build the longer they get,
// so a large area is drawn in many short paths
const CELLS_PER_PATH = 16;

// Scratch canvas a pattern is drawn on before it is clipped and blended in
let patternCanvas: HTMLCanvasElement | null = null;

/**
 * Draws a texture over the given cells, clipped to `clip`. The short paths
 * go onto a scratch canvas, which is clipped and blended in once: clipping
 * each path to a curved outline costs far more than drawing it.
 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  texture: FloorTexture,
  clip: Path2D,
  cells: [number, number][],
  gridSize: number,
  inkColor: string
) {
  // The cells' extent in canvas pixels, a cell wider as patterns reach past their cells
  const transform = ctx.getTransform();
  const xs = cells.map(([gx]) => gx);
  const ys = cells.map(([, gy]) => gy);
  const corners = [
    [Math.min(...xs) - 1, Math.min(...ys) - 1],
    [Math.max(...xs) + 2, Math.min(...ys) - 1],
    [Math.min(...xs) - 1, Math.max(...ys) + 2],
    [Math.max(...xs) + 2, Math.max(...ys) + 2],
  ].map(([gx, gy]) => transform.transformPoint({ x: gx * gridSize, y: gy * gridSize }));
  const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
  const top = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))));
  const right = Math.min(ctx.canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
  const bottom = Math.min(ctx.canvas.height, Math.ceil(Math.max(...corners.map((p) => p.y))));
  if (right <= left || bottom <= top) return;

  patternCanvas ??= document.createElement('canvas');
  const width = right - left;
  const height = bottom - top;
  if (patternCanvas.width < width || patternCanvas.height < height) {
    patternCanvas.width = Math.max(patternCanvas.width, width);
    patternCanvas.height = Math.max(patternCanvas.height, height);
  }
  const pctx = patternCanvas.getContext('2d');
  if (!pctx) return;
  pctx.setTransform(1, 0, 0, 1, 0, 0);
  pctx.globalCompositeOperation = 'source-over';
  pctx.clearRect(0, 0, width, height);
  pctx.setTransform(new DOMMatrix([1, 0, 0, 1, -left, -top]).multiply(transform));
  pctx.strokeStyle = inkColor;
  pctx.fillStyle = inkColor;
  pctx.lineWidth = 0.9;
  pctx.lineJoin = 'round';
  const draw = PATTERNS[texture as Exclude<FloorTexture, 'plain'>];
  const seen = new Set<string>();
  for (let start = 0; start < cells.length; start += CELLS_PER_PATH) {
    pctx.beginPath();
    for (const [gx, gy] of cells.slice(start, start + CELLS_PER_PATH)) draw(pctx, gx, gy, gridSize, seen);
    if (texture === 'dirt') pctx.fill();
    else pctx.stroke();
  }
  pctx.globalCompositeOperation = 'destination-in';
  pctx.fill(clip, 'evenodd');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= TEXTURE_ALPHA[texture] ?? 0.4;
  ctx.drawImage(patternCanvas, 0, 0, width, height, left, top, width, height);
  ctx.restore();
}
