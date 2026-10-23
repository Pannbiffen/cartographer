// High-resolution image and Universal VTT exporters, and the bounding box they share
import type { LevelMap } from '../../types/map';
import { THEMES } from '../theme';
import { renderMap } from '../renderers/mapRenderer';
import { exportUniversalVtt } from './vttExporter';
import { visibleLayers } from '../layers';
import { shapeBounds } from '../geometry/region';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeMapBounds(mapData: LevelMap, margin: number = 2): BoundingBox {
  const coords: { x: number; y: number }[] = [];

  // Hidden layers are left out of exports
  for (const layer of visibleLayers(mapData)) {
    for (const cells of [layer.rooms, layer.water, layer.clearWater, layer.lava, layer.paint, layer.foliage]) {
      for (const key of Object.keys(cells)) {
        if (!cells[key]) continue;
        const [x, y] = key.split(',').map(Number);
        coords.push({ x, y });
      }
    }
    // Cells reaching the shape's edges, as coordinates name whole cells
    const shapes = shapeBounds(layer);
    if (shapes) {
      coords.push({ x: Math.floor(shapes.minX), y: Math.floor(shapes.minY) });
      coords.push({ x: Math.ceil(shapes.maxX) - 1, y: Math.ceil(shapes.maxY) - 1 });
    }
    for (const door of layer.doors) {
      coords.push({ x: door.x, y: door.y });
    }
    for (const stairs of layer.stairs) {
      coords.push({ x: stairs.x, y: stairs.y });
      coords.push({ x: stairs.x + stairs.width - 1, y: stairs.y + stairs.height - 1 });
    }
    for (const prop of layer.props) {
      coords.push({ x: prop.x, y: prop.y });
    }
    for (const label of layer.labels) {
      coords.push({ x: Math.floor(label.x), y: Math.floor(label.y) });
    }
  }

  if (coords.length === 0) {
    return { minX: -10, minY: -10, maxX: 10, maxY: 10, width: 21, height: 21 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const c of coords) {
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x > maxX) maxX = c.x;
    if (c.y > maxY) maxY = c.y;
  }

  minX -= margin;
  minY -= margin;
  maxX += margin;
  maxY += margin;

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Renders the entire bounded map to an offscreen canvas at a specified scale multiplier
 */
export function renderOffscreenMap(
  mapData: LevelMap,
  bounds: BoundingBox,
  scale: number = 1,
  includeGrid: boolean = true,
  lighting: boolean = true
): HTMLCanvasElement {
  const gridSize = mapData.gridSize;
  const canvasWidth = bounds.width * gridSize * scale;
  const canvasHeight = bounds.height * gridSize * scale;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const theme = THEMES[mapData.theme] || THEMES.parchment;

  // Background
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  ctx.scale(scale, scale);
  // Shift origin to min bounds
  ctx.translate(-bounds.minX * gridSize, -bounds.minY * gridSize);

  renderMap(ctx, mapData, includeGrid ? bounds : null, { lighting });

  ctx.restore();
  return canvas;
}

/**
 * Triggers a download of a file in the browser
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function fileBaseName(mapData: LevelMap): string {
  return mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
}

export type ImageFormat = 'png' | 'webp';

/**
 * Export Map as a PNG or WebP image
 */
export function exportToImage(
  mapData: LevelMap,
  scale: number = 2,
  includeGrid: boolean = true,
  format: ImageFormat = 'png'
) {
  const bounds = computeMapBounds(mapData, 2);
  const canvas = renderOffscreenMap(mapData, bounds, scale, includeGrid);

  canvas.toBlob(
    (blob) => {
      if (!blob) {
        alert('The map is too large to export at this resolution. Try a lower one.');
        return;
      }
      triggerDownload(blob, `${fileBaseName(mapData)}.${format}`);
    },
    `image/${format}`,
    0.92
  );
}

/**
 * Export Map as Universal VTT (.dd2vtt)
 */
export function exportToVtt(mapData: LevelMap) {
  const bounds = computeMapBounds(mapData, 1);
  // The VTT draws its own darkness from the exported lights
  const canvas = renderOffscreenMap(mapData, bounds, 1, false, false);
  const dataUrl = canvas.toDataURL('image/png');

  const vttJson = exportUniversalVtt(
    mapData,
    dataUrl,
    bounds.minX,
    bounds.minY,
    bounds.maxX,
    bounds.maxY
  );

  const blob = new Blob([vttJson], { type: 'application/json' });
  triggerDownload(blob, `${fileBaseName(mapData)}.dd2vtt`);
}
