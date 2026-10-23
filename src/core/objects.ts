// Selectable map objects (doors, windows, stairs, props, labels, lights): hit testing, bounds and edits
import type {
  GridType,
  LayerContent,
  LevelMap,
  MapData,
  MapLayer,
  Pair,
  PlacedDoor,
  PlacedLabel,
  PlacedLight,
  PlacedProp,
  PlacedStairs,
  PlacedWall,
  PlacedWindow,
  Selection,
} from '../types/map';
import { distanceToDoor, doorLine, nearestDoorEdge, sameDoorSpot, type DoorSpot } from './tools/toolGeometry';
import { measureLabel } from './renderers/labelRenderer';
import { findLayer, isLayerEditable } from './layers';
import { distanceToWall, wallKey } from './geometry/walls';
import { hexAt, hexNudge, hexOffset, hexSlot, isHexGrid, nearestHexSide } from './geometry/hex';

// How close (in cells) the pointer must be to a door's wall edge to pick it
const DOOR_HIT_DISTANCE = 0.3;

export function newObjectId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function findDoor(layer: LayerContent, id: string): PlacedDoor | undefined {
  return layer.doors.find((d) => d.id === id);
}
export function findWindow(layer: LayerContent, id: string): PlacedWindow | undefined {
  return layer.windows.find((w) => w.id === id);
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

/** Doors and windows sit on cell edges (doors also along walls off the grid), one of each kind per spot */
type EdgeKind = 'door' | 'window';
type EdgeObject = PlacedDoor | PlacedWindow;

function isEdgeKind(kind: Selection['kind']): kind is EdgeKind {
  return kind === 'door' || kind === 'window';
}

function edgeObjects(layer: LayerContent, kind: EdgeKind): EdgeObject[] {
  return kind === 'door' ? layer.doors : layer.windows;
}

/** Whether a door or window other than `id` already uses the spot */
function edgeTaken(layer: LayerContent, kind: EdgeKind, spot: DoorSpot, id?: string): boolean {
  return edgeObjects(layer, kind).some((o) => o.id !== id && sameDoorSpot(o, spot));
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
): PlacedDoor | PlacedWindow | PlacedWall | PlacedStairs | PlacedProp | PlacedLabel | PlacedLight | undefined {
  const layer = sel ? findLayer(map, sel.layerId) : undefined;
  if (!sel || !layer) return undefined;
  if (sel.kind === 'door') return findDoor(layer, sel.id);
  if (sel.kind === 'window') return findWindow(layer, sel.id);
  if (sel.kind === 'wall') return findWall(layer, sel.id);
  if (sel.kind === 'stairs') return findStairs(layer, sel.id);
  if (sel.kind === 'label') return findLabel(layer, sel.id);
  if (sel.kind === 'light') return findLight(layer, sel.id);
  return findProp(layer, sel.id);
}

/**
 * Topmost object under a world position on a shown, unlocked layer. Labels
 * are drawn above every layer, so they are hit first; then doors, windows, walls,
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
  const layerId = layer.id;
  const px = worldX / gridSize;
  const py = worldY / gridSize;

  // Doors and windows turned along walls off the grid, nearest first
  let angled: Selection | null = null;
  let angledDistance = DOOR_HIT_DISTANCE;
  for (const kind of ['door', 'window'] as const) {
    for (const d of edgeObjects(layer, kind)) {
      const distance = d.angle === undefined ? Infinity : distanceToDoor(d, px, py);
      if (distance <= angledDistance) [angled, angledDistance] = [{ kind, id: d.id, layerId }, distance];
    }
  }
  if (angled) return angled;

  const edge = nearestDoorEdge(worldX, worldY, gridSize);
  const edgeDistance =
    edge.orientation === 'horizontal'
      ? Math.abs(worldY / gridSize - edge.y)
      : Math.abs(worldX / gridSize - edge.x);
  if (edgeDistance <= DOOR_HIT_DISTANCE) {
    const door = layer.doors.find(
      (d) => d.angle === undefined && d.x === edge.x && d.y === edge.y && d.orientation === edge.orientation
    );
    if (door) return { kind: 'door', id: door.id, layerId };
    const pane = layer.windows.find(
      (w) => w.angle === undefined && w.x === edge.x && w.y === edge.y && w.orientation === edge.orientation
    );
    if (pane) return { kind: 'window', id: pane.id, layerId };
  }
  for (let i = layer.walls.length - 1; i >= 0; i--) {
    const w = layer.walls[i];
    if (distanceToWall(w, px, py) <= DOOR_HIT_DISTANCE) return { kind: 'wall', id: w.id, layerId };
  }

  // Lights, props and stairs fill whole cells, which on a hex grid sit off the square grid
  const covers = (x: number, y: number, w: number, h: number) => px >= x && px < x + w && py >= y && py < y + h;
  for (let i = layer.lights.length - 1; i >= 0; i--) {
    const l = layer.lights[i];
    if (covers(l.x, l.y, 1, 1)) return { kind: 'light', id: l.id, layerId };
  }
  for (let i = layer.props.length - 1; i >= 0; i--) {
    const p = layer.props[i];
    if (covers(p.x, p.y, 1, 1)) return { kind: 'prop', id: p.id, layerId };
  }
  for (let i = layer.stairs.length - 1; i >= 0; i--) {
    const s = layer.stairs[i];
    if (covers(s.x, s.y, s.width, s.height)) return { kind: 'stairs', id: s.id, layerId };
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
      ...layer.windows.map((w) => ({ kind: 'window' as const, id: w.id, layerId })),
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
  if (isEdgeKind(sel.kind)) {
    const d = sel.kind === 'door' ? findDoor(layer, sel.id) : findWindow(layer, sel.id);
    if (!d) return null;
    // Its length (a cell, or a hex side) and 0.4 across, turned with the wall
    const { cx, cy, ux, uy, length } = doorLine(d);
    const halfW = (Math.abs(ux) * length) / 2 + Math.abs(uy) * 0.2;
    const halfH = (Math.abs(uy) * length) / 2 + Math.abs(ux) * 0.2;
    return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
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
    replaceDoor(
      layer,
      d.angle === undefined
        ? { ...d, orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal' }
        : { ...d, angle: (d.angle + 90) % 180 }
    );
  } else if (sel.kind === 'window') {
    const w = findWindow(layer, sel.id);
    if (!w) return;
    replaceWindow(
      layer,
      w.angle === undefined
        ? { ...w, orientation: w.orientation === 'horizontal' ? 'vertical' : 'horizontal' }
        : { ...w, angle: (w.angle + 90) % 180 }
    );
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
  else if (sel.kind === 'window') layer.windows = layer.windows.filter((w) => w.id !== sel.id);
  else if (sel.kind === 'wall') layer.walls = layer.walls.filter((w) => w.id !== sel.id);
  else if (sel.kind === 'stairs') layer.stairs = layer.stairs.filter((s) => s.id !== sel.id);
  else if (sel.kind === 'label') layer.labels = layer.labels.filter((l) => l.id !== sel.id);
  else if (sel.kind === 'light') layer.lights = layer.lights.filter((l) => l.id !== sel.id);
  else layer.props = layer.props.filter((p) => p.id !== sel.id);
}

/**
 * Moves the selected object one step in direction (dx, dy): labels by
 * `labelStep` cells, grid-snapped objects by a whole cell. A door, window
 * or wall won't move onto an edge another of its kind already uses.
 */
export function nudgeObject(draft: MapData | LevelMap, sel: Selection, dx: number, dy: number, labelStep: number) {
  const layer = findLayer(draft, sel.layerId);
  if (!layer) return;
  if (sel.kind === 'label') {
    const l = findLabel(layer, sel.id);
    if (l) replaceLabel(layer, { ...l, x: l.x + dx * labelStep, y: l.y + dy * labelStep });
  } else if (isEdgeKind(sel.kind)) {
    const d = findSelected(draft, sel) as EdgeObject | undefined;
    if (!d) return;
    const moved = { ...d, x: d.x + dx, y: d.y + dy };
    if (!edgeTaken(layer, sel.kind, moved, d.id)) replaceObject(layer, { kind: sel.kind, object: moved } as CopiedObject);
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
 * moves if a door or window would land on an edge one of its kind outside the
 * group already uses.
 */
export function moveObjects(draft: MapData | LevelMap, origins: ObjectOrigin[], dx: number, dy: number) {
  const moving = new Set(origins.map((o) => o.sel.id));
  const blocked = origins.some(({ sel, x, y }) => {
    const layer = isEdgeKind(sel.kind) ? findLayer(draft, sel.layerId) : undefined;
    const edge = layer && (findSelected(draft, sel) as EdgeObject | undefined);
    return (
      edge &&
      edgeObjects(layer, sel.kind as EdgeKind).some(
        (d) => !moving.has(d.id) && sameDoorSpot(d, { ...edge, x: x + dx, y: y + dy })
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

/**
 * Nudges one object as `nudgeObject` does, or a group by whole cells. On a
 * hex grid each step goes to a neighbouring hex (a label on its own still
 * moves freely).
 */
export function nudgeObjects(draft: MapData | LevelMap, sels: Selection[], dx: number, dy: number, labelStep: number) {
  if (isHexGrid(draft.gridType) && !(sels.length === 1 && sels[0].kind === 'label')) {
    const b = sels.length > 0 ? objectBounds(draft, sels[sels.length - 1]) : null;
    if (!b) return;
    // Just off the middle, which for a wall or door is on a hex edge, so it
    // is always clear which hex the object is in
    [dx, dy] = hexNudge(draft.gridType, [b.x + b.w / 2 + 0.013, b.y + b.h / 2 + 0.017], dx, dy);
  }
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
  | { kind: 'window'; object: PlacedWindow }
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
 * by whole cells (whole hexes on a hex grid): one to the right, or with its
 * top-left corner under `at`, then further right while any of its doors or
 * windows would land on another.
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
    return layer ? [{ ...offsetCopy(layer, entries[0], at, map.gridType), layerId: layer.id }] : [];
  }
  const corner: Pair = [Math.min(...entries.map((e) => e.object.x)), Math.min(...entries.map((e) => e.object.y))];
  const hex = isHexGrid(map.gridType) ? map.gridType : null;
  // One step right of where the group would be: a cell, or a hex
  const right = (dx: number, dy: number): Pair => {
    if (!hex) return [dx + 1, dy];
    const [sx, sy] = hexNudge(hex, [corner[0] + 0.5 + dx, corner[1] + 0.5 + dy], 1, 0);
    return [dx + sx, dy + sy];
  };
  let [dx, dy] = right(0, 0);
  if (at && hex) {
    [dx, dy] = hexOffset(hex, [corner[0] + 0.5, corner[1] + 0.5], [at.x, at.y]);
  } else if (at) {
    dx = Math.floor(at.x) - Math.floor(corner[0]);
    dy = Math.floor(at.y) - Math.floor(corner[1]);
  }
  const edgeTakenAt = (ox: number, oy: number) =>
    entries.some((e) => {
      if (e.kind !== 'door' && e.kind !== 'window') return false;
      const layer = target(e);
      return !!layer && edgeTaken(layer, e.kind, { ...e.object, x: e.object.x + ox, y: e.object.y + oy });
    });
  // Bounded, as every door and window stays on its own row or column
  for (let i = 0; i < 1000 && edgeTakenAt(dx, dy); i++) [dx, dy] = right(dx, dy);
  return entries.flatMap((e) => {
    const layer = target(e);
    if (!layer) return [];
    const object = { ...e.object, id: newObjectId(e.kind), x: e.object.x + dx, y: e.object.y + dy };
    return [{ kind: e.kind, object, layerId: layer.id } as ClipboardEntry];
  });
}

/**
 * The copy to paste onto a layer: a new id, one cell to the right, or under
 * `at` (a point in grid units) snapped as the placing tools do. Doors and
 * windows move along their wall instead, or to the edge nearest `at` (a door
 * turned along a wall keeps its angle, centred on `at`), past any of their
 * kind already there. On a hex `grid` things go a hex to the right, or into
 * the hex under `at`, and doors and windows onto its nearest side.
 */
export function offsetCopy(layer: LayerContent, copied: CopiedObject, at?: { x: number; y: number }, grid?: GridType): CopiedObject {
  const id = newObjectId(copied.kind);
  if (isHexGrid(grid) && copied.kind !== 'label') return offsetHexCopy(layer, copied, id, grid, at);
  if (copied.kind === 'door' || copied.kind === 'window') {
    const angled = 'angle' in copied.object && copied.object.angle !== undefined;
    const d = { ...copied.object, ...(at && (angled ? at : nearestDoorEdge(at.x, at.y, 1))) };
    const { ux: dx, uy: dy } = doorLine(d);
    const step = (v: number) => Math.round(v * 1e4) / 1e4;
    let [x, y] = at ? [d.x, d.y] : [step(d.x + dx), step(d.y + dy)];
    while (edgeTaken(layer, copied.kind, { ...d, x, y })) [x, y] = [step(x + dx), step(y + dy)];
    return { kind: copied.kind, object: { ...d, id, x, y } } as CopiedObject;
  }
  if (!at) return { ...copied, object: { ...copied.object, id, x: copied.object.x + 1 } } as CopiedObject;
  // Labels sit freely; everything else fills whole cells
  const [x, y] = copied.kind === 'label' ? [at.x, at.y] : [Math.floor(at.x), Math.floor(at.y)];
  return { ...copied, object: { ...copied.object, id, x, y } } as CopiedObject;
}

function offsetHexCopy(
  layer: LayerContent,
  copied: Exclude<CopiedObject, { kind: 'label' }>,
  id: string,
  grid: 'hex-pointy' | 'hex-flat',
  at?: { x: number; y: number }
): CopiedObject {
  const o = copied.object;
  // A point inside the hex the object is in (just off a door's or wall's
  // middle, which is on a hex side), to step it from hex to hex
  const ref: Pair =
    copied.kind === 'door' || copied.kind === 'window'
      ? [o.x + 0.013, o.y + 0.017]
      : copied.kind === 'wall'
        ? [o.x + copied.object.dx / 2 + 0.013, o.y + copied.object.dy / 2 + 0.017]
        : [o.x + 0.5, o.y + 0.5];
  const stepRight = (x: number, y: number): Pair => {
    const [dx, dy] = hexNudge(grid, [ref[0] + x - o.x, ref[1] + y - o.y], 1, 0);
    return [x + dx, y + dy];
  };
  if (copied.kind === 'door' || copied.kind === 'window') {
    const d: EdgeObject = copied.object;
    let spot = at ? { ...d, ...nearestHexSide(grid, at.x, at.y) } : { ...d, ...pairXY(stepRight(d.x, d.y)) };
    for (let i = 0; i < 1000 && edgeTaken(layer, copied.kind, spot); i++) spot = { ...spot, ...pairXY(stepRight(spot.x, spot.y)) };
    return { kind: copied.kind, object: { ...spot, id } } as CopiedObject;
  }
  let [x, y] = stepRight(o.x, o.y);
  if (at && copied.kind === 'wall') {
    const [dx, dy] = hexOffset(grid, ref, [at.x, at.y]);
    [x, y] = [o.x + dx, o.y + dy];
  } else if (at) {
    [x, y] = hexSlot(grid, hexAt(grid, at.x, at.y));
  }
  return { ...copied, object: { ...o, id, x, y } } as CopiedObject;
}

const pairXY = ([x, y]: Pair) => ({ x, y });

/** Adds an object (from offsetCopy) on top of a layer's others of its kind */
export function addObject(draft: MapData | LevelMap, layerId: string, copied: CopiedObject) {
  const layer = findLayer(draft, layerId);
  if (!layer) return;
  if (copied.kind === 'door') layer.doors = [...layer.doors, copied.object];
  else if (copied.kind === 'window') layer.windows = [...layer.windows, copied.object];
  else if (copied.kind === 'wall') layer.walls = [...layer.walls, copied.object];
  else if (copied.kind === 'stairs') layer.stairs = [...layer.stairs, copied.object];
  else if (copied.kind === 'prop') layer.props = [...layer.props, copied.object];
  else if (copied.kind === 'label') layer.labels = [...layer.labels, copied.object];
  else layer.lights = [...layer.lights, copied.object];
}

function replaceObject(layer: LayerContent, { kind, object }: CopiedObject) {
  if (kind === 'door') replaceDoor(layer, object);
  else if (kind === 'window') replaceWindow(layer, object);
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
export function replaceWindow(layer: LayerContent, pane: PlacedWindow) {
  layer.windows = layer.windows.map((w) => (w.id === pane.id ? pane : w));
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
