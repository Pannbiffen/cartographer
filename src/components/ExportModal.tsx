import React, { useState } from 'react';
import type { LevelMap } from '../types/map';
import { exportToImage, exportToVtt } from '../core/export/imageExporter';
import type { ImageFormat } from '../core/export/imageExporter';
import type { PdfLayout, PaperSize } from '../core/export/pdfExporter';
import { Dialog, DialogGroup } from './Dialog';
import { BUTTON_CLASS, FIELD_CLASS } from './options';

interface ExportModalProps {
  mapData: LevelMap;
  // Set when the map has several levels: only the current one is exported
  levelName?: string;
  isOpen: boolean;
  onSaveProject: () => void;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ mapData, levelName, isOpen, onSaveProject, onClose }) => {
  const [scale, setScale] = useState<number>(2);
  const [includeGrid, setIncludeGrid] = useState<boolean>(true);
  const [copiedVtt, setCopiedVtt] = useState<boolean>(false);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [paper, setPaper] = useState<PaperSize>('a4');
  // The PDF library loads on first use, which can take a moment
  const [pdfBusy, setPdfBusy] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleExportImage = () => {
    exportToImage(mapData, scale, includeGrid, format);
  };

  const handleExportVtt = () => {
    exportToVtt(mapData);
    setCopiedVtt(true);
    setTimeout(() => setCopiedVtt(false), 2500);
  };

  const handleExportPdf = async (layout: PdfLayout) => {
    setPdfBusy(true);
    try {
      const { exportToPdf } = await import('../core/export/pdfExporter');
      exportToPdf(mapData, includeGrid, layout, paper);
    } catch {
      alert('Could not load the PDF exporter. Check your connection and try again.');
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Dialog title="Export" onClose={onClose}>
      {levelName !== undefined && (
        <p className="text-ui-muted leading-snug">
          Exports the current level, “{levelName}”. Switch level to export another; the project file keeps them all.
        </p>
      )}
      <DialogGroup title="Image">
        <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2">
          <span>Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ImageFormat)}
            className={FIELD_CLASS}
          >
            <option value="png">PNG (lossless)</option>
            <option value="webp">WebP (smaller file)</option>
          </select>
          <span>Resolution</span>
          <select
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            className={FIELD_CLASS}
          >
            {[1, 2, 3, 4].map((s) => (
              <option key={s} value={s}>
                {s}x - {mapData.gridSize * s} px per square
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeGrid}
              onChange={(e) => setIncludeGrid(e.target.checked)}
              className="accent-ui-accent"
            />
            <span>Grid lines (image and PDF)</span>
          </label>
          <button onClick={handleExportImage} className={BUTTON_CLASS}>
            Download {format.toUpperCase()}
          </button>
        </div>
      </DialogGroup>

      <DialogGroup title="Printable PDF">
        <div className="flex items-center gap-3">
          <span>Paper</span>
          <select
            value={paper}
            onChange={(e) => setPaper(e.target.value as PaperSize)}
            className={FIELD_CLASS}
          >
            <option value="a4">A4</option>
            <option value="letter">US Letter</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => handleExportPdf('fit')}
            disabled={pdfBusy}
            className={`${BUTTON_CLASS} text-left`}>
            <div>Fit to one page</div>
            <div className="text-ui-muted">Overview handout</div>
          </button>
          <button
            onClick={() => handleExportPdf('tiled')}
            disabled={pdfBusy}
            className={`${BUTTON_CLASS} text-left`}>
            <div>True scale (1&quot; squares)</div>
            <div className="text-ui-muted">Tiled for minis</div>
          </button>
        </div>
      </DialogGroup>

      <DialogGroup title="Virtual tabletop">
        <p className="text-ui-muted leading-snug">
          Universal VTT file with walls, doors and torch lights, for Foundry VTT (Universal
          Battlemap Importer), Fantasy Grounds Unity and other compatible tables.
        </p>
        <div className="flex justify-end">
          <button onClick={handleExportVtt} className={BUTTON_CLASS}>
            {copiedVtt ? 'Downloaded' : 'Download .dd2vtt'}
          </button>
        </div>
      </DialogGroup>

      <div className="flex justify-between">
        <button onClick={onSaveProject} className={BUTTON_CLASS}>
          Save project (.dndmap)
        </button>
        <button onClick={onClose} className={BUTTON_CLASS}>
          Close
        </button>
      </div>
    </Dialog>
  );
};
