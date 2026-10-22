// Selectable map objects (doors, stairs, props, labels, lights): hit testing, bounds and edits
import type {
  LayerContent,
  LevelMap,
  MapData,
  MapLayer,
  PlacedDoor,
  PlacedLabel,
  PlacedLight,
  PlacedProp,
  PlacedStairs,
  PlacedWall,
  Selection,
} from '../types/map';
import { nearestDoorEdge, stairsContainCell } from './tools/toolGeometry';
import { measureLabel } from './renderers/labelRenderer';
import { findLayer, isLayerEditable } from './layers';
import { distanceToWall, wallKey } from './geometry/walls';

// How close (in cells) the pointer must be to a door's wall edge to pick it
const DOOR_HIT_DISTANCE = 0.3;

export function newObjectId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function findDoor(layer: LayerContent, id: string): PlacedDoor | undefined {
  return layer.doors.find((d) => d.id === id);
}
export function findWall(layer: LayerContent, id: string): PlacedWall | undefined {
  return layer.walls.find((w) => w.id === id);
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
export function findLight(layer: LayerContent, id: string): PlacedLight | undefined {
  return layer.lights.find((l) => l.id === id);
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
  map: MapData | LevelMap,
  sel: Selection | null
): PlacedDoor | PlacedWall | PlacedStairs | PlacedProp | PlacedLabel | PlacedLight | undefined {
  const layer = sel ? findLayer(map, sel.layerId) : undefined;
  if (!sel || !layer) return undefined;
  if (sel.kind === 'door') return findDoor(layer, sel.id);
  if (sel.kind === 'wall') return findWall(layer, sel.id);
  if (sel.kind === 'stairs') return findStairs(layer, sel.id);
  if (sel.kind === 'label') return findLabel(layer, sel.id);
  if (sel.kind === 'light') return findLight(layer, sel.id);
  return findProp(layer, sel.id);
}

/**
 * Topmost object under a world position on a shown, unlocked layer. Labels
 * are drawn above every layer, so they are hit first; then doors, walls,
 * lights, props and stairs, from the top layer down.
 */
export function hitTestObject(map: LevelMap, worldX: number, worldY: number): Selection | null {
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
  const px = worldX / gridSize;
  const py = worldY / gridSize;
  for (let i = layer.walls.length - 1; i >= 0; i--) {
    const w = layer.walls[i];
    if (distanceToWall(w, px, py) <= DOOR_HIT_DISTANCE) return { kind: 'wall', id: w.id, layerId };
  }

  for (let i = layer.lights.length - 1; i >= 0; i--) {
    const l = layer.lights[i];
    if (l.x === gx && l.y === gy) return { kind: 'light', id: l.id, layerId };
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

export function sameSelection(a: Selection, b: Selection): boolean {
  return a.id === b.id && a.layerId === b.layerId;
}

/** Every object on a shown, unlocked layer whose outline overlaps a box in grid units */
export function objectsInBox(map: LevelMap, box: { x: number; y: number; w: number; h: number }): Selection[] {
  const found: Selection[] = [];
  for (const layer of map.layers.filter(isLayerEditable)) {
    const layerId = layer.id;
    const objects: Selection[] = [
      ...layer.doors.map((d) => ({ kind: 'door' as const, id: d.id, layerId })),
      ...layer.walls.map((w) => ({ kind: 'wall' as const, id: w.id, layerId })),
      ...layer.stairs.map((s) => ({ kind: 'stairs' as const, id: s.id, layerId })),
      ...layer.props.map((p) => ({ kind: 'prop' as const, id: p.id, layerId })),
      ...layer.lights.map((l) => ({ kind: 'light' as const, id: l.id, layerId })),
      ...layer.labels.map((l) => ({ kind: 'label' as const, id: l.id, layerId })),
    ];
    for (const sel of objects) {
      const b = objectBounds(map, sel);
      if (b && b.x <= box.x + box.w && b.x + b.w >= box.x && b.y <= box.y + box.h && b.y + b.h >= box.y) {
        found.push(sel);
      }
    }
  }
  return found;
}

/** Selection outline in grid units */
export function objectBounds(
  map: MapData | LevelMap,
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
  if (sel.kind === 'wall') {
    const w = findWall(layer, sel.id);
    if (!w) return null;
    // As thick as a door's outline across the wall
    const padX = Math.abs(w.dx) < 0.4 ? 0.2 : 0;
    const padY = Math.abs(w.dy) < 0.4 ? 0.2 : 0;
    return {
      x: Math.min(w.x, w.x + w.dx) - padX,
      y: Math.min(w.y, w.y + w.dy) - padY,
      w: Math.abs(w.dx) + padX * 2,
      h: Math.abs(w.dy) + padY * 2,
    };
  }
  if (sel.kind === 'stairs') {
    const s = findStairs(layer, sel.id);
    return s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null;
  }
  if (sel.kind === 'label') {
    const l = findLabel(layer, sel.id);
    return l ? labelBounds(l, map.gridSize) : null;
  }
  const p = sel.kind === 'light' ? findLight(layer, sel.id) : findProp(layer, sel.id);
  return p ? { x: p.x, y: p.y, w: 1, h: 1 } : null;
}

const STAIR_DIRECTIONS: PlacedStairs['direction'][] = ['up', 'right', 'down', 'left'];

/** Rotates the selected object 90° clockwise (in place on a draft map) */
export function rotateObject(draft: MapData | LevelMap, sel: Selection) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'door') {
    const d = findDoor(layer, sel.id);
    if (!d) return;
    replaceDoor(layer, {
      ...d,
      orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    });
  } else if (sel.kind === 'wall') {
    // A quarter turn about its first corner, which only stays on a square grid
    const w = findWall(layer, sel.id);
    if (w && Number.isInteger(w.dx) && Number.isInteger(w.dy)) replaceWall(layer, { ...w, dx: -w.dy, dy: w.dx });
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

export function deleteObject(draft: MapData | LevelMap, sel: Selection) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'door') layer.doors = layer.doors.filter((d) => d.id !== sel.id);
  else if (sel.kind === 'wall') layer.walls = layer.walls.filter((w) => w.id !== sel.id);
  else if (sel.kind === 'stairs') layer.stairs = layer.stairs.filter((s) => s.id !== sel.id);
  else if (sel.kind === 'label') layer.labels = layer.labels.filter((l) => l.id !== sel.id);
  else if (sel.kind === 'light') layer.lights = layer.lights.filter((l) => l.id !== sel.id);
  else layer.props = layer.props.filter((p) => p.id !== sel.id);
}

/**
 * Moves the selected object one step in direction (dx, dy): labels by
 * `labelStep` cells, grid-snapped objects by a whole cell. A door or wall
 * won't move onto an edge another one already uses.
 */
export function nudgeObject(draft: MapData | LevelMap, sel: Selection, dx: number, dy: number, labelStep: number) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'label') {
    const l = findLabel(layer, sel.id);
    if (l) replaceLabel(layer, { ...l, x: l.x + dx * labelStep, y: l.y + dy * labelStep });
  } else if (sel.kind === 'door') {
    const d = findDoor(layer, sel.id);
    if (!d) return;
    const moved = { ...d, x: d.x + dx, y: d.y + dy };
    const occupied = layer.doors.some(
      (o) => o.id !== d.id && o.x === moved.x && o.y === moved.y && o.orientation === moved.orientation
    );
    if (!occupied) replaceDoor(layer, moved);
  } else if (sel.kind === 'wall') {
    const w = findWall(layer, sel.id);
    if (!w) return;
    const moved = { ...w, x: w.x + dx, y: w.y + dy };
    const key = wallKey(moved);
    if (!layer.walls.some((o) => o.id !== w.id && wallKey(o) === key)) replaceWall(layer, moved);
  } else if (sel.kind === 'stairs') {
    const s = findStairs(layer, sel.id);
    if (s) replaceStairs(layer, { ...s, x: s.x + dx, y: s.y + dy });
  } else if (sel.kind === 'light') {
    const l = findLight(layer, sel.id);
    if (l) replaceLight(layer, { ...l, x: l.x + dx, y: l.y + dy });
  } else {
    const p = findProp(layer, sel.id);
    if (p) replaceProp(layer, { ...p, x: p.x + dx, y: p.y + dy });
  }
}

/** Where each selected object was, so a group can be moved from there */
export interface ObjectOrigin {
  sel: Selection;
  x: number;
  y: number;
}

export function objectOrigins(map: MapData | LevelMap, sels: Selection[]): ObjectOrigin[] {
  return sels.flatMap((sel) => {
    const object = findSelected(map, sel);
    return object ? [{ sel, x: object.x, y: object.y }] : [];
  });
}

/**
 * Puts each object (dx, dy) from its origin, keeping a group's layout. Nothing
 * moves if a door would land on an edge a door outside the group already uses.
 */
export function moveObjects(draft: MapData | LevelMap, origins: ObjectOrigin[], dx: number, dy: number) {
  const moving = new Set(origins.map((o) => o.sel.id));
  const blocked = origins.some((o) => {
    const layer = o.sel.kind === 'door' ? findLayer(draft, o.sel.layerId) : undefined;
    const door = layer && findDoor(layer, o.sel.id);
    return (
      door &&
      layer.doors.some(
        (d) => !moving.has(d.id) && d.x === o.x + dx && d.y === o.y + dy && d.orientation === door.orientation
      )
    );
  });
  if (blocked) return;
  for (const { sel, x, y } of origins) {
    const layer = findLayer(draft, sel.layerId);
    const object = layer && findSelected(draft, sel);
    if (layer && object) replaceObject(layer, { kind: sel.kind, object: { ...object, x: x + dx, y: y + dy } } as CopiedObject);
  }
}

/** Nudges one object as `nudgeObject` does, or a group by whole cells */
export function nudgeObjects(draft: MapData | LevelMap, sels: Selection[], dx: number, dy: number, labelStep: number) {
  if (sels.length === 1) nudgeObject(draft, sels[0], dx, dy, labelStep);
  else moveObjects(draft, objectOrigins(draft, sels), dx, dy);
}

export function rotateObjects(draft: MapData | LevelMap, sels: Selection[]) {
  for (const sel of sels) rotateObject(draft, sel);
}

export function deleteObjects(draft: MapData | LevelMap, sels: Selection[]) {
  for (const sel of sels) deleteObject(draft, sel);
}

/** Switches a door's or prop's type, or a label's style */
export function retypeObject(draft: MapData | LevelMap, sel: Selection, type: string) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  const door = sel.kind === 'door' ? findDoor(layer, sel.id) : undefined;
  const prop = sel.kind === 'prop' ? findProp(layer, sel.id) : undefined;
  const label = sel.kind === 'label' ? findLabel(layer, sel.id) : undefined;
  if (door) replaceDoor(layer, { ...door, type: type as PlacedDoor['type'] });
  if (prop) replaceProp(layer, { ...prop, type: type as PlacedProp['type'] });
  if (label) replaceLabel(layer, { ...label, style: type as PlacedLabel['style'] });
}

/** An object on the clipboard, with its kind so it can be pasted back */
export type CopiedObject =
  | { kind: 'door'; object: PlacedDoor }
  | { kind: 'wall'; object: PlacedWall }
  | { kind: 'stairs'; object: PlacedStairs }
  | { kind: 'prop'; object: PlacedProp }
  | { kind: 'label'; object: PlacedLabel }
  | { kind: 'light'; object: PlacedLight };

/** A copied object and the layer it came from */
export type ClipboardEntry = CopiedObject & { layerId: string };

export function copyObjects(map: MapData | LevelMap, sels: Selection[]): ClipboardEntry[] {
  return sels.flatMap((sel) => {
    const object = findSelected(map, sel);
    return object ? [{ kind: sel.kind, object, layerId: sel.layerId } as ClipboardEntry] : [];
  });
}

/**
 * The copies to paste: onto `layerId`, or each back onto its own layer. One
 * object lands as `offsetCopy` puts it. A group keeps its layout and moves
 * by whole cells: one to the right, or with its top-left corner under `at`,
 * then further right while any of its doors would land on another door.
 */
export function placeCopies(
  map: MapData | LevelMap,
  entries: ClipboardEntry[],
  layerId?: string,
  at?: { x: number; y: number }
): ClipboardEntry[] {
  const target = (entry: ClipboardEntry) => findLayer(map, layerId ?? entry.layerId);
  if (entries.length === 1) {
    const layer = target(entries[0]);
    return layer ? [{ ...offsetCopy(layer, entries[0], at), layerId: layer.id }] : [];
  }
  let dx = 1;
  let dy = 0;
  if (at) {
    dx = Math.floor(at.x) - Math.floor(Math.min(...entries.map((e) => e.object.x)));
    dy = Math.floor(at.y) - Math.floor(Math.min(...entries.map((e) => e.object.y)));
  }
  const doorTaken = (offset: number) =>
    entries.some((e) => {
      if (e.kind !== 'door') return false;
      const { x, y, orientation } = e.object;
      return !!target(e)?.doors.some((d) => d.x === x + offset && d.y === y + dy && d.orientation === orientation);
    });
  // Bounded, as every door stays on its own row or column
  for (let i = 0; i < 1000 && doorTaken(dx); i++) dx++;
  return entries.flatMap((e) => {
    const layer = target(e);
    if (!layer) return [];
    const object = { ...e.object, id: newObjectId(e.kind), x: e.object.x + dx, y: e.object.y + dy };
    return [{ kind: e.kind, object, layerId: layer.id } as ClipboardEntry];
  });
}

/**
 * The copy to paste onto a layer: a new id, one cell to the right, or under
 * `at` (a point in grid units) snapped as the placing tools do. Doors move
 * along their wall instead, or to the edge nearest `at`, past any door already there.
 */
export function offsetCopy(layer: LayerContent, copied: CopiedObject, at?: { x: number; y: number }): CopiedObject {
  const id = newObjectId(copied.kind);
  if (copied.kind === 'door') {
    const d = { ...copied.object, ...(at && nearestDoorEdge(at.x, at.y, 1)) };
    const [dx, dy] = d.orientation === 'horizontal' ? [1, 0] : [0, 1];
    const taken = (x: number, y: number) =>
      layer.doors.some((o) => o.x === x && o.y === y && o.orientation === d.orientation);
    let [x, y] = at ? [d.x, d.y] : [d.x + dx, d.y + dy];
    while (taken(x, y)) [x, y] = [x + dx, y + dy];
    return { kind: 'door', object: { ...d, id, x, y } };
  }
  if (!at) return { ...copied, object: { ...copied.object, id, x: copied.object.x + 1 } } as CopiedObject;
  // Labels sit freely; everything else fills whole cells
  const [x, y] = copied.kind === 'label' ? [at.x, at.y] : [Math.floor(at.x), Math.floor(at.y)];
  return { ...copied, object: { ...copied.object, id, x, y } } as CopiedObject;
}

/** Adds an object (from offsetCopy) on top of a layer's others of its kind */
export function addObject(draft: MapData | LevelMap, layerId: string, copied: CopiedObject) {
  const layer = findLayer(draft, layerId);
  if (!layer) return;
  if (copied.kind === 'door') layer.doors = [...layer.doors, copied.object];
  else if (copied.kind === 'wall') layer.walls = [...layer.walls, copied.object];
  else if (copied.kind === 'stairs') layer.stairs = [...layer.stairs, copied.object];
  else if (copied.kind === 'prop') layer.props = [...layer.props, copied.object];
  else if (copied.kind === 'label') layer.labels = [...layer.labels, copied.object];
  else layer.lights = [...layer.lights, copied.object];
}

function replaceObject(layer: LayerContent, { kind, object }: CopiedObject) {
  if (kind === 'door') replaceDoor(layer, object);
  else if (kind === 'wall') replaceWall(layer, object);
  else if (kind === 'stairs') replaceStairs(layer, object);
  else if (kind === 'prop') replaceProp(layer, object);
  else if (kind === 'label') replaceLabel(layer, object);
  else replaceLight(layer, object);
}

// Draft layers hold shallow copies, so objects are replaced rather than mutated
export function replaceDoor(layer: LayerContent, door: PlacedDoor) {
  layer.doors = layer.doors.map((d) => (d.id === door.id ? door : d));
}
export function replaceWall(layer: LayerContent, wall: PlacedWall) {
  layer.walls = layer.walls.map((w) => (w.id === wall.id ? wall : w));
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
export function replaceLight(layer: LayerContent, light: PlacedLight) {
  layer.lights = layer.lights.map((l) => (l.id === light.id ? light : l));
}
