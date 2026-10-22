// Map levels: the floors or areas of one map, each with its own layers
import type { LevelMap, MapData, MapLevel, PlacedStairs } from '../types/map';
import { newLayer, newLayerId } from './layers';

export function newLevelId(): string {
  return `level_${crypto.randomUUID().slice(0, 8)}`;
}

/** An empty level with one layer */
export function newLevel(id: string, name: string): MapLevel {
  return { id, name, layers: [newLayer(newLayerId(), 'Layer 1')] };
}

export function findLevel(map: MapData, id: string): MapLevel | undefined {
  return map.levels.find((l) => l.id === id);
}

/** The level holding a layer */
export function levelOfLayer(map: MapData, layerId: string): MapLevel | undefined {
  return map.levels.find((level) => level.layers.some((l) => l.id === layerId));
}

/** Runs `edit` on a draft's level, if it still exists */
export function withLevel(draft: MapData, id: string, edit: (level: MapLevel) => void) {
  const level = findLevel(draft, id);
  if (level) edit(level);
}

/** One level with the map's settings, as the canvas and exports draw it */
export function levelView(map: MapData, level: MapLevel): LevelMap {
  const { levels: _levels, ...settings } = map;
  return { ...settings, layers: level.layers };
}

/** "Level N" with the lowest N not already taken */
export function nextLevelName(map: MapData): string {
  const names = new Set(map.levels.map((l) => l.name));
  let n = map.levels.length + 1;
  while (names.has(`Level ${n}`)) n++;
  return `Level ${n}`;
}

/** Inserts a level just above (after) or below (before) level `nextToId`, or at the top */
export function addLevel(draft: MapData, level: MapLevel, nextToId: string, where: 'above' | 'below' = 'above') {
  const index = draft.levels.findIndex((l) => l.id === nextToId);
  if (index === -1) draft.levels.push(level);
  else draft.levels.splice(where === 'above' ? index + 1 : index, 0, level);
}

/** Removes a level; the last remaining level is kept. Stairs leading to it lead nowhere. */
export function deleteLevel(draft: MapData, id: string) {
  if (draft.levels.length > 1) draft.levels = draft.levels.filter((l) => l.id !== id);
}

/** Moves a level one place later (+1) or earlier (-1) in the list */
export function moveLevel(draft: MapData, id: string, delta: 1 | -1) {
  const index = draft.levels.findIndex((l) => l.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= draft.levels.length) return;
  const [level] = draft.levels.splice(index, 1);
  draft.levels.splice(target, 0, level);
}

/** The level a staircase leads to, if it still exists */
export function stairsTarget(map: MapData, stairs: PlacedStairs): MapLevel | undefined {
  return stairs.toLevel ? findLevel(map, stairs.toLevel) : undefined;
}

/** Stairs on `level` (shown layers only) leading back to level `fromId`, with their layer */
export function stairsBackTo(
  level: MapLevel,
  fromId: string
): { stairs: PlacedStairs; layerId: string } | undefined {
  for (const layer of [...level.layers].reverse()) {
    if (!layer.visible) continue;
    const stairs = layer.stairs.find((s) => s.toLevel === fromId);
    if (stairs) return { stairs, layerId: layer.id };
  }
  return undefined;
}
