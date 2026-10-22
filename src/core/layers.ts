// Map layers: creating, finding, reordering and loading them
import type { LayerContent, LevelMap, MapData, MapLayer, MapLevel } from '../types/map';

/** Anything holding layers: a level, or the level view the canvas draws */
type Layered = Pick<MapLevel, 'layers'>;

export function emptyContent(): LayerContent {
  return { rooms: {}, shapes: [], cuts: [], floors: {}, water: {}, foliage: {}, doors: [], stairs: [], props: [], labels: [], lights: [] };
}

export function newLayer(id: string, name: string, content: Partial<LayerContent> = {}): MapLayer {
  return {
    id,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    ...emptyContent(),
    ...content,
  };
}

export function newLayerId(): string {
  return `layer_${crypto.randomUUID().slice(0, 8)}`;
}

/** A layer's own copy of every collection, so a draft can be edited freely
 * (shapes and cuts are replaced whole, so they keep being shared) */
export function cloneLayer(layer: MapLayer): MapLayer {
  return {
    ...layer,
    rooms: { ...layer.rooms },
    floors: { ...layer.floors },
    water: { ...layer.water },
    foliage: { ...layer.foliage },
    doors: [...layer.doors],
    stairs: [...layer.stairs],
    props: [...layer.props],
    labels: [...layer.labels],
    lights: [...layer.lights],
  };
}

/** A layer by id; in a whole map, layer ids are unique across its levels */
export function findLayer(map: MapData | LevelMap, id: string): MapLayer | undefined {
  if ('layers' in map) return map.layers.find((l) => l.id === id);
  for (const level of map.levels) {
    const layer = level.layers.find((l) => l.id === id);
    if (layer) return layer;
  }
  return undefined;
}

/** Tools only draw on, and select from, layers that are shown and unlocked */
export function isLayerEditable(layer: MapLayer | undefined): boolean {
  return !!layer && layer.visible && !layer.locked;
}

export function visibleLayers(map: Layered): MapLayer[] {
  return map.layers.filter((l) => l.visible);
}

/** Runs `edit` on a draft's layer, if it still exists */
export function withLayer(draft: MapData | LevelMap, id: string, edit: (layer: MapLayer) => void) {
  const layer = findLayer(draft, id);
  if (layer) edit(layer);
}

/** "Layer N" with the lowest N not already taken */
export function nextLayerName(map: Layered): string {
  const names = new Set(map.layers.map((l) => l.name));
  let n = map.layers.length + 1;
  while (names.has(`Layer ${n}`)) n++;
  return `Layer ${n}`;
}

/** Inserts a new empty layer just above layer `aboveId` (or on top) */
export function addLayer(draft: Layered, layer: MapLayer, aboveId: string) {
  const index = draft.layers.findIndex((l) => l.id === aboveId);
  draft.layers.splice(index === -1 ? draft.layers.length : index + 1, 0, layer);
}

/** Removes a layer; the last remaining layer is kept */
export function deleteLayer(draft: Layered, id: string) {
  if (draft.layers.length > 1) draft.layers = draft.layers.filter((l) => l.id !== id);
}

/** Moves a layer up (+1, drawn later) or down (-1) one place */
export function moveLayer(draft: Layered, id: string, delta: 1 | -1) {
  const index = draft.layers.findIndex((l) => l.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= draft.layers.length) return;
  const [layer] = draft.layers.splice(index, 1);
  draft.layers.splice(target, 0, layer);
}

/** True for a parsed project file or autosave, from before or after levels and layers */
export function isMapLike(value: unknown): value is Partial<MapData> {
  if (!value || typeof value !== 'object') return false;
  const v = value as { rooms?: unknown; layers?: unknown; levels?: unknown };
  return Array.isArray(v.levels) || Array.isArray(v.layers) || typeof v.rooms === 'object';
}

type StoredLayer = Partial<MapLayer>;
type StoredLevel = Partial<Omit<MapLevel, 'layers'>> & { layers?: StoredLayer[] };
// Version 2 files kept one level's layers at the top level of the map, and
// version 1 files one layer's content
type StoredMap = Partial<Omit<MapData, 'levels'>> &
  Partial<LayerContent> & { layers?: StoredLayer[]; levels?: StoredLevel[] };

function normalizeLayer(stored: StoredLayer, index: number, takenIds: Set<string>): MapLayer {
  const layer: MapLayer = {
    ...newLayer(stored.id ?? `layer${index + 1}`, stored.name ?? `Layer ${index + 1}`),
    ...stored,
    rooms: stored.rooms ?? {},
    shapes: stored.shapes ?? [],
    cuts: stored.cuts ?? [],
    floors: stored.floors ?? {},
    water: stored.water ?? {},
    foliage: stored.foliage ?? {},
    doors: stored.doors ?? [],
    stairs: stored.stairs ?? [],
    props: stored.props ?? [],
    labels: stored.labels ?? [],
    lights: stored.lights ?? [],
  };
  // Edits find layers by id across all levels, so a clash gets a new one
  if (takenIds.has(layer.id)) layer.id = newLayerId();
  takenIds.add(layer.id);
  return layer;
}

function normalizeLevel(stored: StoredLevel, index: number, takenIds: Set<string>): MapLevel {
  const layers = Array.isArray(stored.layers) && stored.layers.length > 0 ? stored.layers : [{ name: 'Layer 1' }];
  return {
    id: stored.id ?? `level${index + 1}`,
    name: stored.name ?? `Level ${index + 1}`,
    layers: layers.map((layer, i) => normalizeLayer(layer, i, takenIds)),
  };
}

/** Fills in fields missing from older or hand-edited project files */
export function normalizeLoadedMap(parsed: StoredMap, defaults: MapData): MapData {
  const { rooms, water, foliage, doors, stairs, props, labels, layers, levels, ...settings } = parsed;
  const storedLevels: StoredLevel[] =
    Array.isArray(levels) && levels.length > 0
      ? levels
      : [
          {
            layers:
              Array.isArray(layers) && layers.length > 0
                ? layers
                : [{ id: 'layer1', name: 'Dungeon', rooms, water, foliage, doors, stairs, props, labels }],
          },
        ];
  const takenIds = new Set<string>();
  return {
    ...defaults,
    ...settings,
    version: defaults.version,
    levels: storedLevels.map((level, i) => normalizeLevel(level, i, takenIds)),
  };
}
