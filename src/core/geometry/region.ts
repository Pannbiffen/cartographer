// Free-form floor: a layer's cells and shapes merged into one outline, with
// its cuts taken out. Walls, hatching, lighting and VTT walls follow it.
import * as clipping from 'polygon-clipping';
import type { FloorTexture, GridCoord, LayerContent, MapLayer, Pair, Polygon, Ring, ShapeMode } from '../../types/map';
import { extractWallSegments, type WallSegment } from './hatching';

// The package's types list named exports, but its ES build only has a default one
const { union, difference } = (clipping as unknown as { default: typeof clipping }).default;

type Cells = { [key: string]: boolean };

/** True when a layer has free-form floor, so the cells alone don't describe it */
export function hasShapes(layer: LayerContent): boolean {
  return layer.shapes.length > 0 || layer.cuts.length > 0;
}

function rect(x0: number, y0: number, x1: number, y1: number): Polygon {
  return [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
}

/** Cells as few rectangles as is quick: runs along each row, stacked where rows repeat */
export function cellPolygons(cells: Cells): Polygon[] {
  const rows = new Map<number, number[]>();
  for (const key of Object.keys(cells)) {
    if (!cells[key]) continue;
    const [x, y] = key.split(',').map(Number);
    const row = rows.get(y);
    if (row) row.push(x);
    else rows.set(y, [x]);
  }

  const polygons: Polygon[] = [];
  let open = new Map<string, { x0: number; x1: number; y0: number; y1: number }>();
  const close = (r: { x0: number; x1: number; y0: number; y1: number }) => polygons.push(rect(r.x0, r.y0, r.x1, r.y1));
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = rows.get(y)!.sort((a, b) => a - b);
    const next = new Map<string, { x0: number; x1: number; y0: number; y1: number }>();
    for (let i = 0; i < xs.length; ) {
      let j = i;
      while (j + 1 < xs.length && xs[j + 1] === xs[j] + 1) j++;
      const key = `${xs[i]},${xs[j] + 1}`;
      const above = open.get(key);
      if (above && above.y1 === y) {
        above.y1 = y + 1;
        open.delete(key);
        next.set(key, above);
      } else {
        next.set(key, { x0: xs[i], x1: xs[j] + 1, y0: y, y1: y + 1 });
      }
      i = j + 1;
    }
    for (const r of open.values()) close(r);
    open = next;
  }
  for (const r of open.values()) close(r);
  return polygons;
}

function computeFloor(layer: LayerContent): Polygon[] {
  const parts = [...cellPolygons(layer.rooms), ...layer.shapes];
  if (parts.length === 0) return [];
  try {
    const floor = union(parts[0], ...parts.slice(1));
    return layer.cuts.length > 0 ? difference(floor, layer.cuts) : floor;
  } catch (err) {
    console.warn('Could not merge floor shapes', err);
    return cellPolygons(layer.rooms);
  }
}

// Merged floors by layer object (each frame draws the same map) and by layer
// id (every edit copies each layer's cells, so compare those by content)
const byLayer = new WeakMap<MapLayer, Polygon[]>();
const byId = new Map<string, { cells: string; shapes: Polygon[]; cuts: Polygon[]; floor: Polygon[] }>();

/** A layer's whole floor as polygons in grid units */
export function layerFloor(layer: MapLayer): Polygon[] {
  const known = byLayer.get(layer);
  if (known) return known;
  const cells = Object.keys(layer.rooms).join(';');
  const cached = byId.get(layer.id);
  let floor: Polygon[];
  if (cached && cached.cells === cells && cached.shapes === layer.shapes && cached.cuts === layer.cuts) {
    floor = cached.floor;
  } else {
    floor = computeFloor(layer);
    byId.set(layer.id, { cells, shapes: layer.shapes, cuts: layer.cuts, floor });
  }
  byLayer.set(layer, floor);
  return floor;
}

/** Drops a closing point that repeats the first */
function openRing(ring: Ring): Ring {
  const [first, last] = [ring[0], ring[ring.length - 1]];
  return ring.length > 1 && first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/**
 * The outline of floor polygons as wall segments in pixels, each pointing
 * away from the floor and at most a cell long (so hatching and rough pen
 * walls look the same along shapes as along cells)
 */
export function floorSegments(floor: Polygon[], gridSize: number): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const polygon of floor) {
    polygon.forEach((closed, ringIndex) => {
      const ring = openRing(closed);
      // Floor lies inside the outline and outside its holes
      const away = (signedArea(ring) > 0 ? 1 : -1) * (ringIndex === 0 ? -1 : 1);
      for (let i = 0; i < ring.length; i++) {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1e-9) continue;
        // (-dy, dx) points into a ring of positive area
        const normalX = (away * -(by - ay)) / len;
        const normalY = (away * (bx - ax)) / len;
        const pieces = Math.ceil(len - 1e-6);
        for (let p = 0; p < pieces; p++) {
          const t1 = p / pieces;
          const t2 = (p + 1) / pieces;
          segments.push({
            x1: (ax + (bx - ax) * t1) * gridSize,
            y1: (ay + (by - ay) * t1) * gridSize,
            x2: (ax + (bx - ax) * t2) * gridSize,
            y2: (ay + (by - ay) * t2) * gridSize,
            normalX,
            normalY,
          });
        }
      }
    });
  }
  return segments;
}

/** Floor polygons as a path in pixels, to fill or clip with the even-odd rule */
export function floorPath(floor: Polygon[], gridSize: number): Path2D {
  const path = new Path2D();
  for (const polygon of floor) {
    for (const ring of polygon) {
      openRing(ring).forEach(([x, y], i) =>
        i === 0 ? path.moveTo(x * gridSize, y * gridSize) : path.lineTo(x * gridSize, y * gridSize)
      );
      path.closePath();
    }
  }
  return path;
}

/** Walls around the floor of all the given layers together (what blocks light and VTT tokens) */
export function combinedWalls(layers: MapLayer[], gridSize: number): WallSegment[] {
  if (!layers.some(hasShapes)) {
    return extractWallSegments(Object.assign({}, ...layers.map((l) => l.rooms)), gridSize);
  }
  const floors = layers.map(layerFloor).filter((f) => f.length > 0);
  if (floors.length === 0) return [];
  return floorSegments(union(floors[0], ...floors.slice(1)), gridSize);
}

/** Extent of a layer's shapes in grid units, or null if it has none */
export function shapeBounds(layer: LayerContent): { minX: number; minY: number; maxX: number; maxY: number } | null {
  return layer.shapes.length === 0 ? null : polygonBounds(layer.shapes);
}

/**
 * Adds a shape to a layer's floor, laid with `texture`, or cuts it away.
 * Cuts and shapes never overlap, so the most recent one wins wherever they meet.
 */
export function applyShape(layer: LayerContent, shape: Polygon[], mode: ShapeMode, texture: FloorTexture = 'plain') {
  if (shape.length === 0) return;
  guarded(layer, () => {
    if (mode === 'add') {
      layer.shapes = union(shape, ...layer.shapes);
      if (layer.cuts.length > 0) layer.cuts = difference(layer.cuts, shape);
      layArea(layer, shape, texture);
    } else {
      layer.cuts = union(shape, ...layer.cuts);
      if (layer.shapes.length > 0) layer.shapes = difference(layer.shapes, shape);
      clearAreas(layer, shape);
    }
  });
}

/**
 * Lays `texture` over an area of a layer's floor, replacing whatever texture
 * was there. A plain area is only kept where it hides textured cells.
 */
export function paintArea(layer: LayerContent, area: Polygon[], texture: FloorTexture) {
  if (area.length > 0) guarded(layer, () => layArea(layer, area, texture));
}

function layArea(layer: LayerContent, area: Polygon[], texture: FloorTexture) {
  clearAreas(layer, area);
  if (texture === 'plain' && !coversTexturedCells(layer, area)) return;
  layer.floorAreas = { ...layer.floorAreas, [texture]: union(area, ...(layer.floorAreas[texture] ?? [])) };
}

/** Takes an area out of every textured area, so cell textures show there again */
function clearAreas(layer: LayerContent, area: Polygon[]) {
  if (!hasFloorAreas(layer)) return;
  const areas = { ...layer.floorAreas };
  for (const texture of Object.keys(areas) as FloorTexture[]) {
    const left = difference(areas[texture]!, area);
    if (left.length > 0) areas[texture] = left;
    else delete areas[texture];
  }
  layer.floorAreas = areas;
}

/** True if any textured cell lies within the area's bounds */
function coversTexturedCells(layer: LayerContent, area: Polygon[]): boolean {
  const b = polygonBounds(area);
  for (const key of Object.keys(layer.floors)) {
    const [x, y] = key.split(',').map(Number);
    if (layer.rooms[key] && x + 1 > b.minX && x < b.maxX && y + 1 > b.minY && y < b.maxY) return true;
  }
  return false;
}

/** True when a layer has textured free-form floor */
export function hasFloorAreas(layer: LayerContent): boolean {
  return Object.keys(layer.floorAreas).length > 0;
}

/** Extent of polygons' outer rings in grid units */
export function polygonBounds(polygons: Polygon[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const polygon of polygons) {
    for (const [x, y] of polygon[0]) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Runs a shape edit, leaving the layer's shapes as they were if the geometry fails */
function guarded(layer: LayerContent, edit: () => void) {
  const { shapes, cuts, floorAreas } = layer;
  try {
    edit();
  } catch (err) {
    console.warn('Shape edit failed', err);
    layer.shapes = shapes;
    layer.cuts = cuts;
    layer.floorAreas = floorAreas;
  }
}

/** Cells just drawn take back any cuts and textured areas they cover, so the newest edit wins */
export function uncutCells(layer: LayerContent, cells: GridCoord[]) {
  if ((layer.cuts.length === 0 && !hasFloorAreas(layer)) || cells.length === 0) return;
  const squares = cellPolygons(cellSet(cells));
  guarded(layer, () => {
    if (layer.cuts.length > 0) layer.cuts = difference(layer.cuts, squares);
    clearAreas(layer, squares);
  });
}

/** Erased cells take shapes, cuts and textured areas with them */
export function eraseShapesInCells(layer: LayerContent, cells: GridCoord[]) {
  if ((!hasShapes(layer) && !hasFloorAreas(layer)) || cells.length === 0) return;
  const squares = cellPolygons(cellSet(cells));
  guarded(layer, () => {
    if (layer.shapes.length > 0) layer.shapes = difference(layer.shapes, squares);
    if (layer.cuts.length > 0) layer.cuts = difference(layer.cuts, squares);
    clearAreas(layer, squares);
  });
}

function cellSet(cells: GridCoord[]): Cells {
  const set: Cells = {};
  for (const c of cells) set[`${c.x},${c.y}`] = true;
  return set;
}

// Shape builders, all in grid units

export function circlePolygon(cx: number, cy: number, radius: number): Polygon {
  const n = Math.min(160, Math.max(24, Math.ceil(Math.PI * 2 * radius * 3)));
  const ring: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  ring.push(ring[0]);
  return [ring];
}

/** An outline through `points` in order, closed back to the first */
export function polygonFromPoints(points: Pair[]): Polygon[] {
  if (points.length < 3) return [];
  // Merging the outline with nothing resolves any place it crosses itself
  return union([[...points, points[0]]]);
}

/**
 * A corridor `width` wide along a line through `points`, with square ends
 * and mitred bends (bevelled where a bend is too sharp to mitre)
 */
export function pathPolygon(points: Pair[], width: number): Polygon[] {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1]);
  if (pts.length < 2) return [];
  const half = width / 2;
  const parts: Polygon[] = [];
  const dirs = pts.slice(1).map((p, i) => {
    const len = Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]);
    return [(p[0] - pts[i][0]) / len, (p[1] - pts[i][1]) / len] as Pair;
  });

  dirs.forEach(([dx, dy], i) => {
    // Square ends reach half the width past the first and last points
    const startCap = i === 0 ? half : 0;
    const endCap = i === dirs.length - 1 ? half : 0;
    const [ax, ay] = [pts[i][0] - dx * startCap, pts[i][1] - dy * startCap];
    const [bx, by] = [pts[i + 1][0] + dx * endCap, pts[i + 1][1] + dy * endCap];
    const [nx, ny] = [-dy * half, dx * half];
    parts.push([[[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny], [ax + nx, ay + ny]]]);
  });

  // Fill the outside of each bend
  for (let i = 1; i < pts.length - 1; i++) {
    const [d1, d2] = [dirs[i - 1], dirs[i]];
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    if (Math.abs(cross) < 1e-9) continue;
    const side = cross > 0 ? -1 : 1; // the outer side of the turn
    const [px, py] = pts[i];
    const a: Pair = [px - d1[1] * half * side, py + d1[0] * half * side];
    const b: Pair = [px - d2[1] * half * side, py + d2[0] * half * side];
    const cosTurn = d1[0] * d2[0] + d1[1] * d2[1];
    const mitreLength = half / Math.sqrt((1 + cosTurn) / 2);
    if (mitreLength <= half * 2) {
      // The mitre point sits along the bisector of the two outer edges
      const [mx, my] = [(a[0] + b[0]) / 2 - px, (a[1] + b[1]) / 2 - py];
      const m = Math.hypot(mx, my);
      parts.push([[[px, py], a, [px + (mx / m) * mitreLength, py + (my / m) * mitreLength], b, [px, py]]]);
    } else {
      parts.push([[[px, py], a, b, [px, py]]]);
    }
  }
  return union(parts[0], ...parts.slice(1));
}
