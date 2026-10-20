import React from 'react';
import type { ToolType, DoorType, PropType, MapData } from '../types/map';
import type { ModifyMap } from '../App';
import {
  Sliders,
  Grid,
  Layers,
  Wand2,
  Trash2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface SidebarProps {
  activeTool: ToolType;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  selectedDoorType: DoorType;
  onDoorTypeChange: (type: DoorType) => void;
  selectedPropType: PropType;
  onPropTypeChange: (type: PropType) => void;
  mapData: MapData;
  onUpdateMapSettings: ModifyMap;
  onGenerateDungeon: () => void;
  onGenerateCave: () => void;
  onGenerateRiver: () => void;
  onClearMap: () => void;
  isOpen: boolean;
  onToggleOpen: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTool,
  brushSize,
  onBrushSizeChange,
  selectedDoorType,
  onDoorTypeChange,
  selectedPropType,
  onPropTypeChange,
  mapData,
  onUpdateMapSettings,
  onGenerateDungeon,
  onGenerateCave,
  onGenerateRiver,
  onClearMap,
  isOpen,
  onToggleOpen,
}) => {
  const roomCount = Object.keys(mapData.rooms).length;
  const waterCount = Object.keys(mapData.water).length;
  const foliageCount = Object.keys(mapData.foliage).length;

  return (
    <div className="absolute right-4 top-20 z-10 flex items-start">
      {/* Toggle button */}
      <button
        onClick={onToggleOpen}
        title={isOpen ? 'Collapse Panel' : 'Expand Panel'}
        className="bg-[#231b17]/95 border border-[#3d3129] p-2 rounded-l-lg text-[#e8dfcf] hover:bg-[#342923] shadow-md transition"
      >
        {isOpen ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>

      {isOpen && (
        <aside className="w-72 bg-[#231b17]/95 backdrop-blur-md border border-[#3d3129] rounded-r-xl rounded-b-xl shadow-xl p-4 text-[#e8dfcf] max-h-[calc(100vh-6.5rem)] overflow-y-auto flex flex-col gap-5">
          {/* Active Tool Options */}
          <section>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d4af37] mb-2.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>Tool Options</span>
            </div>

            {/* Brush size */}
            {(activeTool === 'room-brush' ||
              activeTool === 'tunnel' ||
              activeTool === 'water' ||
              activeTool === 'foliage' ||
              activeTool === 'eraser') && (
              <div className="mb-3">
                <div className="flex justify-between text-xs text-[#bdae9c] mb-1">
                  <span>Brush Size</span>
                  <span className="font-mono text-[#f2ebd9]">{brushSize}x{brushSize}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  step="1"
                  value={brushSize}
                  onChange={(e) => onBrushSizeChange(parseInt(e.target.value, 10))}
                  className="w-full accent-[#8b3a2b] cursor-pointer"
                />
              </div>
            )}

            {/* Door Type */}
            {activeTool === 'door' && (
              <div className="mb-3">
                <label className="text-xs text-[#bdae9c] block mb-1">Door Type</label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {(['standard', 'double', 'secret', 'portcullis'] as DoorType[]).map((type) => (
                    <button
                      key={type}
                      onClick={() => onDoorTypeChange(type)}
                      className={`py-1.5 px-2 rounded capitalize border transition ${
                        selectedDoorType === type
                          ? 'bg-[#8b3a2b] border-[#c2513d] text-white font-medium'
                          : 'bg-[#181310] border-[#3d3129] text-[#bdae9c] hover:bg-[#281f1a]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Prop Type */}
            {activeTool === 'prop' && (
              <div className="mb-3">
                <label className="text-xs text-[#bdae9c] block mb-1">Select Prop</label>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {(
                    ['pillar', 'chest', 'table', 'altar', 'torch', 'barrel', 'sarcophagus'] as PropType[]
                  ).map((type) => (
                    <button
                      key={type}
                      onClick={() => onPropTypeChange(type)}
                      className={`py-1.5 px-2 rounded capitalize border transition ${
                        selectedPropType === type
                          ? 'bg-[#8b3a2b] border-[#c2513d] text-white font-medium'
                          : 'bg-[#181310] border-[#3d3129] text-[#bdae9c] hover:bg-[#281f1a]'
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Style & Dyson Hatching Settings */}
          <section className="border-t border-[#3d3129] pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d4af37] mb-2.5">
              <Layers className="w-3.5 h-3.5" />
              <span>Dyson Hatching Style</span>
            </div>

            <div className="flex flex-col gap-2.5 text-xs">
              <div>
                <div className="flex justify-between text-[#bdae9c] mb-1">
                  <span>Hatch Length</span>
                  <span className="font-mono text-[#f2ebd9]">{mapData.hatchLength}px</span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="24"
                  value={mapData.hatchLength}
                  onChange={(e) =>
                    onUpdateMapSettings((draft) => {
                      draft.hatchLength = parseInt(e.target.value, 10);
                    }, { coalesce: 'hatchLength' })
                  }
                  className="w-full accent-[#8b3a2b] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[#bdae9c] mb-1">
                  <span>Hatch Density</span>
                  <span className="font-mono text-[#f2ebd9]">{mapData.hatchDensity}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="5"
                  value={mapData.hatchDensity}
                  onChange={(e) =>
                    onUpdateMapSettings((draft) => {
                      draft.hatchDensity = parseInt(e.target.value, 10);
                    }, { coalesce: 'hatchDensity' })
                  }
                  className="w-full accent-[#8b3a2b] cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* Grid Settings */}
          <section className="border-t border-[#3d3129] pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d4af37] mb-2.5">
              <Grid className="w-3.5 h-3.5" />
              <span>Grid Settings</span>
            </div>

            <div className="flex flex-col gap-2.5 text-xs">
              <label className="flex items-center justify-between text-[#bdae9c] cursor-pointer">
                <span>Show Battle Grid</span>
                <input
                  type="checkbox"
                  checked={mapData.showGrid}
                  onChange={(e) =>
                    onUpdateMapSettings((draft) => {
                      draft.showGrid = e.target.checked;
                    })
                  }
                  className="w-4 h-4 accent-[#8b3a2b] cursor-pointer"
                />
              </label>

              <div>
                <div className="flex justify-between text-[#bdae9c] mb-1">
                  <span>Grid Opacity</span>
                  <span className="font-mono text-[#f2ebd9]">
                    {Math.round(mapData.gridOpacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="0.8"
                  step="0.05"
                  value={mapData.gridOpacity}
                  onChange={(e) =>
                    onUpdateMapSettings((draft) => {
                      draft.gridOpacity = parseFloat(e.target.value);
                    }, { coalesce: 'gridOpacity' })
                  }
                  className="w-full accent-[#8b3a2b] cursor-pointer"
                />
              </div>
            </div>
          </section>

          {/* Procedural Generators */}
          <section className="border-t border-[#3d3129] pt-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#d4af37] mb-2.5">
              <Wand2 className="w-3.5 h-3.5" />
              <span>Procedural Generators</span>
            </div>

            <div className="flex flex-col gap-1.5 text-xs">
              <button
                onClick={onGenerateDungeon}
                className="w-full py-2 px-3 bg-[#181310] hover:bg-[#2e231e] border border-[#3d3129] rounded text-left flex items-center justify-between text-[#f2ebd9] transition"
              >
                <span>🏰 BSP Dungeon</span>
                <span className="text-[10px] text-[#bdae9c]">Rooms & Halls</span>
              </button>

              <button
                onClick={onGenerateCave}
                className="w-full py-2 px-3 bg-[#181310] hover:bg-[#2e231e] border border-[#3d3129] rounded text-left flex items-center justify-between text-[#f2ebd9] transition"
              >
                <span>🕳️ Cellular Cave</span>
                <span className="text-[10px] text-[#bdae9c]">Organic Caverns</span>
              </button>

              <button
                onClick={onGenerateRiver}
                className="w-full py-2 px-3 bg-[#181310] hover:bg-[#2e231e] border border-[#3d3129] rounded text-left flex items-center justify-between text-[#f2ebd9] transition"
              >
                <span>🌊 Meandering River</span>
                <span className="text-[10px] text-[#bdae9c]">Water Ripples</span>
              </button>
            </div>
          </section>

          {/* Stats & Clear Map */}
          <section className="border-t border-[#3d3129] pt-3 flex flex-col gap-2">
            <div className="text-[11px] text-[#bdae9c] flex justify-between">
              <span>Rooms: {roomCount}</span>
              <span>Water: {waterCount}</span>
              <span>Trees: {foliageCount}</span>
            </div>

            <button
              onClick={onClearMap}
              className="w-full py-1.5 px-3 bg-red-950/40 hover:bg-red-900/60 border border-red-800/40 rounded text-red-200 text-xs flex items-center justify-center gap-1.5 transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Canvas</span>
            </button>
          </section>
        </aside>
      )}
    </div>
  );
};
