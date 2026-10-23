// The fill tool: re-textures the room under a point, up to its walls and
// doors, or floods it with a liquid and drains it again
import type { FloorTexture, MapLayer, PlacedDoor, PlacedWall, Polygon, WaterStyle } from '../../types/map';
import { closedWalls, doorEdgeKey, wallDoorEdge } from '../geometry/walls';
import {
  addWater,
  cellPolygons,
  drainWater,
  floorPieceAt,
  hasShapes,
  layerFloor,
  paintArea,
  paintWaterCells,
  pointInPolygons,
} from '../geometry/region';

// A fill never spreads further than this (an open outdoor map could be huge)
const MAX_CELLS = 40000;
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
 * never through a door or a thin wall along a cell edge (archways are open,
 * so it passes those, even on a wall). On free-form floor `piece` is its
 * outline. Null if there is no floor there.
 */
function roomAt(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number
): { cells: Map<string, [number, number]>; piece: Polygon | null } | null {
  if (!isFloorAt(layer, x, y)) return null;
  const shaped = hasShapes(layer);
  const floor = shaped ? layerFloor(layer) : [];
  const isFloorCell = shaped
    ? (gx: number, gy: number) => SAMPLES.some(([sx, sy]) => pointInPolygons(floor, gx + sx, gy + sy))
    : (gx: number, gy: number) => !!layer.rooms[`${gx},${gy}`];
  // Door edges as "h,x,y" (the top edge of cell x,y) or "v,x,y" (its left edge)
  const closed = new Set(doors.filter((d) => d.type !== 'archway').map(doorEdgeKey));
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
  // cell they share, so keep only the floor joined to the point clicked
  const squares = cellPolygons(Object.fromEntries([...cells.keys()].map((key) => [key, true])));
  const piece = floorPieceAt(squares, floor, x, y);
  return piece ? { cells, piece } : null;
}

/** Lays `texture` over the room at (x, y). Returns false if there is no floor there. */
export function fillRoom(
  layer: MapLayer,
  doors: PlacedDoor[],
  walls: PlacedWall[],
  x: number,
  y: number,
  texture: FloorTexture
): boolean {
  const room = roomAt(layer, doors, walls, x, y);
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
  style: WaterStyle
): boolean {
  const room = roomAt(layer, doors, walls, x, y);
  if (!room) return false;
  if (room.piece) addWater(layer, [room.piece], style);
  else paintWaterCells(layer, [...room.cells.values()].map(([gx, gy]) => ({ x: gx, y: gy })), style);
  return true;
}

/** Takes every liquid out of the room at (x, y). Returns false if there is no floor there. */
export function drainRoom(layer: MapLayer, doors: PlacedDoor[], walls: PlacedWall[], x: number, y: number): boolean {
  const room = roomAt(layer, doors, walls, x, y);
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
