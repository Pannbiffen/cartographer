import React, { useRef } from 'react';
import type { ThemeType } from '../types/map';
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Download,
  FolderOpen,
  Save,
  Compass,
} from 'lucide-react';

interface HeaderProps {
  title: string;
  onTitleChange: (title: string) => void;
  theme: ThemeType;
  onThemeChange: (theme: ThemeType) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onOpenExport: () => void;
  onSaveJson: () => void;
  onLoadJson: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  onTitleChange,
  theme,
  onThemeChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onOpenExport,
  onSaveJson,
  onLoadJson,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <header className="h-14 bg-[#231b17] text-[#e8dfcf] border-b border-[#3d3129] px-4 flex items-center justify-between select-none shadow-md z-20">
      {/* Brand & Map Title */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[#d4af37]">
          <Compass className="w-6 h-6 stroke-[2.2]" />
          <span className="font-serif font-bold text-lg tracking-wider font-['Cinzel'] hidden sm:inline">
            CARTOGRAPHER
          </span>
        </div>

        <div className="h-5 w-[1px] bg-[#42342c] mx-1 hidden sm:block" />

        <input
          type="text"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Map Title..."
          className="bg-[#181310] hover:bg-[#15100d] focus:bg-[#120e0b] text-[#f2ebd9] px-3 py-1 text-sm rounded border border-[#42342c] focus:border-[#d4af37] outline-none font-serif w-44 sm:w-60 transition"
        />
      </div>

      {/* Center Controls: Undo/Redo & Zoom */}
      <div className="flex items-center gap-1 sm:gap-2">
        <div className="flex items-center bg-[#1a1411] border border-[#3d3129] rounded p-0.5">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-[#2e231e] disabled:opacity-30 disabled:hover:bg-transparent text-[#e8dfcf] transition"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-[#2e231e] disabled:opacity-30 disabled:hover:bg-transparent text-[#e8dfcf] transition"
          >
            <Redo2 className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center bg-[#1a1411] border border-[#3d3129] rounded px-1 py-0.5">
          <button
            onClick={onZoomOut}
            title="Zoom Out"
            className="p-1 rounded hover:bg-[#2e231e] text-[#e8dfcf] transition"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono px-2 text-[#b8ab99] min-w-12 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={onZoomIn}
            title="Zoom In"
            className="p-1 rounded hover:bg-[#2e231e] text-[#e8dfcf] transition"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onResetZoom}
            title="Reset View"
            className="p-1 ml-1 rounded hover:bg-[#2e231e] text-[#b8ab99] hover:text-[#e8dfcf] transition"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Right Controls: Theme, Save, Export, GitHub */}
      <div className="flex items-center gap-2">
        {/* Theme Picker */}
        <select
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as ThemeType)}
          className="bg-[#1a1411] text-[#e8dfcf] border border-[#3d3129] text-xs px-2.5 py-1.5 rounded focus:border-[#d4af37] outline-none cursor-pointer"
        >
          <option value="parchment">📜 Parchment (Cozy)</option>
          <option value="blueprint">📐 AD&D Blueprint</option>
          <option value="slate">🌑 Dark Slate</option>
          <option value="monochrome">🖋️ Monochrome Ink</option>
        </select>

        {/* Save/Load JSON */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.dndmap"
          onChange={onLoadJson}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          title="Open Map Project (.dndmap / .json)"
          className="p-1.5 bg-[#1a1411] hover:bg-[#2e231e] border border-[#3d3129] rounded text-[#e8dfcf] transition hidden md:flex items-center gap-1.5 text-xs"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>Open</span>
        </button>

        <button
          onClick={onSaveJson}
          title="Save Project JSON (.dndmap)"
          className="p-1.5 bg-[#1a1411] hover:bg-[#2e231e] border border-[#3d3129] rounded text-[#e8dfcf] transition hidden md:flex items-center gap-1.5 text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save</span>
        </button>

        {/* Export Button */}
        <button
          onClick={onOpenExport}
          className="flex items-center gap-1.5 bg-[#8b3a2b] hover:bg-[#a64634] text-white px-3 py-1.5 rounded text-xs font-semibold shadow-sm transition"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        {/* GitHub link */}
        <a
          href="https://github.com/Pannbiffen/cartographer"
          target="_blank"
          rel="noopener noreferrer"
          title="GitHub Repository"
          className="p-1.5 text-[#b8ab99] hover:text-white transition"
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
        </a>
      </div>
    </header>
  );
};
