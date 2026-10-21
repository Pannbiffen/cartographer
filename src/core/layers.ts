// Map layers: creating, finding, reordering and loading them
import type { LayerContent, MapData, MapLayer } from '../types/map';

export function emptyContent(): LayerContent {
  return { rooms: {}, water: {}, foliage: {}, doors: [], stairs: [], props: [], labels: [] };
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

/** A layer's own copy of every collection, so a draft can be edited freely */
export function cloneLayer(layer: MapLayer): MapLayer {
  return {
    ...layer,
    rooms: { ...layer.rooms },
    water: { ...layer.water },
    foliage: { ...layer.foliage },
    doors: [...layer.doors],
    stairs: [...layer.stairs],
    props: [...layer.props],
    labels: [...layer.labels],
  };
}

export function findLayer(map: MapData, id: string): MapLayer | undefined {
  return map.layers.find((l) => l.id === id);
}

/** Tools only draw on, and select from, layers that are shown and unlocked */
export function isLayerEditable(layer: MapLayer | undefined): boolean {
  return !!layer && layer.visible && !layer.locked;
}

export function visibleLayers(map: MapData): MapLayer[] {
  return map.layers.filter((l) => l.visible);
}

/** Runs `edit` on a draft's layer, if it still exists */
export function withLayer(draft: MapData, id: string, edit: (layer: MapLayer) => void) {
  const layer = findLayer(draft, id);
  if (layer) edit(layer);
}

/** "Layer N" with the lowest N not already taken */
export function nextLayerName(map: MapData): string {
  const names = new Set(map.layers.map((l) => l.name));
  let n = map.layers.length + 1;
  while (names.has(`Layer ${n}`)) n++;
  return `Layer ${n}`;
}

/** Inserts a new empty layer just above layer `aboveId` (or on top) */
export function addLayer(draft: MapData, layer: MapLayer, aboveId: string) {
  const index = draft.layers.findIndex((l) => l.id === aboveId);
  draft.layers.splice(index === -1 ? draft.layers.length : index + 1, 0, layer);
}

/** Removes a layer; the last remaining layer is kept */
export function deleteLayer(draft: MapData, id: string) {
  if (draft.layers.length > 1) draft.layers = draft.layers.filter((l) => l.id !== id);
}

/** Moves a layer up (+1, drawn later) or down (-1) one place */
export function moveLayer(draft: MapData, id: string, delta: 1 | -1) {
  const index = draft.layers.findIndex((l) => l.id === id);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= draft.layers.length) return;
  const [layer] = draft.layers.splice(index, 1);
  draft.layers.splice(target, 0, layer);
}

/** True for a parsed project file or autosave, from before or after layers */
export function isMapLike(value: unknown): value is Partial<MapData> {
  if (!value || typeof value !== 'object') return false;
  const v = value as { rooms?: unknown; layers?: unknown };
  return Array.isArray(v.layers) || typeof v.rooms === 'object';
}

type StoredLayer = Partial<MapLayer>;
// Version 1 files kept one layer's content at the top level of the map
type StoredMap = Partial<Omit<MapData, 'layers'>> & Partial<LayerContent> & { layers?: StoredLayer[] };

function normalizeLayer(stored: StoredLayer, index: number): MapLayer {
  return {
    ...newLayer(stored.id ?? `layer${index + 1}`, stored.name ?? `Layer ${index + 1}`),
    ...stored,
    rooms: stored.rooms ?? {},
    water: stored.water ?? {},
    foliage: stored.foliage ?? {},
    doors: stored.doors ?? [],
    stairs: stored.stairs ?? [],
    props: stored.props ?? [],
    labels: stored.labels ?? [],
  };
}

/** Fills in fields missing from older or hand-edited project files */
export function normalizeLoadedMap(parsed: StoredMap, defaults: MapData): MapData {
  const { rooms, water, foliage, doors, stairs, props, labels, layers, ...settings } = parsed;
  const storedLayers: StoredLayer[] =
    Array.isArray(layers) && layers.length > 0
      ? layers
      : [{ id: 'layer1', name: 'Dungeon', rooms, water, foliage, doors, stairs, props, labels }];
  return {
    ...defaults,
    ...settings,
    version: defaults.version,
    layers: storedLayers.map(normalizeLayer),
  };
}
