import type { MapData, Selection, ViewportTransform } from '../types/map';
import { objectBounds } from './objects';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
// Zoom to fit never magnifies a small map beyond this
const MAX_FIT_ZOOM = 2;
// Space kept around the map, in screen pixels and in grid cells (for hatching)
const FIT_MARGIN_PX = 24;
const FIT_MARGIN_CELLS = 0.75;

/** Extent of everything drawn on the map, in grid units, or null if empty */
export function mapBounds(map: MapData): { x: number; y: number; w: number; h: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  for (const cells of [map.rooms, map.water, map.foliage]) {
    for (const key of Object.keys(cells)) {
      const [x, y] = key.split(',').map(Number);
      include(x, y, 1, 1);
    }
  }
  const objects: Selection[] = [
    ...map.doors.map((d) => ({ kind: 'door' as const, id: d.id })),
    ...map.stairs.map((s) => ({ kind: 'stairs' as const, id: s.id })),
    ...map.props.map((p) => ({ kind: 'prop' as const, id: p.id })),
    ...map.labels.map((l) => ({ kind: 'label' as const, id: l.id })),
  ];
  for (const sel of objects) {
    const b = objectBounds(map, sel);
    if (b) include(b.x, b.y, b.w, b.h);
  }

  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A view that frames the whole map in a canvas of the given size */
export function fitViewport(map: MapData, width: number, height: number): ViewportTransform {
  const bounds = mapBounds(map);
  if (!bounds) return { x: width / 2, y: height / 2, zoom: 1 };

  const worldW = (bounds.w + 2 * FIT_MARGIN_CELLS) * map.gridSize;
  const worldH = (bounds.h + 2 * FIT_MARGIN_CELLS) * map.gridSize;
  const zoom = Math.min(
    MAX_FIT_ZOOM,
    Math.max(
      MIN_ZOOM,
      Math.min((width - 2 * FIT_MARGIN_PX) / worldW, (height - 2 * FIT_MARGIN_PX) / worldH)
    )
  );
  const centreX = (bounds.x + bounds.w / 2) * map.gridSize;
  const centreY = (bounds.y + bounds.h / 2) * map.gridSize;
  return { x: width / 2 - centreX * zoom, y: height / 2 - centreY * zoom, zoom };
}
