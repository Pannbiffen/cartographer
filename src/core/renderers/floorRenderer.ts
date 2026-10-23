// Procedural floor patterns drawn over floor cells. Every pattern is laid out
// in world coordinates, so neighbouring cells continue each other seamlessly,
// and repeats after a whole number of cells, so it can be drawn once into a
// tile and filled in from that (#59).
import type { FloorTexture, LayerContent, Polygon } from '../../types/map';
import { floorPath, polygonBounds } from '../geometry/region';
import { pseudoRandom } from '../geometry/hatching';
import { tilePattern, viewRect, wrap } from './patternTiles';
import { textureColors, type ThemeColors } from '../theme';

// The random numbers behind the patterns wrap every PERIOD cells. A 16-cell
// repeat is hard to tell from one that never repeats. 8 would make tiles a
// quarter of the size, and so quicker to redraw on zoom, if that is ever needed.
const PERIOD = 16;
// A number per pair of indices, for the `seen` sets
const pairKey = (a: number, b: number) => a * 1e6 + b;

// `seen` lets patterns that reach past a cell skip shapes a neighbour already drew
type PatternFn = (ctx: CanvasRenderingContext2D, gx: number, gy: number, g: number, seen: Set<number>) => void;

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
// 16 cells is not a whole number of boards; 14 is 8 of them
const PLANK_PERIOD = 14;
const planks: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const h = g / PLANK_ROWS;
  const wx = wrap(gx, PLANK_PERIOD);
  for (let i = 0; i < PLANK_ROWS; i++) {
    const row = gy * PLANK_ROWS + i;
    const wr = wrap(row, PLANK_PERIOD * PLANK_ROWS);
    const y = row * h;
    ctx.moveTo(x, y);
    ctx.lineTo(x + g, y);
    // Joints sit at offset + k * length along each row
    const offset = pseudoRandom(wr, 0, 5) * PLANK_LENGTH;
    const first = Math.ceil((gx - offset) / PLANK_LENGTH);
    for (let k = first; offset + k * PLANK_LENGTH < gx + 1; k++) {
      const jx = (offset + k * PLANK_LENGTH) * g;
      ctx.moveTo(jx, y);
      ctx.lineTo(jx, y + h);
    }
    // A short grain line in some boards
    if (pseudoRandom(wx, wr, 9) < 0.4) {
      const gxStart = x + (0.15 + pseudoRandom(wx, wr, 11) * 0.4) * g;
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
const FLAG_SLABS = Math.round(PERIOD / FLAG_LENGTH); // a row's slabs in one period
const flagstones: PatternFn = (ctx, gx, gy, g, seen) => {
  const h = g / FLAG_ROWS;
  const gap = Math.max(1, g * 0.035);
  for (let i = 0; i < FLAG_ROWS; i++) {
    const row = gy * FLAG_ROWS + i;
    const wr = wrap(row, PERIOD * FLAG_ROWS);
    const offset = pseudoRandom(wr, 1, 25) * FLAG_LENGTH;
    const joint = (k: number) => (offset + (k + (pseudoRandom(wr, wrap(k, FLAG_SLABS), 27) - 0.5) * 0.5) * FLAG_LENGTH) * g;
    const first = Math.floor((gx - offset) / FLAG_LENGTH) - 1;
    const last = Math.ceil((gx + 1 - offset) / FLAG_LENGTH);
    let x1 = joint(first);
    for (let k = first; k <= last; k++) {
      const x2 = joint(k + 1);
      const key = pairKey(row, k);
      if (!seen.has(key)) {
        seen.add(key);
        ctx.roundRect(x1 + gap, row * h + gap, x2 - x1 - gap * 2, h - gap * 2, g * 0.06);
      }
      x1 = x2;
    }
  }
};

// Rounded, slightly lumpy stones in offset rows, three to a cell edge
const COBBLES_PER_CELL = 3;
const COBBLE_PERIOD = PERIOD * COBBLES_PER_CELL; // even, so the row offsets repeat too
const cobbleX = new Float64Array(6);
const cobbleY = new Float64Array(6);
const cobbles: PatternFn = (ctx, gx, gy, g, seen) => {
  const s = g / COBBLES_PER_CELL;
  for (let j = gy * COBBLES_PER_CELL - 1; j <= (gy + 1) * COBBLES_PER_CELL; j++) {
    const shift = j % 2 === 0 ? 0 : 0.5;
    const wj = wrap(j, COBBLE_PERIOD);
    for (let i = gx * COBBLES_PER_CELL - 1; i <= (gx + 1) * COBBLES_PER_CELL; i++) {
      const key = pairKey(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      const wi = wrap(i, COBBLE_PERIOD);
      const cx = (i + shift + 0.5) * s + (pseudoRandom(wi, wj, 31) - 0.5) * s * 0.12;
      const cy = (j + 0.5) * s + (pseudoRandom(wi, wj, 33) - 0.5) * s * 0.12;
      // Six jittered points joined by curves through their midpoints
      const turn = pseudoRandom(wi, wj, 35);
      for (let n = 0; n < 6; n++) {
        const angle = (n / 6) * Math.PI * 2 + turn;
        const r = s * (0.32 + pseudoRandom(wi, wj, 40 + n) * 0.12);
        cobbleX[n] = cx + Math.cos(angle) * r;
        cobbleY[n] = cy + Math.sin(angle) * r;
      }
      ctx.moveTo((cobbleX[5] + cobbleX[0]) / 2, (cobbleY[5] + cobbleY[0]) / 2);
      for (let n = 0; n < 6; n++) {
        const next = (n + 1) % 6;
        ctx.quadraticCurveTo(cobbleX[n], cobbleY[n], (cobbleX[n] + cobbleX[next]) / 2, (cobbleY[n] + cobbleY[next]) / 2);
      }
      ctx.closePath();
    }
  }
};

// Packed earth: scattered specks and the odd pebble (filled, not stroked)
const DIRT_SPECKS = 14;
const dirt: PatternFn = (ctx, gx, gy, g) => {
  const wx = wrap(gx, PERIOD);
  const wy = wrap(gy, PERIOD);
  for (let n = 0; n < DIRT_SPECKS; n++) {
    const px = (gx + pseudoRandom(wx, wy, 40 + n)) * g;
    const py = (gy + pseudoRandom(wx, wy, 70 + n)) * g;
    const r = n < 2 ? g * 0.05 : 0.6 + pseudoRandom(wx, wy, 100 + n) * 0.9;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, Math.PI * 2);
  }
};

// Grass: tufts of three blades rising from a short base and curling outwards,
// leaning a little, scattered over the cell
const GRASS_TUFTS = 5;
const grass: PatternFn = (ctx, gx, gy, g) => {
  const wx = wrap(gx, PERIOD);
  const wy = wrap(gy, PERIOD);
  for (let n = 0; n < GRASS_TUFTS; n++) {
    const bx = (gx + 0.1 + pseudoRandom(wx, wy, 140 + n) * 0.8) * g;
    const by = (gy + 0.15 + pseudoRandom(wx, wy, 160 + n) * 0.8) * g;
    const height = g * (0.11 + pseudoRandom(wx, wy, 180 + n) * 0.06);
    const lean = (pseudoRandom(wx, wy, 200 + n) - 0.5) * height * 0.6;
    for (const side of [-1, 0, 1]) {
      const x = bx + side * g * 0.03;
      const top = by - height * (side === 0 ? 1 : 0.75);
      ctx.moveTo(x, by);
      ctx.quadraticCurveTo(x + lean * 0.3, (by + top) / 2, x + lean + side * height * 0.45, top);
    }
  }
};

// Sand: fine even specks, and a low ripple across some cells (filled, not stroked)
const SAND_SPECKS = 26;
const sand: PatternFn = (ctx, gx, gy, g) => {
  const wx = wrap(gx, PERIOD);
  const wy = wrap(gy, PERIOD);
  for (let n = 0; n < SAND_SPECKS; n++) {
    const px = (gx + pseudoRandom(wx, wy, 240 + n)) * g;
    const py = (gy + pseudoRandom(wx, wy, 270 + n)) * g;
    const r = 0.5 + pseudoRandom(wx, wy, 300 + n) * 0.5;
    ctx.moveTo(px + r, py);
    ctx.arc(px, py, r, 0, Math.PI * 2);
  }
  if (pseudoRandom(wx, wy, 330) < 0.5) {
    // A thin crescent, its ends inside the cell
    const cx = (gx + 0.35 + pseudoRandom(wx, wy, 331) * 0.3) * g;
    const cy = (gy + 0.3 + pseudoRandom(wx, wy, 332) * 0.5) * g;
    const half = g * (0.2 + pseudoRandom(wx, wy, 333) * 0.1);
    const rise = g * 0.12;
    ctx.moveTo(cx - half, cy);
    ctx.quadraticCurveTo(cx, cy - rise, cx + half, cy);
    ctx.quadraticCurveTo(cx, cy - rise + 2.4, cx - half, cy);
    ctx.closePath();
  }
};

// Carpet: a woven diamond lattice, half a cell across, with a knot in each diamond
const carpet: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const y = gy * g;
  const h = g / 2;
  for (const [x1, y1, x2, y2] of [
    [x, y, x + g, y + g],
    [x + h, y, x + g, y + h],
    [x, y + h, x + h, y + g],
    [x + g, y, x, y + g],
    [x + h, y, x, y + h],
    [x + g, y + h, x + h, y + g],
  ]) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  // Diamond centres a quarter cell off the lines' crossings; those on the
  // top and left edges are this cell's, the others its neighbours'
  const r = g * 0.035;
  for (const [fx, fy] of [[0.25, 0.5], [0.75, 0.5], [0.5, 0.25], [0.5, 0.75], [0.25, 0], [0.75, 0], [0, 0.25], [0, 0.75]]) {
    ctx.moveTo(x + fx * g + r, y + fy * g);
    ctx.arc(x + fx * g, y + fy * g, r, 0, Math.PI * 2);
  }
};

// Stone slabs: two cells long and one high, in a running bond set half a cell
// off the grid so the joints don't hide under grid lines, the odd one cracked
const slabs: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const y = gy * g;
  const h = g / 2;
  ctx.moveTo(x, y + h);
  ctx.lineTo(x + g, y + h);
  // Rows alternate which cells a joint crosses: the top half's or the bottom's
  const jointTop = wrap(gx + gy, 2) === 1;
  ctx.moveTo(x + h, jointTop ? y : y + h);
  ctx.lineTo(x + h, jointTop ? y + h : y + g);
  const wx = wrap(gx, PERIOD);
  const wy = wrap(gy, PERIOD);
  if (pseudoRandom(wx, wy, 350) < 0.2) {
    // A crack running from the middle line into the slab beside the joint
    const side = jointTop ? 1 : -1;
    let cx = x + (0.6 + pseudoRandom(wx, wy, 351) * 0.3) * g;
    let cy = y + h;
    ctx.moveTo(cx, cy);
    for (let n = 0; n < 3; n++) {
      cx += (pseudoRandom(wx, wy, 352 + n) - 0.5) * g * 0.15;
      cy += side * g * 0.12;
      ctx.lineTo(cx, cy);
    }
  }
};

// Marble: polished squares, a cell each, crossed by a wandering vein that sometimes forks
const marble: PatternFn = (ctx, gx, gy, g) => {
  const x = gx * g;
  const y = gy * g;
  // Each cell draws its top and left edges
  ctx.moveTo(x + g, y);
  ctx.lineTo(x, y);
  ctx.lineTo(x, y + g);
  const wx = wrap(gx, PERIOD);
  const wy = wrap(gy, PERIOD);
  const rand = (n: number) => pseudoRandom(wx, wy, 370 + n);
  // From the left edge to the right, or the top to the bottom, in an S
  const across = rand(0) < 0.5;
  const at = (a: number, b: number): [number, number] => (across ? [x + a * g, y + b * g] : [x + b * g, y + a * g]);
  const ends = [0.15 + rand(1) * 0.7, rand(3), rand(4), 0.15 + rand(2) * 0.7];
  ctx.moveTo(...at(0.04, ends[0]));
  ctx.bezierCurveTo(...at(0.35, ends[1]), ...at(0.65, ends[2]), ...at(0.96, ends[3]));
  if (rand(5) < 0.5) {
    // A branch off the vein's middle
    ctx.moveTo(...at(0.5, (ends[0] + 3 * ends[1] + 3 * ends[2] + ends[3]) / 8));
    ctx.quadraticCurveTo(...at(0.6 + rand(6) * 0.2, 0.5), ...at(0.7 + rand(7) * 0.2, rand(8) < 0.5 ? 0.12 : 0.88));
  }
};

type Pattern = Exclude<FloorTexture, 'plain'>;
const PATTERNS: Record<Pattern, PatternFn> = {
  tiles,
  planks,
  flagstones,
  cobbles,
  dirt,
  grass,
  sand,
  carpet,
  slabs,
  marble,
};
const PATTERN_PERIOD: Record<Pattern, number> = {
  tiles: PERIOD,
  planks: PLANK_PERIOD,
  flagstones: PERIOD,
  cobbles: PERIOD,
  dirt: PERIOD,
  grass: PERIOD,
  sand: PERIOD,
  carpet: PERIOD,
  slabs: PERIOD,
  marble: PERIOD,
};

// Fainter for busy patterns, stronger for sparse ones
const TEXTURE_ALPHA: Partial<Record<FloorTexture, number>> = {
  dirt: 0.35,
  cobbles: 0.55,
  flagstones: 0.5,
  grass: 0.55,
  sand: 0.45,
  carpet: 0.3,
  slabs: 0.5,
  marble: 0.45,
};
// Patterns of specks, filled rather than stroked
const FILLED = new Set<Pattern>(['dirt', 'sand']);

const isPattern = (texture: FloorTexture): texture is Pattern => texture in PATTERNS;

/** Draws each floor cell's texture, clipped to the cells that carry it, then
 * the textured areas of free-form floor over them. Only cells in view are drawn. */
export function renderFloorTextures(ctx: CanvasRenderingContext2D, layer: LayerContent, gridSize: number, theme: ThemeColors) {
  renderTextures(ctx, layer.floors, layer.floorAreas, gridSize, theme, (key) => layer.rooms[key]);
}

/** Paint on the ground: the floor colour, hiding the ground beneath, with its textures over that */
export function renderPaint(ctx: CanvasRenderingContext2D, layer: LayerContent, gridSize: number, theme: ThemeColors) {
  const cells = new Path2D();
  for (const key of Object.keys(layer.paint)) {
    const [gx, gy] = key.split(',').map(Number);
    cells.rect(gx * gridSize, gy * gridSize, gridSize, gridSize);
  }
  ctx.fillStyle = theme.floor;
  // Apart, as cells under an area overlap it
  ctx.fill(cells);
  ctx.fill(floorPath(Object.values(layer.paintAreas).flat(), gridSize), 'evenodd');
  renderTextures(ctx, layer.paint, layer.paintAreas, gridSize, theme, () => true);
}

/** Textured cells (those `include` lets through) with textured areas winning over them */
function renderTextures(
  ctx: CanvasRenderingContext2D,
  textures: { [key: string]: FloorTexture },
  textureAreas: Partial<Record<FloorTexture, Polygon[]>>,
  gridSize: number,
  theme: ThemeColors,
  include: (key: string) => boolean
) {
  const view = viewCells(ctx, gridSize);
  const inView = (gx: number, gy: number) => gx >= view.minX && gx < view.maxX && gy >= view.minY && gy < view.maxY;
  const groups = new Map<Pattern, [number, number][]>();
  for (const key of Object.keys(textures)) {
    const texture = textures[key];
    if (!include(key) || !isPattern(texture)) continue;
    const cell = key.split(',').map(Number) as [number, number];
    if (!inView(...cell)) continue;
    const cells = groups.get(texture);
    if (cells) cells.push(cell);
    else groups.set(texture, [cell]);
  }

  const areas = Object.entries(textureAreas) as [FloorTexture, Polygon[]][];
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
    drawTexture(ctx, texture, clip, () => cells, gridSize, theme);
  }
  ctx.restore();

  for (const [texture, polygons] of areas) {
    if (!isPattern(texture) || polygons.length === 0) continue;
    // The cells under each polygon, not the box around them all: areas far
    // apart would otherwise fill the whole space between them
    const cellsUnder = () => {
      const keys = new Set<number>();
      const cells: [number, number][] = [];
      for (const polygon of polygons) {
        const b = polygonBounds([polygon]);
        for (let gy = Math.max(Math.floor(b.minY), view.minY); gy < Math.min(Math.ceil(b.maxY), view.maxY); gy++) {
          for (let gx = Math.max(Math.floor(b.minX), view.minX); gx < Math.min(Math.ceil(b.maxX), view.maxX); gx++) {
            const key = pairKey(gx, gy);
            if (keys.has(key)) continue;
            keys.add(key);
            cells.push([gx, gy]);
          }
        }
      }
      return cells;
    };
    drawTexture(ctx, texture, floorPath(polygons, gridSize), cellsUnder, gridSize, theme);
  }
}

/** Lays a texture over everything the canvas shows: an outdoor map's ground */
export function renderGround(ctx: CanvasRenderingContext2D, texture: FloorTexture, gridSize: number, theme: ThemeColors) {
  if (!isPattern(texture)) return;
  const view = viewCells(ctx, gridSize);
  const clip = new Path2D();
  clip.rect(view.minX * gridSize, view.minY * gridSize, (view.maxX - view.minX) * gridSize, (view.maxY - view.minY) * gridSize);
  const cells = () => {
    const list: [number, number][] = [];
    for (let gy = view.minY; gy < view.maxY; gy++) for (let gx = view.minX; gx < view.maxX; gx++) list.push([gx, gy]);
    return list;
  };
  drawTexture(ctx, texture, clip, cells, gridSize, theme);
}

/** The cells the canvas shows, from its transform */
function viewCells(ctx: CanvasRenderingContext2D, gridSize: number) {
  const view = viewRect(ctx);
  // A cell further out, as patterns reach a little past their own cell
  return {
    minX: Math.floor(view.minX / gridSize) - 1,
    minY: Math.floor(view.minY / gridSize) - 1,
    maxX: Math.ceil(view.maxX / gridSize) + 1,
    maxY: Math.ceil(view.maxY / gridSize) + 1,
  };
}

/**
 * Fills `clip` with a texture, over the style's colour for it if it has one:
 * from a tile of one whole period when one fits, else (zoomed far in, where
 * few cells show) by drawing `cells` directly.
 */
function drawTexture(
  ctx: CanvasRenderingContext2D,
  texture: Pattern,
  clip: Path2D,
  cells: () => [number, number][],
  gridSize: number,
  theme: ThemeColors
) {
  const { fill, ink: inkColor } = textureColors(theme, texture);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill(clip, 'evenodd');
  }
  const n = PATTERN_PERIOD[texture];
  const pattern = tilePattern(ctx, `${texture}|${gridSize}|${inkColor}`, n * gridSize, (tctx) => {
    // A ring of cells around the period too: their shapes cross its edges and
    // wrap round to the far side
    const ring: [number, number][] = [];
    for (let gy = -1; gy <= n; gy++) for (let gx = -1; gx <= n; gx++) ring.push([gx, gy]);
    strokeCells(tctx, texture, ring, gridSize, inkColor);
  });
  if (!pattern) {
    const list = cells();
    if (list.length > 0) drawPattern(ctx, texture, clip, list, gridSize, inkColor);
    return;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha *= TEXTURE_ALPHA[texture] ?? 0.4;
  ctx.fillStyle = pattern;
  ctx.fill(clip, 'evenodd');
  ctx.restore();
}

// Cells drawn per path: canvas paths get slower to build the longer they get,
// so a large area is drawn in many short paths. Cobbles have ~60 curves a cell.
const cellsPerPath = (texture: Pattern) => (texture === 'cobbles' ? 4 : 16);

/** Strokes (or for specks, fills) a texture's shapes over `cells` */
function strokeCells(ctx: CanvasRenderingContext2D, texture: Pattern, cells: [number, number][], gridSize: number, inkColor: string) {
  ctx.strokeStyle = inkColor;
  ctx.fillStyle = inkColor;
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  const draw = PATTERNS[texture];
  const seen = new Set<number>();
  const perPath = cellsPerPath(texture);
  for (let start = 0; start < cells.length; start += perPath) {
    ctx.beginPath();
    for (const [gx, gy] of cells.slice(start, start + perPath)) draw(ctx, gx, gy, gridSize, seen);
    if (FILLED.has(texture)) ctx.fill();
    else ctx.stroke();
  }
}

// Scratch canvas a pattern is drawn on before it is clipped and blended in
let patternCanvas: HTMLCanvasElement | null = null;

/**
 * Draws a texture over the given cells, clipped to `clip`. The short paths
 * go onto a scratch canvas, which is clipped and blended in once: clipping
 * each path to a curved outline costs far more than drawing it.
 */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  texture: Pattern,
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
  strokeCells(pctx, texture, cells, gridSize, inkColor);
  pctx.globalCompositeOperation = 'destination-in';
  pctx.fill(clip, 'evenodd');

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha *= TEXTURE_ALPHA[texture] ?? 0.4;
  ctx.drawImage(patternCanvas, 0, 0, width, height, left, top, width, height);
  ctx.restore();
}
