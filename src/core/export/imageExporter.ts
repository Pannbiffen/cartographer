// High-resolution image exporter, bounding box calculator, and PDF exporter
import type { MapData } from '../../types/map';
import { THEMES } from '../theme';
import {
  extractWallSegments,
  renderDysonHatching,
  renderWallOutlines,
  extractWaterSegments,
  renderWaterRipples,
  renderFoliageCluster,
} from '../geometry/hatching';
import { renderDoor, renderStairs, renderProp } from '../renderers/propsRenderer';
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

  // 1. Water
  const waterKeys = Object.keys(mapData.water);
  if (waterKeys.length > 0) {
    ctx.fillStyle = theme.waterTint;
    ctx.beginPath();
    for (const key of waterKeys) {
      if (!mapData.water[key]) continue;
      const [gx, gy] = key.split(',').map(Number);
      ctx.rect(gx * gridSize, gy * gridSize, gridSize, gridSize);
    }
    ctx.fill();

    const waterSegments = extractWaterSegments(mapData.water, gridSize);
    renderWaterRipples(ctx, waterSegments, theme.waterRipples);
  }

  // 2. Floor & Hatching
  const roomKeys = Object.keys(mapData.rooms);
  if (roomKeys.length > 0) {
    ctx.fillStyle = theme.floor;
    ctx.beginPath();
    for (const key of roomKeys) {
      if (!mapData.rooms[key]) continue;
      const [gx, gy] = key.split(',').map(Number);
      ctx.rect(gx * gridSize, gy * gridSize, gridSize, gridSize);
    }
    ctx.fill();

    const wallSegments = extractWallSegments(mapData.rooms, gridSize);
    renderDysonHatching(
      ctx,
      wallSegments,
      gridSize,
      mapData.hatchLength,
      mapData.hatchDensity,
      theme.hatch
    );
    renderWallOutlines(ctx, wallSegments, 3.2, theme.ink);
  }

  // 3. Foliage
  for (const key of Object.keys(mapData.foliage)) {
    const item = mapData.foliage[key];
    if (!item) continue;
    const [gx, gy] = key.split(',').map(Number);
    renderFoliageCluster(
      ctx,
      gx,
      gy,
      gridSize,
      item.type,
      item.seed,
      theme.foliageInk,
      theme.foliageFill
    );
  }

  // 4. Props, Doors, Stairs
  for (const stairs of mapData.stairs) {
    renderStairs(ctx, stairs, gridSize, theme.ink, theme.floor);
  }
  for (const door of mapData.doors) {
    renderDoor(ctx, door, gridSize, theme.ink, theme.propFill);
  }
  for (const prop of mapData.props) {
    renderProp(ctx, prop, gridSize, theme.ink);
  }

  // 5. Grid
  if (includeGrid && mapData.showGrid) {
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = mapData.gridOpacity;

    ctx.beginPath();
    for (let x = bounds.minX; x <= bounds.maxX + 1; x++) {
      ctx.moveTo(x * gridSize, bounds.minY * gridSize);
      ctx.lineTo(x * gridSize, (bounds.maxY + 1) * gridSize);
    }
    for (let y = bounds.minY; y <= bounds.maxY + 1; y++) {
      ctx.moveTo(bounds.minX * gridSize, y * gridSize);
      ctx.lineTo((bounds.maxX + 1) * gridSize, y * gridSize);
    }
    ctx.stroke();
    ctx.restore();
  }

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
