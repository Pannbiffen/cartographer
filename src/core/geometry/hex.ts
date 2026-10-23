// Hex grid geometry, in grid units. A hex spans one grid unit from flat side
// to flat side, and hex (0, 0) is centred on square cell (0, 0).
import type { GridType, Pair, Polygon } from '../../types/map';

/** Axial hex coordinates */
export interface Hex {
  q: number;
  r: number;
}

// Hex corners all sit on a lattice, 0.5 apart one way and √3/6 apart the
// other. Working on it keeps corners shared by neighbouring hexes exactly
// equal, so merging hexes leaves no slivers.
const LATTICE = Math.sqrt(3) / 6;
// Corner offsets on the lattice (along, across), clockwise on screen
const POINTY_CORNERS: Pair[] = [[1, 1], [0, 2], [-1, 1], [-1, -1], [0, -2], [1, -1]];
const FLAT_CORNERS: Pair[] = [[0, 2], [1, 1], [1, -1], [0, -2], [-1, -1], [-1, 1]];

export function isHexGrid(type: GridType | undefined): type is 'hex-pointy' | 'hex-flat' {
  return type === 'hex-pointy' || type === 'hex-flat';
}

/** A lattice point (along the 0.5 axis, along the √3/6 axis) as grid coordinates */
function latticePoint(type: GridType, along: number, across: number): Pair {
  const a = along * 0.5 + 0.5;
  const b = across * LATTICE + 0.5;
  return type === 'hex-flat' ? [b, a] : [a, b];
}

// A hex's centre on the lattice
function latticeCentre(type: GridType, h: Hex): Pair {
  return type === 'hex-flat' ? [2 * h.r + h.q, 3 * h.q] : [2 * h.q + h.r, 3 * h.r];
}

export function hexCenter(type: GridType, h: Hex): Pair {
  const [along, across] = latticeCentre(type, h);
  return latticePoint(type, along, across);
}

export function hexCorners(type: GridType, h: Hex): Pair[] {
  const [along, across] = latticeCentre(type, h);
  const offsets = type === 'hex-flat' ? FLAT_CORNERS : POINTY_CORNERS;
  return offsets.map(([a, b]) => latticePoint(type, along + a, across + b));
}

export function hexPolygon(type: GridType, h: Hex): Polygon {
  const corners = hexCorners(type, h);
  return [[...corners, corners[0]]];
}

function roundHex(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 };
}

/** The hex containing a point in grid units */
export function hexAt(type: GridType, x: number, y: number): Hex {
  const across = Math.sqrt(3) / 2; // centre spacing between rows (pointy) or columns (flat)
  const px = x - 0.5;
  const py = y - 0.5;
  if (type === 'hex-flat') {
    const q = px / across;
    return roundHex(q, py - q / 2);
  }
  const r = py / across;
  return roundHex(px - r / 2, r);
}

export function hexKey(h: Hex): string {
  return `${h.q},${h.r}`;
}

/** Hexes fewer than `size` steps from `h`: just `h` for size 1 */
export function hexesWithin(h: Hex, size: number): Hex[] {
  const n = size - 1;
  const hexes: Hex[] = [];
  for (let dq = -n; dq <= n; dq++) {
    for (let dr = Math.max(-n, -dq - n); dr <= Math.min(n, -dq + n); dr++) {
      hexes.push({ q: h.q + dq, r: h.r + dr });
    }
  }
  return hexes;
}

/** Hexes on a straight line from `a` to `b`, both included */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = (Math.abs(a.q - b.q) + Math.abs(a.r - b.r) + Math.abs(a.q + a.r - b.q - b.r)) / 2;
  const hexes: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // Nudge off exact edges so rounding is consistent
    hexes.push(roundHex(a.q + (b.q - a.q) * t + 1e-6, a.r + (b.r - a.r) * t + 1e-6));
  }
  return hexes;
}

/** The hex centre or corner nearest a point, for snapping shapes to the grid */
export function snapToHex(type: GridType, x: number, y: number): Pair {
  const h = hexAt(type, x, y);
  let best = hexCenter(type, h);
  let bestDist = Math.hypot(best[0] - x, best[1] - y);
  for (const c of hexCorners(type, h)) {
    const d = Math.hypot(c[0] - x, c[1] - y);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Adds the hex grid covering a rectangle (grid units) to the current path, in pixels */
export function hexGridPath(
  ctx: CanvasRenderingContext2D,
  type: GridType,
  gridSize: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
) {
  // Hexes overlapping the rectangle, a row (pointy) or column (flat) at a time
  const flat = type === 'hex-flat';
  const [lo, hi] = flat ? [minX, maxX] : [minY, maxY];
  const [lo2, hi2] = flat ? [minY, maxY] : [minX, maxX];
  const spacing = Math.sqrt(3) / 2;
  for (let line = Math.floor((lo - 1.5) / spacing); line <= Math.ceil((hi + 0.5) / spacing); line++) {
    const offset = line / 2;
    for (let k = Math.floor(lo2 - 1.5 - offset); k <= Math.ceil(hi2 + 0.5 - offset); k++) {
      const h = flat ? { q: line, r: k } : { q: k, r: line };
      // Three edges in a row per hex; neighbours draw the other three
      const corners = hexCorners(type, h);
      ctx.moveTo(corners[3][0] * gridSize, corners[3][1] * gridSize);
      for (const i of [4, 5, 0]) ctx.lineTo(corners[i][0] * gridSize, corners[i][1] * gridSize);
    }
  }
}

// Length of a hex side, from corner to neighbouring corner
const SIDE = 1 / Math.sqrt(3);

/** The hex corner nearest a point, for snapping walls to hex edges */
export function nearestHexCorner(type: GridType, x: number, y: number): Pair {
  let best: Pair = [x, y];
  let bestDist = Infinity;
  for (const c of hexCorners(type, hexAt(type, x, y))) {
    const d = Math.hypot(c[0] - x, c[1] - y);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** The three corners one hex edge away from a hex corner */
export function hexCornerNeighbours(type: GridType, corner: Pair): Pair[] {
  const [x, y] = corner;
  const found = new Map<string, Pair>();
  // The hexes meeting at the corner lie a little way off it on every side
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * Math.PI * 2 + 0.3;
    for (const c of hexCorners(type, hexAt(type, x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2))) {
      if (Math.abs(Math.hypot(c[0] - x, c[1] - y) - SIDE) < 1e-6) found.set(`${c[0].toFixed(6)},${c[1].toFixed(6)}`, c);
    }
  }
  return [...found.values()];
}

const AXIAL_STEPS: Hex[] = [{ q: 1, r: 0 }, { q: -1, r: 0 }, { q: 0, r: 1 }, { q: 0, r: -1 }, { q: 1, r: -1 }, { q: -1, r: 1 }];

/** The six hexes sharing an edge with `h` */
export function hexNeighbours(h: Hex): Hex[] {
  return AXIAL_STEPS.map((d) => ({ q: h.q + d.q, r: h.r + d.r }));
}

/** Hexes with their centres in the box spanned by the centres of `a` and `b`: a rectangle in whole hexes */
export function hexRect(type: GridType, a: Hex, b: Hex): Hex[] {
  const [ax, ay] = hexCenter(type, a);
  const [bx, by] = hexCenter(type, b);
  const [minX, maxX, minY, maxY] = [Math.min(ax, bx), Math.max(ax, bx), Math.min(ay, by), Math.max(ay, by)];
  const hexes = new Map<string, Hex>();
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      for (const h of hexesWithin(hexAt(type, x, y), 2)) {
        const [cx, cy] = hexCenter(type, h);
        if (cx >= minX - 1e-6 && cx <= maxX + 1e-6 && cy >= minY - 1e-6 && cy <= maxY + 1e-6) hexes.set(hexKey(h), h);
      }
    }
  }
  return [...hexes.values()];
}

/** A straight corridor of hexes from `a` to `b`, widened to `size` like the brush */
export function hexTunnel(a: Hex, b: Hex, size: number): Hex[] {
  const hexes = new Map<string, Hex>();
  for (const centre of hexLine(a, b)) {
    for (const h of hexesWithin(centre, size)) hexes.set(hexKey(h), h);
  }
  return [...hexes.values()];
}

/** Where a one-cell object (prop, light, plant) goes to sit in the middle of a hex: its top-left corner */
export function hexSlot(type: GridType, h: Hex): Pair {
  const [cx, cy] = hexCenter(type, h);
  return [round6(cx - 0.5), round6(cy - 0.5)];
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** How far a drag from one point to another moves things on a hex grid: from hex centre to hex centre */
export function hexOffset(type: GridType, from: Pair, to: Pair): Pair {
  const [ax, ay] = hexCenter(type, hexAt(type, ...from));
  const [bx, by] = hexCenter(type, hexAt(type, ...to));
  return [bx - ax, by - ay];
}

/**
 * One arrow-key step from a point to a neighbouring hex centre. Across the
 * rows of hexes (up and down on pointy hexes, left and right on flat ones)
 * the step zigzags by the row, so repeated steps run straight.
 */
export function hexNudge(type: GridType, at: Pair, dx: number, dy: number): Pair {
  const h = hexAt(type, ...at);
  const flat = type === 'hex-flat';
  const [along, across] = flat ? [dy, dx] : [dx, dy];
  let step: Hex;
  if (across === 0) {
    // Along a row of hexes
    step = flat ? { q: 0, r: Math.sign(along) } : { q: Math.sign(along), r: 0 };
  } else {
    // Into the next row, leaning one way on even rows and the other on odd ones
    const row = flat ? h.q : h.r;
    const lean = row % 2 === 0 ? 0 : -1;
    step = across > 0 ? { q: lean, r: 1 } : { q: lean + 1, r: -1 };
    if (flat) step = { q: step.r, r: step.q };
  }
  return hexOffset(type, hexCenter(type, h), hexCenter(type, { q: h.q + step.q, r: h.r + step.r }));
}
