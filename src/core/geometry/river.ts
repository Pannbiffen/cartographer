// Rivers: a smooth band of water along clicked points that wanders between
// them and swells and narrows along its length, all in grid units
import * as clipping from 'polygon-clipping';
import type { Pair, Polygon, Ring } from '../../types/map';

// The package's types list named exports, but its ES build only has a default one
const { union } = (clipping as unknown as { default: typeof clipping }).default;

export interface RiverSettings {
  minWidth: number; // cells
  maxWidth: number;
  wander: number; // how far the river strays from the line between points, in cells
  seed: number;
}

export const DEFAULT_RIVER: RiverSettings = { minWidth: 1.5, maxWidth: 3, wander: 1, seed: 1 };

const STEP = 0.25; // spacing of the outline's points along the river
const WANDER_SPAN = 5; // cells between the bends of the wander
const WIDTH_SPAN = 3; // cells between the swells of the width

/** A random number in [0, 1) for each integer, the same every time for a seed */
function hash(seed: number, i: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth noise in [0, 1], changing about once per unit of `x` */
function noise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const s = f * f * (3 - 2 * f);
  return hash(seed, i) * (1 - s) + hash(seed, i + 1) * s;
}

/**
 * A centripetal Catmull-Rom curve through the points (it never loops or
 * overshoots between them), sampled every `step` cells or so. Also returns
 * how far along the samples each point falls.
 */
function smoothLine(points: Pair[], step: number): { line: Pair[]; at: number[] } {
  const pts = [
    [2 * points[0][0] - points[1][0], 2 * points[0][1] - points[1][1]] as Pair,
    ...points,
    [2 * points[points.length - 1][0] - points[points.length - 2][0], 2 * points[points.length - 1][1] - points[points.length - 2][1]] as Pair,
  ];
  const line: Pair[] = [points[0]];
  const at = [0];
  const knot = (a: Pair, b: Pair) => Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    const t1 = knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const lerp = (a: Pair, b: Pair, ta: number, tb: number, t: number): Pair => {
      const u = (t - ta) / (tb - ta);
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
    };
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 1; k <= n; k++) {
      const t = t1 + ((t2 - t1) * k) / n;
      const a1 = lerp(p0, p1, 0, t1, t);
      const a2 = lerp(p1, p2, t1, t2, t);
      const a3 = lerp(p2, p3, t2, t3, t);
      const b1 = lerp(a1, a2, 0, t2, t);
      const b2 = lerp(a2, a3, t1, t3, t);
      line.push(lerp(b1, b2, t1, t2, t));
    }
    at.push(line.length - 1);
  }
  return { line, at };
}

/** Unit normals along a line, from the direction either side of each point */
function normals(line: Pair[]): Pair[] {
  return line.map((_, i) => {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
  });
}

/** The banks of a river through `points`: left bank downstream, then right bank back up */
function riverBanks(points: Pair[], settings: RiverSettings): { left: Pair[]; right: Pair[] } | null {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (pts.length < 2) return null;
  const { line, at } = smoothLine(pts, STEP);

  const along = [0];
  for (let i = 1; i < line.length; i++) {
    along.push(along[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  }
  const clicked = at.map((i) => along[i]);
  const minWidth = Math.max(0.25, Math.min(settings.minWidth, settings.maxWidth));
  const maxWidth = Math.max(minWidth, settings.maxWidth);
  const seed = Math.round(settings.seed);

  // Stray to either side between the clicked points but pass through each
  // one, never so far that the water leaves it
  const sideways = normals(line);
  const wandered = line.map(([x, y], i) => {
    const d = along[i];
    const nearest = Math.min(...clicked.map((c) => Math.abs(c - d)));
    const pin = 1 - Math.exp(-((nearest / 2) ** 2));
    const swing = 0.7 * (2 * noise(seed, d / WANDER_SPAN) - 1) + 0.3 * (2 * noise(seed + 1, d / (WANDER_SPAN * 0.4)) - 1);
    const off = settings.wander * swing * pin;
    return [x + sideways[i][0] * off, y + sideways[i][1] * off] as Pair;
  });

  const across = normals(wandered);
  const left: Pair[] = [];
  const right: Pair[] = [];
  wandered.forEach(([x, y], i) => {
    const swell = 0.75 * noise(seed + 2, along[i] / WIDTH_SPAN) + 0.25 * noise(seed + 3, along[i] / (WIDTH_SPAN * 0.35));
    const half = (minWidth + (maxWidth - minWidth) * swell) / 2;
    // Square ends reach half the width past the first and last points
    let [cx, cy] = [x, y];
    if (i === 0 || i === wandered.length - 1) {
      const [nx, ny] = across[i];
      const out = i === 0 ? -half : half;
      [cx, cy] = [x + ny * out, y - nx * out];
    }
    left.push([cx + across[i][0] * half, cy + across[i][1] * half]);
    right.push([cx - across[i][0] * half, cy - across[i][1] * half]);
  });
  return { left, right };
}

/** A river's outline as one ring, quick enough to preview as it is drawn (fill it with the non-zero rule) */
export function riverOutline(points: Pair[], settings: RiverSettings): Ring {
  const banks = riverBanks(points, settings);
  return banks ? [...banks.left, ...banks.right.reverse()] : [];
}

/** The water a river through `points` covers */
export function riverPolygon(points: Pair[], settings: RiverSettings): Polygon[] {
  const banks = riverBanks(points, settings);
  if (!banks) return [];
  const { left, right } = banks;
  // One piece per step, so a tight bend that folds a bank over itself still merges cleanly
  const parts: Polygon[] = [];
  for (let i = 0; i + 1 < left.length; i++) {
    parts.push([[left[i], left[i + 1], right[i + 1], right[i], left[i]]]);
  }
  return union(parts[0], ...parts.slice(1));
}
