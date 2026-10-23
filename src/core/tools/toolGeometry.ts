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

/** True when a door (or window) lies on any of the four edges of cell (gx, gy) */
export function doorTouchesCell(door: Pick<PlacedDoor, 'x' | 'y' | 'orientation'>, gx: number, gy: number): boolean {
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
