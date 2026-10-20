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
    coords.push({ x: stairs.x + stairs.width - 1, y: stairs.y + stairs.height - 1 });
  }
  for (const prop of mapData.props) {
    coords.push({ x: prop.x, y: prop.y });
  }
  for (const label of mapData.labels) {
    coords.push({ x: Math.floor(label.x), y: Math.floor(label.y) });
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

function fileBaseName(mapData: MapData): string {
  return mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
}

export type ImageFormat = 'png' | 'webp';

/**
 * Export Map as a PNG or WebP image
 */
export function exportToImage(
  mapData: MapData,
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
  triggerDownload(blob, `${fileBaseName(mapData)}.dd2vtt`);
}

export type PdfLayout = 'fit' | 'tiled';
export type PaperSize = 'a4' | 'letter';

const MM_PER_INCH = 25.4;
const PDF_MARGIN_MM = 10;
// Raster resolution for printed pages: 150 px per 1-inch square
const PRINT_PX_PER_SQUARE = 150;

/**
 * Export Map as a printable PDF. "fit" scales the whole map onto one page;
 * "tiled" prints at true battlemap scale (1 square = 1 inch) across as many
 * pages as needed, ready to trim and tape together.
 */
export function exportToPdf(
  mapData: MapData,
  includeGrid: boolean = true,
  layout: PdfLayout = 'fit',
  paper: PaperSize = 'a4'
) {
  const bounds = computeMapBounds(mapData, layout === 'tiled' ? 1 : 2);
  const pdf =
    layout === 'tiled'
      ? buildTiledPdf(mapData, bounds, includeGrid, paper)
      : buildFitPdf(mapData, bounds, includeGrid, paper);
  pdf.save(`${fileBaseName(mapData)}.pdf`);
}

function buildFitPdf(
  mapData: MapData,
  bounds: BoundingBox,
  includeGrid: boolean,
  paper: PaperSize
): jsPDF {
  const canvas = renderOffscreenMap(mapData, bounds, 2, includeGrid);
  const imgData = canvas.toDataURL('image/jpeg', 0.95);

  const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({ orientation, unit: 'mm', format: paper });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const availW = pageWidth - PDF_MARGIN_MM * 2;
  const availH = pageHeight - PDF_MARGIN_MM * 2;

  const imgAspect = canvas.width / canvas.height;
  let drawW = availW;
  let drawH = drawW / imgAspect;
  if (drawH > availH) {
    drawH = availH;
    drawW = drawH * imgAspect;
  }

  pdf.addImage(imgData, 'JPEG', (pageWidth - drawW) / 2, (pageHeight - drawH) / 2, drawW, drawH);
  return pdf;
}

function buildTiledPdf(
  mapData: MapData,
  bounds: BoundingBox,
  includeGrid: boolean,
  paper: PaperSize
): jsPDF {
  // Pick the page orientation that needs the fewest sheets
  const layoutFor = (orientation: 'portrait' | 'landscape') => {
    const probe = new jsPDF({ orientation, unit: 'mm', format: paper });
    const pageW = probe.internal.pageSize.getWidth();
    const pageH = probe.internal.pageSize.getHeight();
    const perPageX = Math.floor((pageW - PDF_MARGIN_MM * 2) / MM_PER_INCH);
    const perPageY = Math.floor((pageH - PDF_MARGIN_MM * 2) / MM_PER_INCH);
    const cols = Math.ceil(bounds.width / perPageX);
    const rows = Math.ceil(bounds.height / perPageY);
    return { orientation, pageW, pageH, perPageX, perPageY, cols, rows };
  };
  const portrait = layoutFor('portrait');
  const landscape = layoutFor('landscape');
  const layout =
    landscape.cols * landscape.rows < portrait.cols * portrait.rows ? landscape : portrait;

  const pdf = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: paper });
  const scale = PRINT_PX_PER_SQUARE / mapData.gridSize;

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      if (row > 0 || col > 0) pdf.addPage(paper, layout.orientation);

      const minX = bounds.minX + col * layout.perPageX;
      const minY = bounds.minY + row * layout.perPageY;
      const maxX = Math.min(bounds.maxX, minX + layout.perPageX - 1);
      const maxY = Math.min(bounds.maxY, minY + layout.perPageY - 1);
      const tile: BoundingBox = {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      };

      const canvas = renderOffscreenMap(mapData, tile, scale, includeGrid);
      pdf.addImage(
        canvas.toDataURL('image/jpeg', 0.92),
        'JPEG',
        PDF_MARGIN_MM,
        PDF_MARGIN_MM,
        tile.width * MM_PER_INCH,
        tile.height * MM_PER_INCH
      );

      // Page position label so sheets can be assembled in order
      pdf.setFontSize(8);
      pdf.setTextColor(120);
      pdf.text(
        `${mapData.title} - row ${row + 1}/${layout.rows}, column ${col + 1}/${layout.cols}`,
        PDF_MARGIN_MM,
        layout.pageH - PDF_MARGIN_MM / 2
      );
    }
  }
  return pdf;
}
