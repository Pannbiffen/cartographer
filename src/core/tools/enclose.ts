// Areas a wall stroke closes off, which then become rooms
import type { GridCoord, GridType, MapLayer, Pair } from '../../types/map';
import { hexAt, hexCenter, hexCorners, hexKey, isHexGrid, type Hex } from '../geometry/hex';
import { edgeKey, wallKey } from '../geometry/walls';
import { isFloorAt } from './fill';

// Larger areas count as open: a wall touching a big field shouldn't turn it into a room
export const MAX_ENCLOSED_CELLS = 2500;

interface Grid<C> {
  key: (c: C) => string;
  // Each neighbour with the key of the edge between them
  neighbours: (c: C) => [C, string][];
  centre: (c: C) => Pair;
}

const squareGrid: Grid<GridCoord> = {
  key: (c) => `${c.x},${c.y}`,
  neighbours: ({ x, y }) => [
    [{ x, y: y - 1 }, edgeKey([x, y], [x + 1, y])],
    [{ x, y: y + 1 }, edgeKey([x, y + 1], [x + 1, y + 1])],
    [{ x: x - 1, y }, edgeKey([x, y], [x, y + 1])],
    [{ x: x + 1, y }, edgeKey([x + 1, y], [x + 1, y + 1])],
  ],
  centre: ({ x, y }) => [x + 0.5, y + 0.5],
};

const HEX_STEPS: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const cornerKey = ([x, y]: Pair) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)}`;

function hexGrid(type: GridType): Grid<Hex> {
  return {
    key: hexKey,
    neighbours: (h) => {
      const corners = hexCorners(type, h);
      return HEX_STEPS.map(([dq, dr]) => {
        const n = { q: h.q + dq, r: h.r + dr };
        const theirs = new Set(hexCorners(type, n).map(cornerKey));
        const [a, b] = corners.filter((c) => theirs.has(cornerKey(c)));
        return [n, edgeKey(a, b)];
      });
    },
    centre: (h) => hexCenter(type, h),
  };
}

/**
 * The areas closed off by walls next to the edges of a stroke: flooding
 * from either side of each edge, through anything but walls and floor, and
 * stopping within MAX_ENCLOSED_CELLS. Areas that start on floor are skipped.
 */
function enclosedAreas<C>(grid: Grid<C>, seeds: C[], walls: Set<string>, isFloor: (c: C) => boolean): C[][] {
  const visited = new Set<string>();
  const areas: C[][] = [];
  for (const seed of seeds) {
    if (visited.has(grid.key(seed)) || isFloor(seed)) continue;
    const area = new Map<string, C>([[grid.key(seed), seed]]);
    const queue = [seed];
    let open = false;
    while (queue.length > 0 && !open) {
      for (const [n, edge] of grid.neighbours(queue.pop()!)) {
        const key = grid.key(n);
        if (area.has(key) || walls.has(edge) || isFloor(n)) continue;
        area.set(key, n);
        queue.push(n);
        if (area.size > MAX_ENCLOSED_CELLS) {
          open = true;
          break;
        }
      }
    }
    for (const key of area.keys()) visited.add(key);
    if (!open) areas.push([...area.values()]);
  }
  return areas;
}

/**
 * Cells (square grid) or hexes (hex grid) closed off by the walls of `layers`
 * together with a stroke's edges, on either side of those edges
 */
export function enclosedByStroke(
  gridType: GridType,
  layers: MapLayer[],
  edges: [Pair, Pair][]
): { cells: GridCoord[]; hexes: Hex[] } {
  const walls = new Set(layers.flatMap((l) => l.walls.map(wallKey)));
  for (const [a, b] of edges) walls.add(edgeKey(a, b));
  const floorAt = ([x, y]: Pair) => layers.some((l) => isFloorAt(l, x, y));
  // The cells either side of each edge's middle
  const sides = edges.flatMap(([a, b]): Pair[] => {
    const [mx, my] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const [nx, ny] = [-(b[1] - a[1]) / length / 4, (b[0] - a[0]) / length / 4];
    return [[mx + nx, my + ny], [mx - nx, my - ny]];
  });

  if (isHexGrid(gridType)) {
    const grid = hexGrid(gridType);
    const seeds = sides.map(([x, y]) => hexAt(gridType, x, y));
    return { cells: [], hexes: enclosedAreas(grid, seeds, walls, (h) => floorAt(grid.centre(h))).flat() };
  }
  const seeds = sides.map(([x, y]) => ({ x: Math.floor(x), y: Math.floor(y) }));
  return { cells: enclosedAreas(squareGrid, seeds, walls, (c) => floorAt(squareGrid.centre(c))).flat(), hexes: [] };
}
