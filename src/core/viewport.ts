import type { LevelMap, Selection, ViewportTransform } from '../types/map';
import { objectBounds } from './objects';
import { visibleLayers } from './layers';
import { shapeBounds } from './geometry/region';

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
// Zoom to fit never magnifies a small map beyond this
const MAX_FIT_ZOOM = 2;
// Space kept around the map, in screen pixels and in grid cells (for hatching)
const FIT_MARGIN_PX = 24;
const FIT_MARGIN_CELLS = 0.75;

/** Zoom to a new level, keeping the screen point (cx, cy) over the same spot on the map */
export function zoomAbout(v: ViewportTransform, cx: number, cy: number, zoom: number): ViewportTransform {
  const clamped = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  return {
    x: cx - (cx - v.x) * (clamped / v.zoom),
    y: cy - (cy - v.y) * (clamped / v.zoom),
    zoom: clamped,
  };
}

export type ZoomSpeed = 'slow' | 'normal' | 'fast';

// Zoom per pixel of wheel scroll; a mouse wheel notch (about 100 px) zooms
// about 15% at normal speed
const WHEEL_ZOOM_RATE: Record<ZoomSpeed, number> = { slow: 0.0007, normal: 0.0014, fast: 0.0028 };
// Firefox reports some wheels in lines or pages rather than pixels
const PX_PER_LINE = 33;
const PX_PER_PAGE = 800;
// Trackpad pinches arrive as ctrl + wheel with small deltas
const PINCH_BOOST = 4;
// One event never zooms more than a mouse wheel notch
const MAX_WHEEL_DELTA = 100;

/**
 * Zoom factor for one wheel event. Scaling by the scroll distance rather than
 * per event keeps trackpads, which send many small events, smooth.
 */
export function wheelZoomFactor(
  e: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>,
  speed: ZoomSpeed
): number {
  const unit = e.deltaMode === 1 ? PX_PER_LINE : e.deltaMode === 2 ? PX_PER_PAGE : 1;
  const delta = e.deltaY * unit * (e.ctrlKey ? PINCH_BOOST : 1);
  const clamped = Math.max(-MAX_WHEEL_DELTA, Math.min(MAX_WHEEL_DELTA, delta));
  return Math.exp(-clamped * WHEEL_ZOOM_RATE[speed]);
}

/** Extent of everything drawn on the map's shown layers, in grid units, or null if empty */
export function mapBounds(map: LevelMap): { x: number; y: number; w: number; h: number } | null {
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

  for (const layer of visibleLayers(map)) {
    for (const cells of [layer.rooms, layer.water, layer.clearWater, layer.lava, layer.paint, layer.foliage]) {
      for (const key of Object.keys(cells)) {
        const [x, y] = key.split(',').map(Number);
        include(x, y, 1, 1);
      }
    }
    const shapes = shapeBounds(layer);
    if (shapes) include(shapes.minX, shapes.minY, shapes.maxX - shapes.minX, shapes.maxY - shapes.minY);
    const layerId = layer.id;
    const objects: Selection[] = [
      ...layer.doors.map((d) => ({ kind: 'door' as const, id: d.id, layerId })),
      ...layer.windows.map((w) => ({ kind: 'window' as const, id: w.id, layerId })),
      ...layer.stairs.map((s) => ({ kind: 'stairs' as const, id: s.id, layerId })),
      ...layer.props.map((p) => ({ kind: 'prop' as const, id: p.id, layerId })),
      ...layer.labels.map((l) => ({ kind: 'label' as const, id: l.id, layerId })),
    ];
    for (const sel of objects) {
      const b = objectBounds(map, sel);
      if (b) include(b.x, b.y, b.w, b.h);
    }
  }

  return minX === Infinity ? null : { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** A view that frames the whole map in a canvas of the given size */
export function fitViewport(map: LevelMap, width: number, height: number): ViewportTransform {
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
