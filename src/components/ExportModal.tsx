import React, { useState } from 'react';
import type { MapData } from '../types/map';
import { exportToImage, exportToVtt, exportToPdf, triggerDownload } from '../core/export/imageExporter';
import type { ImageFormat, PaperSize } from '../core/export/imageExporter';
import { X, Image, FileText, Sparkles, Save, Check } from 'lucide-react';

interface ExportModalProps {
  mapData: MapData;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ mapData, isOpen, onClose }) => {
  const [scale, setScale] = useState<number>(2);
  const [includeGrid, setIncludeGrid] = useState<boolean>(true);
  const [copiedVtt, setCopiedVtt] = useState<boolean>(false);
  const [format, setFormat] = useState<ImageFormat>('png');
  const [paper, setPaper] = useState<PaperSize>('a4');

  if (!isOpen) return null;

  const handleExportImage = () => {
    exportToImage(mapData, scale, includeGrid, format);
  };

  const handleExportVtt = () => {
    exportToVtt(mapData);
    setCopiedVtt(true);
    setTimeout(() => setCopiedVtt(false), 2500);
  };

  const handleExportPdf = (layout: 'fit' | 'tiled') => {
    exportToPdf(mapData, includeGrid, layout, paper);
  };

  const handleExportJson = () => {
    const jsonStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
    triggerDownload(blob, `${cleanTitle}.dndmap`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-[#231b17] border border-[#3d3129] rounded-2xl shadow-2xl p-6 text-[#e8dfcf] flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3d3129] pb-3">
          <div className="flex items-center gap-2 text-[#d4af37]">
            <Sparkles className="w-5 h-5" />
            <h2 className="text-lg font-serif font-bold">Export Battlemap</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#bdae9c] hover:text-white hover:bg-[#342923] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Export Options Grid */}
        <div className="flex flex-col gap-4 text-sm">
          {/* 1. Image Export (PNG) */}
          <div className="p-4 bg-[#181310] border border-[#3d3129] rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-[#f2ebd9]">
                <Image className="w-4 h-4 text-emerald-400" />
                <span>Image (PNG / WebP)</span>
              </div>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ImageFormat)}
                className="bg-[#231b17] border border-[#3d3129] text-[#e8dfcf] px-2 py-1 rounded outline-none text-xs"
              >
                <option value="png">PNG (lossless)</option>
                <option value="webp">WebP (smaller file)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="text-[#bdae9c] block mb-1">Resolution</label>
                <select
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full bg-[#231b17] border border-[#3d3129] text-[#e8dfcf] px-2.5 py-1.5 rounded outline-none"
                >
                  {[1, 2, 3, 4].map((s) => (
                    <option key={s} value={s}>
                      {s}x - {mapData.gridSize * s} px per square
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end pb-1.5">
                <label className="flex items-center gap-2 text-[#bdae9c] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeGrid}
                    onChange={(e) => setIncludeGrid(e.target.checked)}
                    className="w-4 h-4 accent-[#8b3a2b]"
                  />
                  <span>Render Grid Lines</span>
                </label>
              </div>
            </div>

            <button
              onClick={handleExportImage}
              className="w-full py-2 bg-[#8b3a2b] hover:bg-[#a64634] text-white font-medium rounded-lg shadow transition flex items-center justify-center gap-2"
            >
              <Image className="w-4 h-4" />
              <span>Download {format.toUpperCase()} Image</span>
            </button>
          </div>

          {/* 2. Universal VTT (.dd2vtt) */}
          <div className="p-4 bg-[#181310] border border-[#3d3129] rounded-xl flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-semibold text-[#f2ebd9]">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span>Universal VTT (.dd2vtt)</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 bg-emerald-950/70 border border-emerald-700/60 text-emerald-300 rounded-full font-medium">
                100% Free
              </span>
            </div>
            <p className="text-xs text-[#bdae9c] leading-relaxed">
              Export line-of-sight walls, door portals, and torch lights. Import into Foundry VTT (with the Universal Battlemap Importer module), Fantasy Grounds Unity, and other Universal VTT-compatible tables.
            </p>
            <button
              onClick={handleExportVtt}
              className="w-full py-2 bg-[#2c4c5e] hover:bg-[#39637b] text-white font-medium rounded-lg shadow transition flex items-center justify-center gap-2"
            >
              {copiedVtt ? <Check className="w-4 h-4 text-emerald-300" /> : <Sparkles className="w-4 h-4" />}
              <span>{copiedVtt ? 'Downloaded dd2vtt!' : 'Download Universal VTT (.dd2vtt)'}</span>
            </button>
          </div>

          {/* 3. Printable PDF & Project Save */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-[#181310] border border-[#3d3129] rounded-xl flex flex-col gap-2 col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#f2ebd9] text-xs">
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Printable PDF</span>
                </div>
                <select
                  value={paper}
                  onChange={(e) => setPaper(e.target.value as PaperSize)}
                  className="bg-[#231b17] border border-[#3d3129] text-[#e8dfcf] px-2 py-1 rounded outline-none text-xs"
                >
                  <option value="a4">A4</option>
                  <option value="letter">US Letter</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  onClick={() => handleExportPdf('fit')}
                  className="py-2 px-2 bg-[#231b17] hover:bg-[#2e231e] border border-[#3d3129] rounded-lg text-left transition"
                >
                  <div className="font-medium text-[#f2ebd9]">Fit to one page</div>
                  <div className="text-[11px] text-[#bdae9c]">Overview handout</div>
                </button>
                <button
                  onClick={() => handleExportPdf('tiled')}
                  className="py-2 px-2 bg-[#231b17] hover:bg-[#2e231e] border border-[#3d3129] rounded-lg text-left transition"
                >
                  <div className="font-medium text-[#f2ebd9]">True scale (1&quot; squares)</div>
                  <div className="text-[11px] text-[#bdae9c]">Tiled for minis</div>
                </button>
              </div>
            </div>

            <button
              onClick={handleExportJson}
              className="col-span-2 p-3 bg-[#181310] hover:bg-[#2e231e] border border-[#3d3129] rounded-xl text-left flex flex-col gap-1 transition"
            >
              <div className="flex items-center gap-1.5 font-semibold text-[#f2ebd9] text-xs">
                <Save className="w-4 h-4 text-purple-400" />
                <span>Save Project JSON</span>
              </div>
              <p className="text-[11px] text-[#bdae9c]">Save locally to edit anytime.</p>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
