// Line of sight from a point past wall segments, used to cast light shadows
import type { WallSegment } from './hatching';

export interface Point {
  x: number;
  y: number;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Joins wall edges that continue each other along one line into single segments */
export function mergeWallSegments(walls: WallSegment[]): Segment[] {
  const rows = new Map<string, [number, number][]>();
  const merged: Segment[] = [];
  for (const w of walls) {
    // Slanted walls (from free-form shapes) are kept as they are
    if (w.x1 !== w.x2 && w.y1 !== w.y2) {
      merged.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
      continue;
    }
    const horizontal = w.y1 === w.y2;
    const key = horizontal ? `h${w.y1}` : `v${w.x1}`;
    const span: [number, number] = horizontal
      ? [Math.min(w.x1, w.x2), Math.max(w.x1, w.x2)]
      : [Math.min(w.y1, w.y2), Math.max(w.y1, w.y2)];
    const spans = rows.get(key);
    if (spans) spans.push(span);
    else rows.set(key, [span]);
  }

  for (const [key, spans] of rows) {
    const at = Number(key.slice(1));
    const horizontal = key[0] === 'h';
    spans.sort((a, b) => a[0] - b[0]);
    let [start, end] = spans[0];
    const flush = () =>
      merged.push(horizontal ? { x1: start, y1: at, x2: end, y2: at } : { x1: at, y1: start, x2: at, y2: end });
    for (const [s, e] of spans.slice(1)) {
      if (s <= end) {
        end = Math.max(end, e);
      } else {
        flush();
        [start, end] = [s, e];
      }
    }
    flush();
  }
  return merged;
}

/** Distance along the ray (ox, oy) + t * (dx, dy) to a segment, or Infinity */
function rayHit(ox: number, oy: number, dx: number, dy: number, s: Segment): number {
  const sx = s.x2 - s.x1;
  const sy = s.y2 - s.y1;
  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-12) return Infinity;
  const px = s.x1 - ox;
  const py = s.y1 - oy;
  const t = (px * sy - py * sx) / denom;
  const u = (px * dy - py * dx) / denom;
  return t >= 0 && u >= -1e-9 && u <= 1 + 1e-9 ? t : Infinity;
}

/**
 * The area visible from `origin` within a square of half-size `radius`, as a
 * polygon in angle order. Rays aim at every wall end (and just either side of
 * it) and stop at the first wall they meet.
 */
export function visibilityPolygon(origin: Point, radius: number, walls: Segment[]): Point[] {
  const { x: ox, y: oy } = origin;
  const left = ox - radius;
  const right = ox + radius;
  const top = oy - radius;
  const bottom = oy + radius;

  const near = walls.filter(
    (s) =>
      Math.max(s.x1, s.x2) >= left &&
      Math.min(s.x1, s.x2) <= right &&
      Math.max(s.y1, s.y2) >= top &&
      Math.min(s.y1, s.y2) <= bottom
  );
  // The bounding square stops rays that meet no wall
  near.push(
    { x1: left, y1: top, x2: right, y2: top },
    { x1: right, y1: top, x2: right, y2: bottom },
    { x1: right, y1: bottom, x2: left, y2: bottom },
    { x1: left, y1: bottom, x2: left, y2: top }
  );

  const angles: number[] = [];
  for (const s of near) {
    for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
      const a = Math.atan2(y - oy, x - ox);
      angles.push(a - 1e-4, a, a + 1e-4);
    }
  }

  const hits: { angle: number; x: number; y: number }[] = [];
  for (const angle of angles) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    let best = Infinity;
    for (const s of near) best = Math.min(best, rayHit(ox, oy, dx, dy, s));
    if (best < Infinity) hits.push({ angle, x: ox + dx * best, y: oy + dy * best });
  }
  hits.sort((a, b) => a.angle - b.angle);
  return hits;
}
