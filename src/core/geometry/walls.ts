// Thin walls along grid and hex edges: snapping, tracing a stroke from corner
// to corner, and the segments that are drawn and block light
import type { GridType, Pair, PlacedDoor, PlacedWall } from '../../types/map';
import type { WallSegment } from './hatching';
import { hexCornerNeighbours, isHexGrid, nearestHexCorner } from './hex';

/** The grid corner nearest a point (grid units): a cell corner, or a hex corner */
export function nearestCorner(type: GridType, x: number, y: number): Pair {
  return isHexGrid(type) ? nearestHexCorner(type, x, y) : [Math.round(x), Math.round(y)];
}

function cornerNeighbours(type: GridType, [x, y]: Pair): Pair[] {
  if (isHexGrid(type)) return hexCornerNeighbours(type, [x, y]);
  return [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
}

/**
 * The edges from one corner to another along the grid, each step taking the
 * edge that gets closest to `to`, so a straight drag gives a straight wall
 */
export function edgePath(type: GridType, from: Pair, to: Pair): [Pair, Pair][] {
  const edges: [Pair, Pair][] = [];
  let at = from;
  let dist = Math.hypot(to[0] - at[0], to[1] - at[1]);
  for (let i = 0; i < 500 && dist > 1e-6; i++) {
    let next: Pair | null = null;
    let nextDist = dist;
    for (const n of cornerNeighbours(type, at)) {
      const d = Math.hypot(to[0] - n[0], to[1] - n[1]);
      if (d < nextDist - 1e-9) {
        next = n;
        nextDist = d;
      }
    }
    if (!next) break;
    edges.push([at, next]);
    at = next;
    dist = nextDist;
  }
  return edges;
}

const round = (v: number) => Math.round(v * 1e5) / 1e5;

/** The same key for an edge whichever way round it was drawn */
export function edgeKey(a: Pair, b: Pair): string {
  const [p, q] = [a, b].map(([x, y]) => `${round(x)},${round(y)}`).sort();
  return `${p};${q}`;
}

export function wallKey(w: PlacedWall): string {
  return edgeKey([w.x, w.y], [w.x + w.dx, w.y + w.dy]);
}

/** The door edge a wall lies on, as doors store it, or null off the square grid */
export function wallDoorEdge(w: PlacedWall): Pick<PlacedDoor, 'x' | 'y' | 'orientation'> | null {
  const x = Math.min(w.x, w.x + w.dx);
  const y = Math.min(w.y, w.y + w.dy);
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  if (w.dy === 0 && Math.abs(w.dx) === 1) return { x, y, orientation: 'horizontal' };
  if (w.dx === 0 && Math.abs(w.dy) === 1) return { x, y, orientation: 'vertical' };
  return null;
}

/** "h,x,y" or "v,x,y", as the fill tool keys cell edges */
export function doorEdgeKey(edge: Pick<PlacedDoor, 'x' | 'y' | 'orientation'>): string {
  return `${edge.orientation === 'horizontal' ? 'h' : 'v'},${edge.x},${edge.y}`;
}

/** Walls not opened by a door on the same edge, or one turned to sit at their middle (a hex edge) */
export function closedWalls(walls: PlacedWall[], doors: PlacedDoor[]): PlacedWall[] {
  if (doors.length === 0) return walls;
  const doorEdges = new Set(doors.filter((d) => d.angle === undefined).map(doorEdgeKey));
  const angled = doors.filter((d) => d.angle !== undefined);
  return walls.filter((w) => {
    const edge = wallDoorEdge(w);
    if (edge && doorEdges.has(doorEdgeKey(edge))) return false;
    const [mx, my] = [w.x + w.dx / 2, w.y + w.dy / 2];
    return !angled.some((d) => Math.hypot(d.x - mx, d.y - my) < 0.05);
  });
}

/** Walls not opened by any of `doors`, as segments in pixels: what is drawn and blocks light */
export function thinWallSegments(walls: PlacedWall[], doors: PlacedDoor[], gridSize: number): WallSegment[] {
  return closedWalls(walls, doors).map((w) => ({
    x1: w.x * gridSize,
    y1: w.y * gridSize,
    x2: (w.x + w.dx) * gridSize,
    y2: (w.y + w.dy) * gridSize,
    normalX: 0,
    normalY: 0,
  }));
}

/** Distance from a point to a wall, in grid units */
export function distanceToWall(w: PlacedWall, x: number, y: number): number {
  const lengthSq = w.dx * w.dx + w.dy * w.dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - w.x) * w.dx + (y - w.y) * w.dy) / lengthSq));
  return Math.hypot(x - (w.x + w.dx * t), y - (w.y + w.dy * t));
}

/** True when a wall's middle lies in or on the edge of cell (gx, gy) */
export function wallTouchesCell(w: PlacedWall, gx: number, gy: number): boolean {
  const mx = w.x + w.dx / 2;
  const my = w.y + w.dy / 2;
  const eps = 1e-6;
  return mx >= gx - eps && mx <= gx + 1 + eps && my >= gy - eps && my <= gy + 1 + eps;
}
