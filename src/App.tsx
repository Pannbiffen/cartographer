import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MapData,
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  ThemeType,
  ViewportTransform,
  MapHistoryState,
} from './types/map';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { Sidebar } from './components/Sidebar';
import { MapCanvas } from './canvas/MapCanvas';
import { ExportModal } from './components/ExportModal';
import {
  generateBspDungeon,
  generateCaveSystem,
  generateRiver,
} from './core/generators/dungeonGenerator';
import { triggerDownload } from './core/export/imageExporter';
import { isTypingInField } from './core/keyboard';

// Initial cozy starter dungeon to greet the cartographer
function createDefaultStarterMap(): MapData {
  const rooms: { [key: string]: boolean } = {};
  const water: { [key: string]: boolean } = {};
  const foliage: { [key: string]: { type: 'tree' | 'bush' | 'rock'; seed: number } } = {};

  // Entrance courtyard (-3 to 3, -10 to -7)
  for (let x = -3; x <= 3; x++) {
    for (let y = -10; y <= -7; y++) {
      rooms[`${x},${y}`] = true;
    }
  }

  // Hallway (0, -6 to -3)
  for (let y = -6; y <= -3; y++) {
    rooms[`0,${y}`] = true;
  }

  // Grand Hall (-5 to 5, -2 to 6)
  for (let x = -5; x <= 5; x++) {
    for (let y = -2; y <= 6; y++) {
      rooms[`${x},${y}`] = true;
    }
  }

  // Subterranean Spring / Water Basin (1 to 4, 1 to 4)
  for (let x = 1; x <= 4; x++) {
    for (let y = 1; y <= 4; y++) {
      water[`${x},${y}`] = true;
    }
  }

  // East Chamber (7 to 11, -1 to 3), reached through a short passage
  rooms['6,1'] = true;
  for (let x = 7; x <= 11; x++) {
    for (let y = -1; y <= 3; y++) {
      rooms[`${x},${y}`] = true;
    }
  }

  // West Cave (-12 to -7, 2 to 7), behind a secret passage
  rooms['-6,4'] = true;
  for (let x = -12; x <= -7; x++) {
    for (let y = 2; y <= 7; y++) {
      rooms[`${x},${y}`] = true;
    }
  }

  // Foliage outside entrance
  foliage['-4,-9'] = { type: 'tree', seed: 101 };
  foliage['4,-9'] = { type: 'tree', seed: 202 };
  foliage['-5,-8'] = { type: 'bush', seed: 303 };
  foliage['5,-8'] = { type: 'rock', seed: 404 };

  return {
    version: 1,
    title: 'The Sunken Crypt',
    gridSize: 40,
    theme: 'parchment',
    showGrid: true,
    gridOpacity: 0.22,
    hatchDensity: 3,
    hatchLength: 14,
    rooms,
    water,
    foliage,
    doors: [
      { id: 'd1', x: 0, y: -6, orientation: 'horizontal', type: 'standard' },
      { id: 'd2', x: 6, y: 1, orientation: 'vertical', type: 'standard' },
      { id: 'd3', x: -5, y: 4, orientation: 'vertical', type: 'secret' },
    ],
    stairs: [
      { id: 's1', x: 0, y: -10, width: 2, height: 1, direction: 'down', steps: 4 },
    ],
    props: [
      { id: 'p1', x: -3, y: 0, type: 'pillar', rotation: 0 },
      { id: 'p2', x: -3, y: 4, type: 'pillar', rotation: 0 },
      { id: 'p3', x: 9, y: 1, type: 'altar', rotation: 0 },
      { id: 'p4', x: -10, y: 3, type: 'chest', rotation: 0 },
      { id: 'p5', x: -4, y: 2, type: 'torch', rotation: 0 },
    ],
  };
}

const MAX_HISTORY = 100;

export interface ModifyMapOptions {
  // Consecutive edits sharing a coalesce key (one brush stroke, one slider
  // drag, typing in the title) collapse into a single undo step
  coalesce?: string;
}

export type ModifyMap = (mutator: (draft: MapData) => void, options?: ModifyMapOptions) => void;

// Fill in any fields missing from older or hand-edited project files
function normalizeLoadedMap(parsed: Partial<MapData>): MapData {
  const defaults = createDefaultStarterMap();
  return {
    ...defaults,
    ...parsed,
    rooms: parsed.rooms ?? {},
    water: parsed.water ?? {},
    foliage: parsed.foliage ?? {},
    doors: parsed.doors ?? [],
    stairs: parsed.stairs ?? [],
    props: parsed.props ?? [],
  };
}

export function App() {
  const [history, setHistory] = useState<MapHistoryState>(() => ({
    past: [],
    present: createDefaultStarterMap(),
    future: [],
  }));
  const mapData = history.present;
  const lastCoalesceRef = useRef<string | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('room-brush');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [selectedDoorType, setSelectedDoorType] = useState<DoorType>('standard');
  const [selectedPropType, setSelectedPropType] = useState<PropType>('pillar');
  const [selectedFoliageType, setSelectedFoliageType] = useState<FoliageType>('tree');

  const [viewport, setViewport] = useState<ViewportTransform>({
    x: window.innerWidth ? window.innerWidth / 2 : 450,
    y: window.innerHeight ? window.innerHeight / 2 - 20 : 350,
    zoom: 1.0,
  });

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [hoverCoord, setHoverCoord] = useState<{ gx: number; gy: number } | null>(null);

  // Modify map state with an immer-style draft mutator. The state updater
  // stays pure so React StrictMode's double invocation can't record twice.
  const modifyMap = useCallback<ModifyMap>((mutator, options) => {
    const coalesce = options?.coalesce ?? null;
    const merge = coalesce !== null && coalesce === lastCoalesceRef.current;
    lastCoalesceRef.current = coalesce;

    setHistory((h) => {
      const prev = h.present;
      const next: MapData = {
        ...prev,
        rooms: { ...prev.rooms },
        water: { ...prev.water },
        foliage: { ...prev.foliage },
        doors: [...prev.doors],
        stairs: [...prev.stairs],
        props: [...prev.props],
      };
      mutator(next);
      return {
        past: merge ? h.past : [...h.past, prev].slice(-MAX_HISTORY),
        present: next,
        future: [],
      };
    });
  }, []);

  const resetMap = useCallback((map: MapData) => {
    lastCoalesceRef.current = null;
    setHistory({ past: [], present: map, future: [] });
  }, []);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    lastCoalesceRef.current = null;
    setHistory((h) => {
      if (h.past.length === 0) return h;
      return {
        past: h.past.slice(0, -1),
        present: h.past[h.past.length - 1],
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const handleRedo = useCallback(() => {
    lastCoalesceRef.current = null;
    setHistory((h) => {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      };
    });
  }, []);

  // Zoom helpers
  const handleZoomIn = () => {
    setViewport((v) => ({ ...v, zoom: Math.min(4.0, v.zoom * 1.25) }));
  };
  const handleZoomOut = () => {
    setViewport((v) => ({ ...v, zoom: Math.max(0.2, v.zoom / 1.25) }));
  };
  const handleResetZoom = () => {
    setViewport({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2 - 20,
      zoom: 1.0,
    });
  };

  // Project JSON Save/Load
  const handleSaveJson = useCallback(() => {
    const jsonStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
    triggerDownload(blob, `${cleanTitle}.dndmap`);
  }, [mapData]);

  const handleLoadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed && typeof parsed.rooms === 'object') {
          resetMap(normalizeLoadedMap(parsed));
        } else {
          alert('Invalid project file format.');
        }
      } catch {
        alert('Invalid project file format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField()) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) handleRedo();
          else handleUndo();
        } else if (key === 'y') {
          e.preventDefault();
          handleRedo();
        } else if (key === 's') {
          e.preventDefault();
          handleSaveJson();
        }
        return;
      }
      if (e.altKey) return;

      const toolKeys: Record<string, ToolType> = {
        b: 'room-brush',
        r: 'room-rect',
        t: 'tunnel',
        w: 'water',
        f: 'foliage',
        d: 'door',
        s: 'stairs',
        p: 'prop',
        e: 'eraser',
      };
      if (toolKeys[key]) {
        setActiveTool(toolKeys[key]);
      } else if (key === 'g') {
        modifyMap((draft) => {
          draft.showGrid = !draft.showGrid;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo, handleSaveJson, modifyMap]);

  // Procedural Generators
  const handleGenerateDungeon = () => {
    const res = generateBspDungeon(28, 20, 4);
    modifyMap((draft) => {
      draft.rooms = res.rooms;
      draft.water = {};
      draft.foliage = {};
      draft.doors = [];
      draft.stairs = [{ id: 's1', x: 0, y: 0, width: 1, height: 2, direction: 'down', steps: 4 }];
      draft.props = [];
    });
  };

  const handleGenerateCave = () => {
    const res = generateCaveSystem(32, 24, 0.45);
    modifyMap((draft) => {
      draft.rooms = res.rooms;
      draft.water = res.water;
      draft.foliage = {};
      draft.doors = [];
      draft.stairs = [];
      draft.props = [];
    });
  };

  const handleGenerateRiver = () => {
    const water = generateRiver(-18, 18, 0, 3);
    modifyMap((draft) => {
      draft.water = { ...draft.water, ...water };
    });
  };

  const handleClearMap = () => {
    if (window.confirm('Are you sure you want to clear the entire map?')) {
      modifyMap((draft) => {
        draft.rooms = {};
        draft.water = {};
        draft.foliage = {};
        draft.doors = [];
        draft.stairs = [];
        draft.props = [];
      });
    }
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-[#e8decb] text-[#2c221e] overflow-hidden select-none font-sans">
      {/* Top Header */}
      <Header
        title={mapData.title}
        onTitleChange={(title) => modifyMap((draft) => { draft.title = title; }, { coalesce: 'title' })}
        theme={mapData.theme}
        onThemeChange={(theme: ThemeType) => modifyMap((draft) => { draft.theme = theme; })}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        zoom={viewport.zoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onOpenExport={() => setIsExportOpen(true)}
        onSaveJson={handleSaveJson}
        onLoadJson={handleLoadJson}
      />

      {/* Main Workspace */}
      <main className="relative flex-1 w-full h-full overflow-hidden">
        {/* Floating Tool Palette */}
        <Toolbar activeTool={activeTool} onSelectTool={setActiveTool} />

        {/* Floating Right Inspector */}
        <Sidebar
          activeTool={activeTool}
          brushSize={brushSize}
          onBrushSizeChange={setBrushSize}
          selectedDoorType={selectedDoorType}
          onDoorTypeChange={setSelectedDoorType}
          selectedPropType={selectedPropType}
          onPropTypeChange={setSelectedPropType}
          selectedFoliageType={selectedFoliageType}
          onFoliageTypeChange={setSelectedFoliageType}
          mapData={mapData}
          onUpdateMapSettings={modifyMap}
          onGenerateDungeon={handleGenerateDungeon}
          onGenerateCave={handleGenerateCave}
          onGenerateRiver={handleGenerateRiver}
          onClearMap={handleClearMap}
          isOpen={isSidebarOpen}
          onToggleOpen={() => setIsSidebarOpen((v) => !v)}
        />

        {/* Multi-layer Canvas */}
        <MapCanvas
          mapData={mapData}
          activeTool={activeTool}
          brushSize={brushSize}
          selectedDoorType={selectedDoorType}
          selectedPropType={selectedPropType}
          selectedFoliageType={selectedFoliageType}
          viewport={viewport}
          onViewportChange={setViewport}
          onModifyMap={modifyMap}
          onHoverCoord={setHoverCoord}
        />

        {/* Bottom Status & Hint Bar */}
        <footer className="absolute bottom-2 left-4 right-4 z-10 pointer-events-none flex items-center justify-between text-xs text-[#bdae9c]">
          <div className="bg-[#231b17]/90 backdrop-blur-sm px-3 py-1 rounded-md border border-[#3d3129] font-mono pointer-events-auto shadow-md">
            {hoverCoord ? `Grid: (${hoverCoord.gx}, ${hoverCoord.gy})` : 'Canvas Ready'}
          </div>

          <div className="bg-[#231b17]/90 backdrop-blur-sm px-3 py-1 rounded-md border border-[#3d3129] font-sans hidden md:block pointer-events-auto shadow-md">
            <span className="text-[#d4af37] font-semibold">Shortcuts:</span>{' '}
            <span className="text-[#e8dfcf]">Space+Drag</span>: Pan |{' '}
            <span className="text-[#e8dfcf]">Wheel</span>: Zoom |{' '}
            <span className="text-[#e8dfcf]">B</span>: Room |{' '}
            <span className="text-[#e8dfcf]">W</span>: Water |{' '}
            <span className="text-[#e8dfcf]">F</span>: Foliage |{' '}
            <span className="text-[#e8dfcf]">Ctrl+Z</span>: Undo
          </div>
        </footer>
      </main>

      {/* Export Modal */}
      <ExportModal
        mapData={mapData}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}

export default App;
