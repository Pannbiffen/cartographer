// Selectable map objects (doors, stairs, props): hit testing, bounds and edits
import type {
  MapData,
  PlacedDoor,
  PlacedLabel,
  PlacedProp,
  PlacedStairs,
  Selection,
} from '../types/map';
import { nearestDoorEdge, stairsContainCell } from './tools/toolGeometry';
import { measureLabel } from './renderers/labelRenderer';

// How close (in cells) the pointer must be to a door's wall edge to pick it
const DOOR_HIT_DISTANCE = 0.3;

export function newObjectId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function findDoor(map: MapData, id: string): PlacedDoor | undefined {
  return map.doors.find((d) => d.id === id);
}
export function findStairs(map: MapData, id: string): PlacedStairs | undefined {
  return map.stairs.find((s) => s.id === id);
}
export function findProp(map: MapData, id: string): PlacedProp | undefined {
  return map.props.find((p) => p.id === id);
}
export function findLabel(map: MapData, id: string): PlacedLabel | undefined {
  return map.labels.find((l) => l.id === id);
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
  if (!sel) return undefined;
  if (sel.kind === 'door') return findDoor(map, sel.id);
  if (sel.kind === 'stairs') return findStairs(map, sel.id);
  if (sel.kind === 'label') return findLabel(map, sel.id);
  return findProp(map, sel.id);
}

/** Topmost object under a world position: labels, doors, props, then stairs */
export function hitTestObject(map: MapData, worldX: number, worldY: number): Selection | null {
  const gridSize = map.gridSize;
  const gx = Math.floor(worldX / gridSize);
  const gy = Math.floor(worldY / gridSize);

  for (let i = map.labels.length - 1; i >= 0; i--) {
    const b = labelBounds(map.labels[i], gridSize);
    const px = worldX / gridSize;
    const py = worldY / gridSize;
    if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      return { kind: 'label', id: map.labels[i].id };
    }
  }

  const edge = nearestDoorEdge(worldX, worldY, gridSize);
  const edgeDistance =
    edge.orientation === 'horizontal'
      ? Math.abs(worldY / gridSize - edge.y)
      : Math.abs(worldX / gridSize - edge.x);
  if (edgeDistance <= DOOR_HIT_DISTANCE) {
    const door = map.doors.find(
      (d) => d.x === edge.x && d.y === edge.y && d.orientation === edge.orientation
    );
    if (door) return { kind: 'door', id: door.id };
  }

  for (let i = map.props.length - 1; i >= 0; i--) {
    const p = map.props[i];
    if (p.x === gx && p.y === gy) return { kind: 'prop', id: p.id };
  }
  for (let i = map.stairs.length - 1; i >= 0; i--) {
    const s = map.stairs[i];
    if (stairsContainCell(s, gx, gy)) return { kind: 'stairs', id: s.id };
  }
  return null;
}

/** Selection outline in grid units */
export function objectBounds(
  map: MapData,
  sel: Selection
): { x: number; y: number; w: number; h: number } | null {
  if (sel.kind === 'door') {
    const d = findDoor(map, sel.id);
    if (!d) return null;
    return d.orientation === 'horizontal'
      ? { x: d.x, y: d.y - 0.2, w: 1, h: 0.4 }
      : { x: d.x - 0.2, y: d.y, w: 0.4, h: 1 };
  }
  if (sel.kind === 'stairs') {
    const s = findStairs(map, sel.id);
    return s ? { x: s.x, y: s.y, w: s.width, h: s.height } : null;
  }
  if (sel.kind === 'label') {
    const l = findLabel(map, sel.id);
    return l ? labelBounds(l, map.gridSize) : null;
  }
  const p = findProp(map, sel.id);
  return p ? { x: p.x, y: p.y, w: 1, h: 1 } : null;
}

const STAIR_DIRECTIONS: PlacedStairs['direction'][] = ['up', 'right', 'down', 'left'];

/** Rotates the selected object 90° clockwise (in place on a draft map) */
export function rotateObject(draft: MapData, sel: Selection) {
  if (sel.kind === 'door') {
    const d = findDoor(draft, sel.id);
    if (!d) return;
    replaceDoor(draft, {
      ...d,
      orientation: d.orientation === 'horizontal' ? 'vertical' : 'horizontal',
    });
  } else if (sel.kind === 'stairs') {
    const s = findStairs(draft, sel.id);
    if (!s) return;
    const next = STAIR_DIRECTIONS[(STAIR_DIRECTIONS.indexOf(s.direction) + 1) % 4];
    replaceStairs(draft, { ...s, direction: next, width: s.height, height: s.width });
  } else if (sel.kind === 'prop') {
    const p = findProp(draft, sel.id);
    if (!p) return;
    replaceProp(draft, { ...p, rotation: (p.rotation + 90) % 360 });
  }
}

export function deleteObject(draft: MapData, sel: Selection) {
  if (sel.kind === 'door') draft.doors = draft.doors.filter((d) => d.id !== sel.id);
  else if (sel.kind === 'stairs') draft.stairs = draft.stairs.filter((s) => s.id !== sel.id);
  else if (sel.kind === 'label') draft.labels = draft.labels.filter((l) => l.id !== sel.id);
  else draft.props = draft.props.filter((p) => p.id !== sel.id);
}

// Draft arrays are shallow copies, so objects are replaced rather than mutated
export function replaceDoor(draft: MapData, door: PlacedDoor) {
  draft.doors = draft.doors.map((d) => (d.id === door.id ? door : d));
}
export function replaceStairs(draft: MapData, stairs: PlacedStairs) {
  draft.stairs = draft.stairs.map((s) => (s.id === stairs.id ? stairs : s));
}
export function replaceProp(draft: MapData, prop: PlacedProp) {
  draft.props = draft.props.map((p) => (p.id === prop.id ? prop : p));
}
export function replaceLabel(draft: MapData, label: PlacedLabel) {
  draft.labels = draft.labels.map((l) => (l.id === label.id ? label : l));
}
