// High-resolution image exporter, bounding box calculator, and PDF exporter
import type { MapData } from '../../types/map';
import { THEMES } from '../theme';
import { renderMap } from '../renderers/mapRenderer';
import { jsPDF } from 'jspdf';
import { exportUniversalVtt } from './vttExporter';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function computeMapBounds(mapData: MapData, margin: number = 2): BoundingBox {
  const coords: { x: number; y: number }[] = [];

  for (const key of Object.keys(mapData.rooms)) {
    if (mapData.rooms[key]) {
      const [x, y] = key.split(',').map(Number);
      coords.push({ x, y });
    }
  }
  for (const key of Object.keys(mapData.water)) {
    if (mapData.water[key]) {
      const [x, y] = key.split(',').map(Number);
      coords.push({ x, y });
    }
  }
  for (const key of Object.keys(mapData.foliage)) {
    if (mapData.foliage[key]) {
      const [x, y] = key.split(',').map(Number);
      coords.push({ x, y });
    }
  }
  for (const door of mapData.doors) {
    coords.push({ x: door.x, y: door.y });
  }
  for (const stairs of mapData.stairs) {
    coords.push({ x: stairs.x, y: stairs.y });
  }
  for (const prop of mapData.props) {
    coords.push({ x: prop.x, y: prop.y });
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
  mapData: MapData,
  bounds: BoundingBox,
  scale: number = 1,
  includeGrid: boolean = true
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

  renderMap(ctx, mapData, includeGrid ? bounds : null);

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

/**
 * Export Map as PNG
 */
export function exportToPng(mapData: MapData, scale: number = 2, includeGrid: boolean = true) {
  const bounds = computeMapBounds(mapData, 2);
  const canvas = renderOffscreenMap(mapData, bounds, scale, includeGrid);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
    triggerDownload(blob, `${cleanTitle}.png`);
  }, 'image/png');
}

/**
 * Export Map as Universal VTT (.dd2vtt)
 */
export function exportToVtt(mapData: MapData) {
  const bounds = computeMapBounds(mapData, 1);
  const canvas = renderOffscreenMap(mapData, bounds, 1, false);
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
  const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
  triggerDownload(blob, `${cleanTitle}.dd2vtt`);
}

/**
 * Export Map as Printable PDF (jsPDF)
 */
export function exportToPdf(mapData: MapData, includeGrid: boolean = true) {
  const bounds = computeMapBounds(mapData, 2);
  const canvas = renderOffscreenMap(mapData, bounds, 2, includeGrid);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const margin = 10;
  const availW = pageWidth - margin * 2;
  const availH = pageHeight - margin * 2;

  const imgAspect = canvas.width / canvas.height;
  let drawW = availW;
  let drawH = drawW / imgAspect;

  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * imgAspect;
  }

  const posX = (pageWidth - drawW) / 2;
  const posY = (pageHeight - drawH) / 2;

  pdf.addImage(imgData, 'JPEG', posX, posY, drawW, drawH);
  const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
  pdf.save(`${cleanTitle}.pdf`);
}
