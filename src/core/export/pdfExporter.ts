// Printable PDF exporter. Imported on demand so jsPDF stays out of the main bundle.
import type { LevelMap } from '../../types/map';
import { jsPDF } from 'jspdf';
import { computeMapBounds, fileBaseName, renderOffscreenMap, type BoundingBox } from './imageExporter';

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
  mapData: LevelMap,
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
  mapData: LevelMap,
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
  mapData: LevelMap,
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
