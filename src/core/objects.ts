// Selectable map objects (doors, stairs, props, labels): hit testing, bounds and edits
import type {
  LayerContent,
  MapData,
  MapLayer,
  PlacedDoor,
  PlacedLabel,
  PlacedProp,
  PlacedStairs,
  Selection,
} from '../types/map';
import { nearestDoorEdge, stairsContainCell } from './tools/toolGeometry';
import { measureLabel } from './renderers/labelRenderer';
import { findLayer, isLayerEditable } from './layers';

// How close (in cells) the pointer must be to a door's wall edge to pick it
const DOOR_HIT_DISTANCE = 0.3;

export function newObjectId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function findDoor(layer: LayerContent, id: string): PlacedDoor | undefined {
  return layer.doors.find((d) => d.id === id);
}
export function findStairs(layer: LayerContent, id: string): PlacedStairs | undefined {
  return layer.stairs.find((s) => s.id === id);
}
export function findProp(layer: LayerContent, id: string): PlacedProp | undefined {
  return layer.props.find((p) => p.id === id);
}
export function findLabel(layer: LayerContent, id: string): PlacedLabel | undefined {
  return layer.labels.find((l) => l.id === id);
}

/** Label extent in grid units */
function labelBounds(label: PlacedLabel, gridSize: number) {
  const { width, height } = measureLabel(label);
  const w = Math.max(width, label.size) / gridSize;
  const h = height / gridSize;
  return { x: label.x - w / 2, y: label.y - h / 2, w, h };
}

/** The selected object, or undefined if it no longer exists (e.g. after undo) */
export function findSelected(
  map: MapData,
  sel: Selection | null
): PlacedDoor | PlacedStairs | PlacedProp | PlacedLabel | undefined {
  const layer = sel ? findLayer(map, sel.layerId) : undefined;
  if (!sel || !layer) return undefined;
  if (sel.kind === 'door') return findDoor(layer, sel.id);
  if (sel.kind === 'stairs') return findStairs(layer, sel.id);
  if (sel.kind === 'label') return findLabel(layer, sel.id);
  return findProp(layer, sel.id);
}

/**
 * Topmost object under a world position on a shown, unlocked layer. Labels
 * are drawn above every layer, so they are hit first; then doors, props and
 * stairs, from the top layer down.
 */
export function hitTestObject(map: MapData, worldX: number, worldY: number): Selection | null {
  const layers = map.layers.filter(isLayerEditable).reverse();
  for (const layer of layers) {
    const hit = hitTestLabel(layer, worldX, worldY, map.gridSize);
    if (hit) return hit;
  }
  for (const layer of layers) {
    const hit = hitTestShape(layer, worldX, worldY, map.gridSize);
    if (hit) return hit;
  }
  return null;
}

function hitTestLabel(layer: MapLayer, worldX: number, worldY: number, gridSize: number): Selection | null {
  const px = worldX / gridSize;
  const py = worldY / gridSize;
  for (let i = layer.labels.length - 1; i >= 0; i--) {
    const b = labelBounds(layer.labels[i], gridSize);
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      return { kind: 'label', id: layer.labels[i].id, layerId: layer.id };
    }
  }
  return null;
}

function hitTestShape(layer: MapLayer, worldX: number, worldY: number, gridSize: number): Selection | null {
  const gx = Math.floor(worldX / gridSize);
  const gy = Math.floor(worldY / gridSize);
  const layerId = layer.id;

  const edge = nearestDoorEdge(worldX, worldY, gridSize);
  const edgeDistance =
    edge.orientation === 'horizontal'
      ? Math.abs(worldY / gridSize - edge.y)
      : Math.abs(worldX / gridSize - edge.x);
  if (edgeDistance <= DOOR_HIT_DISTANCE) {
    const door = layer.doors.find(
      (d) => d.x === edge.x && d.y === edge.y && d.orientation === edge.orientation
    );
    if (door) return { kind: 'door', id: door.id, layerId };
  }

  for (let i = layer.props.length - 1; i >= 0; i--) {
    const p = layer.props[i];
    if (p.x === gx && p.y === gy) return { kind: 'prop', id: p.id, layerId };
  }
  for (let i = layer.stairs.length - 1; i >= 0; i--) {
    const s = layer.stairs[i];
    if (stairsContainCell(s, gx, gy)) return { kind: 'stairs', id: s.id, layerId };
  }
  return null;
}

/** Selection outline in grid units */
export function objectBounds(
  map: MapData,
  sel: Selection
): { x: number; y: number; w: number; h: number } | null {
  const layer = findLayer(map, sel.layerId);
  if (!layer) return null;
  if (sel.kind === 'door') {
    const d = findDoor(layer, sel.id);
    if (!d) return null;
    return d.orientation === 'horizontal'
      ? { x: d.x, y: d.y - 0.2, w: 1, h: 0.4 }
      : { x: d.x - 0.2, y: d.y, w: 0.4, h: 1 };
  }
  if (sel.kind === 'stairs') {
    const s = findStairs(layer, sel.id);
    return s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null;
  }
  if (sel.kind === 'label') {
    const l = findLabel(layer, sel.id);
    return l ? labelBounds(l, map.gridSize) : null;
  }
  const p = findProp(layer, sel.id);
  return p ? { x: p.x, y: p.y, w: 1, h: 1 } : null;
}

const STAIR_DIRECTIONS: PlacedStairs['direction'][] = ['up', 'right', 'down', 'left'];

/** Rotates the selected object 90° clockwise (in place on a draft map) */
export function rotateObject(draft: MapData, sel: Selection) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'door') {
    const d = findDoor(layer, sel.id);
    if (!d) return;
    replaceDoor(layer, {
      ...d,
      orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    });
  } else if (sel.kind === 'stairs') {
    const s = findStairs(layer, sel.id);
    if (!s) return;
    const next = STAIR_DIRECTIONS[(STAIR_DIRECTIONS.indexOf(s.direction) + 1) % 4];
    replaceStairs(layer, { ...s, direction: next, width: s.height, height: s.width });
  } else if (sel.kind === 'prop') {
    const p = findProp(layer, sel.id);
    if (!p) return;
    replaceProp(layer, { ...p, rotation: (p.rotation + 90) % 360 });
  }
}

export function deleteObject(draft: MapData, sel: Selection) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'door') layer.doors = layer.doors.filter((d) => d.id !== sel.id);
  else if (sel.kind === 'stairs') layer.stairs = layer.stairs.filter((s) => s.id !== sel.id);
  else if (sel.kind === 'label') layer.labels = layer.labels.filter((l) => l.id !== sel.id);
  else layer.props = layer.props.filter((p) => p.id !== sel.id);
}

// Draft layers hold shallow copies, so objects are replaced rather than mutated
export function replaceDoor(layer: LayerContent, door: PlacedDoor) {
  layer.doors = layer.doors.map((d) => (d.id === door.id ? door : d));
}
export function replaceStairs(layer: LayerContent, stairs: PlacedStairs) {
  layer.stairs = layer.stairs.map((s) => (s.id === stairs.id ? stairs : s));
}
export function replaceProp(layer: LayerContent, prop: PlacedProp) {
  layer.props = layer.props.map((p) => (p.id === prop.id ? prop : p));
}
export function replaceLabel(layer: LayerContent, label: PlacedLabel) {
  layer.labels = layer.labels.map((l) => (l.id === label.id ? label : l));
}
