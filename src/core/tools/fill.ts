// The fill tool: re-textures the room under a point, up to its walls and
// doors, or floods it with a liquid and drains it again
import type { FloorTexture, GridType, MapLayer, Pair, PlacedDoor, PlacedWall, Polygon, WaterStyle } from '../../types/map';
import { closedWalls, doorEdgeKey, wallDoorEdge } from '../geometry/walls';
import { hexAt, hexCenter, hexKey, hexNeighbours, hexPolygon, isHexGrid, type Hex } from '../geometry/hex';
import type { WallSegment } from '../geometry/hatching';
import { doorLine } from './toolGeometry';
import {
  addWater,
  cellPolygons,
  drainWater,
  floorPieceAt,
  floorSegments,
  floorWithout,
  hasShapes,
  layerFloor,
  paintArea,
  paintWaterCells,
  pointInPolygons,
} from '../geometry/region';

// A fill never spreads further than this (an open outdoor map could be huge)
const MAX_CELLS = 40000;
// An angled door parts free-form floor along its line: out to the walls either
// side when they are this near (in cells; a doorway in a curved wall can be
// wider than the door), else half a cell, plus a little to close the seam
const BARRIER_REACH = 1.5;
const BARRIER_OVERLAP = 0.05;
const BARRIER_HALF_WIDTH = 0.005;
// Points tested to tell whether free-form floor reaches into a cell
const SAMPLES: [number, number][] = [[0.5, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];

/** True where a layer has floor at (x, y), in grid units */
export function isFloorAt(layer: MapLayer, x: number, y: number): boolean {
  return hasShapes(layer)
    ? pointInPolygons(layerFloor(layer), x, y)
    : !!layer.rooms[`${Math.floor(x)},${Math.floor(y)}`];
}

/** The floor texture at (x, y) on a layer, or null where it has no floor */
export function textureAt(layer: MapLayer, x: number, y: number): FloorTexture | null {
  if (!isFloorAt(layer, x, y)) return null;
  for (const [texture, polygons] of Object.entries(layer.floorAreas) as [FloorTexture, typeof layer.shapes][]) {
    if (pointInPolygons(polygons, x, y)) return texture;
  }
  const key = `${Math.floor(x)},${Math.floor(y)}`;
  return (layer.rooms[key] && layer.floors[key]) || 'plain';
}

/**
 * The room at (x, y): the floor connected to it, spreading cell by cell but
 * never through a door or a thin wall along a cell edge, nor across a door
 * turned along a wall off the grid (archways are open, so it passes those,
 * even on a wall). On free-form floor `piece` is its outline. On a hex
 * `grid` it spreads hex by hex instead. Null if there is no floor there.
 */
function roomAt(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number,
  grid?: GridType
): { cells: Map<string, [number, number]>; piece: Polygon | null } | null {
  if (!isFloorAt(layer, x, y)) return null;
  const shaped = hasShapes(layer);
  if (shaped && isHexGrid(grid)) {
    const piece = hexRoomAt(grid, layer, doors, walls, x, y);
    return piece ? { cells: new Map(), piece } : null;
  }
  const floor = shaped ? layerFloor(layer) : [];
  const isFloorCell = shaped
    ? (gx: number, gy: number) => SAMPLES.some(([sx, sy]) => pointInPolygons(floor, gx + sx, gy + sy))
    : (gx: number, gy: number) => !!layer.rooms[`${gx},${gy}`];
  const shut = doors.filter((d) => d.type !== 'archway');
  // Door edges as "h,x,y" (the top edge of cell x,y) or "v,x,y" (its left edge)
  const closed = new Set(shut.filter((d) => d.angle === undefined).map(doorEdgeKey));
  for (const wall of closedWalls(walls, doors)) {
    const edge = wallDoorEdge(wall);
    if (edge) closed.add(doorEdgeKey(edge));
  }

  const start = [Math.floor(x), Math.floor(y)];
  const cells = new Map<string, [number, number]>([[`${start[0]},${start[1]}`, [start[0], start[1]]]]);
  const queue: [number, number][] = [[start[0], start[1]]];
  while (queue.length > 0 && cells.size < MAX_CELLS) {
    const [cx, cy] = queue.pop()!;
    const steps: [number, number, string][] = [
      [cx, cy - 1, `h,${cx},${cy}`],
      [cx, cy + 1, `h,${cx},${cy + 1}`],
      [cx - 1, cy, `v,${cx},${cy}`],
      [cx + 1, cy, `v,${cx + 1},${cy}`],
    ];
    for (const [nx, ny, edge] of steps) {
      const key = `${nx},${ny}`;
      if (cells.has(key) || closed.has(edge) || !isFloorCell(nx, ny)) continue;
      cells.set(key, [nx, ny]);
      queue.push([nx, ny]);
    }
  }

  if (!shaped) return { cells, piece: null };
  // Free-form floor can reach past a door's cells, or bridge two rooms in a
  // cell they share, so keep only the floor joined to the point clicked. A
  // door turned along a wall off the grid parts the floor where it stands.
  const squares = cellPolygons(Object.fromEntries([...cells.keys()].map((key) => [key, true])));
  const angled = shut.filter((d) => d.angle !== undefined);
  const outline = angled.length > 0 ? floorSegments(floor, 1) : [];
  const barriers = angled.map((door) => doorBarrier(door, outline));
  const piece = floorPieceAt(squares, floorWithout(floor, barriers), x, y);
  return piece ? { cells, piece } : null;
}

/**
 * The room at (x, y) on a hex grid, as `roomAt`: the floor joined to it hex
 * by hex, never across a hex side with a wall or a shut door at its middle
 */
function hexRoomAt(
  grid: 'hex-pointy' | 'hex-flat',
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number
): Polygon | null {
  const floor = layerFloor(layer);
  // Middles of the hex sides that stop it, bucketed by half cell
  const stops = new Map<string, Pair[]>();
  const bucket = (px: number, py: number) => `${Math.floor(px * 2)},${Math.floor(py * 2)}`;
  const middles: Pair[] = [
    ...closedWalls(walls, doors).map((w): Pair => [w.x + w.dx / 2, w.y + w.dy / 2]),
    ...doors.filter((d) => d.type !== 'archway' && d.angle !== undefined).map((d): Pair => [d.x, d.y]),
  ];
  for (const m of middles) stops.set(bucket(...m), [...(stops.get(bucket(...m)) ?? []), m]);
  const stopped = (px: number, py: number) => {
    for (let bx = -1; bx <= 1; bx++) {
      for (let by = -1; by <= 1; by++) {
        const near = stops.get(bucket(px + bx / 2, py + by / 2));
        if (near?.some(([mx, my]) => Math.hypot(mx - px, my - py) < 0.05)) return true;
      }
    }
    return false;
  };

  const start = hexAt(grid, x, y);
  const hexes = new Map<string, Hex>([[hexKey(start), start]]);
  const queue = [start];
  while (queue.length > 0 && hexes.size < MAX_CELLS) {
    const h = queue.pop()!;
    const [ax, ay] = hexCenter(grid, h);
    for (const n of hexNeighbours(h)) {
      const key = hexKey(n);
      if (hexes.has(key)) continue;
      const [bx, by] = hexCenter(grid, n);
      if (stopped((ax + bx) / 2, (ay + by) / 2) || !pointInPolygons(floor, bx, by)) continue;
      hexes.set(key, n);
      queue.push(n);
    }
  }
  return floorPieceAt([...hexes.values()].map((h) => hexPolygon(grid, h)), floor, x, y);
}

/** A thin strip along an angled door, out to the walls either side, cut from the floor so a fill stops there */
function doorBarrier(door: PlacedDoor, walls: WallSegment[]): Polygon {
  const { cx, cy, ux, uy, length } = doorLine(door);
  const reach = (dx: number, dy: number) => {
    let nearest = BARRIER_REACH;
    for (const w of walls) {
      const t = rayHit(cx, cy, dx, dy, w);
      // Skip the wall a door stands on, where its line starts
      if (t !== null && t > 0.05 && t < nearest) nearest = t;
    }
    return (nearest < BARRIER_REACH ? Math.max(length / 2, nearest) : length / 2) + BARRIER_OVERLAP;
  };
  const [back, ahead] = [reach(-ux, -uy), reach(ux, uy)];
  const [nx, ny] = [-uy * BARRIER_HALF_WIDTH, ux * BARRIER_HALF_WIDTH];
  const ring: Pair[] = [
    [cx - ux * back - nx, cy - uy * back - ny],
    [cx + ux * ahead - nx, cy + uy * ahead - ny],
    [cx + ux * ahead + nx, cy + uy * ahead + ny],
    [cx - ux * back + nx, cy - uy * back + ny],
  ];
  return [[...ring, ring[0]]];
}

/** How far along the ray from (x, y) in direction (dx, dy) it crosses a wall, or null if it misses */
function rayHit(x: number, y: number, dx: number, dy: number, w: WallSegment): number | null {
  const [ex, ey] = [w.x2 - w.x1, w.y2 - w.y1];
  const denom = dx * ey - dy * ex;
  if (Math.abs(denom) < 1e-12) return null;
  const [ox, oy] = [w.x1 - x, w.y1 - y];
  const t = (ox * ey - oy * ex) / denom;
  const s = (ox * dy - oy * dx) / denom;
  return t >= 0 && s >= 0 && s <= 1 ? t : null;
}

/** Lays `texture` over the room at (x, y) (spreading in hexes on a hex `grid`). Returns false if there is no floor there. */
export function fillRoom(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number,
  texture: FloorTexture,
  grid?: GridType
): boolean {
  const room = roomAt(layer, doors, walls, x, y, grid);
  if (!room) return false;
  const { cells, piece } = room;
  if (!piece) {
    for (const key of cells.keys()) setCellTexture(layer, key, texture);
    return true;
  }
  for (const [key, [gx, gy]] of cells) {
    if (layer.rooms[key] && pointInPolygons([piece], gx + 0.5, gy + 0.5)) setCellTexture(layer, key, texture);
  }
  paintArea(layer, [piece], texture);
  return true;
}

/**
 * Floods the room at (x, y) with a liquid, right up to its walls, replacing
 * any other liquid in it. Returns false if there is no floor there.
 */
export function floodRoom(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number,
  style: WaterStyle,
  grid?: GridType
): boolean {
  const room = roomAt(layer, doors, walls, x, y, grid);
  if (!room) return false;
  if (room.piece) addWater(layer, [room.piece], style);
  else paintWaterCells(layer, [...room.cells.values()].map(([gx, gy]) => ({ x: gx, y: gy })), style);
  return true;
}

/** Takes every liquid out of the room at (x, y). Returns false if there is no floor there. */
export function drainRoom(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number,
  grid?: GridType
): boolean {
  const room = roomAt(layer, doors, walls, x, y, grid);
  if (!room) return false;
  if (room.piece) {
    drainWater(layer, [room.piece]);
  } else {
    const keys = [...room.cells.keys()];
    drainWater(layer, cellPolygons(Object.fromEntries(keys.map((key) => [key, true]))), keys);
  }
  return true;
}

function setCellTexture(layer: MapLayer, key: string, texture: FloorTexture) {
  if (texture === 'plain') delete layer.floors[key];
  else layer.floors[key] = texture;
}
