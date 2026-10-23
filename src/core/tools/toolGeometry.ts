// Grid geometry shared by the canvas tools (brush footprints, drag shapes, door snapping)
import type { GridCoord, PlacedDoor, PlacedStairs } from '../../types/map';

/** Cells covered by a square brush of `size` centred on (gx, gy) */
export function brushCells(gx: number, gy: number, size: number): GridCoord[] {
  const start = Math.floor((size - 1) / 2);
  const cells: GridCoord[] = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      cells.push({ x: gx - start + dx, y: gy - start + dy });
    }
  }
  return cells;
}

/** Cells inside the rectangle spanned by two corner cells (inclusive) */
export function rectCells(a: GridCoord, b: GridCoord): GridCoord[] {
  const cells: GridCoord[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

/**
 * Cells of an L-shaped corridor from `a` to `b`, `width` cells wide. The
 * longer leg is laid first so short diagonal drags read as straight halls.
 */
export function tunnelCells(a: GridCoord, b: GridCoord, width: number): GridCoord[] {
  const seen = new Set<string>();
  const cells: GridCoord[] = [];
  const stamp = (x: number, y: number) => {
    for (const c of brushCells(x, y, width)) {
      const key = `${c.x},${c.y}`;
      if (!seen.has(key)) {
        seen.add(key);
        cells.push(c);
      }
    }
  };

  const horizontalFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const corner = horizontalFirst ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
  for (const [from, to] of [
    [a, corner],
    [corner, b],
  ]) {
    const stepX = Math.sign(to.x - from.x);
    const stepY = Math.sign(to.y - from.y);
    let x = from.x;
    let y = from.y;
    stamp(x, y);
    while (x !== to.x || y !== to.y) {
      x += stepX;
      y += stepY;
      stamp(x, y);
    }
  }
  return cells;
}

/**
 * Snaps a world position to the nearest cell edge. Horizontal doors sit on
 * the top edge of cell (x, y); vertical doors on its left edge.
 */
export function nearestDoorEdge(
  worldX: number,
  worldY: number,
  gridSize: number
): Pick<PlacedDoor, 'x' | 'y' | 'orientation'> {
  const gx = Math.floor(worldX / gridSize);
  const gy = Math.floor(worldY / gridSize);
  const fx = worldX / gridSize - gx;
  const fy = worldY / gridSize - gy;

  const edges = [
    { d: fy, x: gx, y: gy, orientation: 'horizontal' as const },
    { d: 1 - fy, x: gx, y: gy + 1, orientation: 'horizontal' as const },
    { d: fx, x: gx, y: gy, orientation: 'vertical' as const },
    { d: 1 - fx, x: gx + 1, y: gy, orientation: 'vertical' as const },
  ];
  edges.sort((p, q) => p.d - q.d);
  const { x, y, orientation } = edges[0];
  return { x, y, orientation };
}

/** Where a door (or window) sits: a cell edge, or a centre and angle along a wall off the grid lines */
export type DoorSpot = Pick<PlacedDoor, 'x' | 'y' | 'orientation' | 'angle' | 'length'>;

/** A door's (or window's) middle, its direction along the wall and its span there, in grid units */
export function doorLine(door: DoorSpot): { cx: number; cy: number; ux: number; uy: number; length: number } {
  const length = door.length ?? 1;
  if (door.angle !== undefined) {
    const a = (door.angle * Math.PI) / 180;
    return { cx: door.x, cy: door.y, ux: Math.cos(a), uy: Math.sin(a), length };
  }
  return door.orientation === 'horizontal'
    ? { cx: door.x + 0.5, cy: door.y, ux: 1, uy: 0, length }
    : { cx: door.x, cy: door.y + 0.5, ux: 0, uy: 1, length };
}

/** Whether two doors (or windows) would overlap on a wall: their middles are under half a door apart */
export function sameDoorSpot(a: DoorSpot, b: DoorSpot): boolean {
  const p = doorLine(a);
  const q = doorLine(b);
  return Math.hypot(p.cx - q.cx, p.cy - q.cy) < Math.min(p.length, q.length) / 2;
}

/** Distance from a point to a door's full span, in grid units */
export function distanceToDoor(door: DoorSpot, x: number, y: number): number {
  const { cx, cy, ux, uy, length } = doorLine(door);
  const t = Math.max(-length / 2, Math.min(length / 2, (x - cx) * ux + (y - cy) * uy));
  return Math.hypot(x - (cx + ux * t), y - (cy + uy * t));
}

/**
 * A wall a door can snap to, in grid units. A `centred` door sits at its
 * middle (a hex edge), no longer than the wall; otherwise anywhere along it
 * (a long or curved wall).
 */
export interface DoorWall {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  centred: boolean;
}

// How near (in cells) a wall off the grid lines must be for a door to snap to it
const ANGLED_DOOR_REACH = 0.35;

const tidy = (v: number, places: number) => Math.round(v * 10 ** places) / 10 ** places;

/**
 * Where a door goes for a point in grid units: on the nearest of `walls`
 * within reach, turned to run along it, or else on the nearest cell edge
 */
export function snapDoor(x: number, y: number, walls: DoorWall[]): DoorSpot {
  let best: { x: number; y: number; angle: number; length?: number } | null = null;
  let bestDistance = ANGLED_DOOR_REACH;
  for (const w of walls) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1e-12) continue;
    const t = w.centred ? 0.5 : Math.max(0, Math.min(1, ((x - w.x1) * dx + (y - w.y1) * dy) / lengthSq));
    const px = w.x1 + dx * t;
    const py = w.y1 + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < bestDistance) {
      bestDistance = d;
      // A door looks the same either way round, so keep 0 to 180
      const angle = (((Math.atan2(dy, dx) * 180) / Math.PI) % 180 + 180) % 180;
      const span = Math.sqrt(lengthSq);
      best = { x: tidy(px, 4), y: tidy(py, 4), angle: tidy(angle, 2) % 180, length: w.centred && span < 1 ? tidy(span, 4) : undefined };
    }
  }
  if (best) return { ...best, orientation: 'horizontal' };
  return { ...nearestDoorEdge(x, y, 1), angle: undefined, length: undefined };
}

/** True when a door (or window) lies on any of the four edges of cell (gx, gy), or has its middle in it */
export function doorTouchesCell(door: DoorSpot, gx: number, gy: number): boolean {
  if (door.angle !== undefined) return Math.floor(door.x) === gx && Math.floor(door.y) === gy;
  if (door.orientation === 'horizontal') {
    return door.x === gx && (door.y === gy || door.y === gy + 1);
  }
  return door.y === gy && (door.x === gx || door.x === gx + 1);
}

export function stairsContainCell(stairs: PlacedStairs, gx: number, gy: number): boolean {
  return (
    gx >= stairs.x &&
    gx < stairs.x + stairs.width &&
    gy >= stairs.y &&
    gy < stairs.y + stairs.height
  );
}

/** Cells on a straight line from `a` to `b` (Bresenham), so fast strokes leave no gaps */
export function lineCells(a: GridCoord, b: GridCoord): GridCoord[] {
  const cells: GridCoord[] = [];
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  let x = a.x;
  let y = a.y;
  for (;;) {
    cells.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return cells;
}
