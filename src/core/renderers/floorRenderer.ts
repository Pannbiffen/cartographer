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
 * the textured areas of free-form floor over them */
export function renderFloorTextures(ctx: CanvasRenderingContext2D, layer: LayerContent, gridSize: number, inkColor: string) {
  const { rooms, floors, floorAreas } = layer;
  const groups = new Map<FloorTexture, [number, number][]>();
  for (const key of Object.keys(floors)) {
    const texture = floors[key];
    if (!rooms[key] || texture === 'plain' || !PATTERNS[texture]) continue;
    const cell = key.split(',').map(Number) as [number, number];
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
    const b = polygonBounds(polygons);
    const cells: [number, number][] = [];
    for (let gy = Math.floor(b.minY); gy < Math.ceil(b.maxY); gy++) {
      for (let gx = Math.floor(b.minX); gx < Math.ceil(b.maxX); gx++) cells.push([gx, gy]);
    }
    drawPattern(ctx, texture, floorPath(polygons, gridSize), cells, gridSize, inkColor);
  }
}

/** Draws a texture over the given cells, clipped to `clip` */
function drawPattern(
  ctx: CanvasRenderingContext2D,
  texture: FloorTexture,
  clip: Path2D,
  cells: [number, number][],
  gridSize: number,
  inkColor: string
) {
  ctx.save();
  ctx.clip(clip, 'evenodd');
  ctx.strokeStyle = inkColor;
  ctx.fillStyle = inkColor;
  ctx.lineWidth = 0.9;
  ctx.lineJoin = 'round';
  ctx.globalAlpha = TEXTURE_ALPHA[texture] ?? 0.4;
  ctx.beginPath();
  const draw = PATTERNS[texture as Exclude<FloorTexture, 'plain'>];
  const seen = new Set<string>();
  for (const [gx, gy] of cells) draw(ctx, gx, gy, gridSize, seen);
  if (texture === 'dirt') ctx.fill();
  else ctx.stroke();
  ctx.restore();
}
