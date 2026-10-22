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
