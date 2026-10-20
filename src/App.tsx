import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MapData,
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  ViewportTransform,
  MapHistoryState,
  Selection,
} from './types/map';
import { MenuBar, type Menu } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';
import { DockPanel } from './components/DockPanel';
import { TOOLS } from './components/options';
import { MapCanvas } from './canvas/MapCanvas';
import { ExportModal } from './components/ExportModal';
import {
  generateBspDungeon,
  generateCaveSystem,
  generateRiver,
} from './core/generators/dungeonGenerator';
import { triggerDownload } from './core/export/imageExporter';
import { isTypingInField } from './core/keyboard';
import { loadAutosave, saveAutosave } from './core/autosave';
import { deleteObject, findSelected, rotateObject } from './core/objects';

const AUTOSAVE_DELAY_MS = 800;

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
    labels: [
      { id: 'l1', x: 0.5, y: 5.5, text: 'Grand Hall', size: 20 },
      { id: 'l2', x: -9, y: 6.5, text: 'Hidden Vault', size: 16 },
    ],
  };
}

const MAX_HISTORY = 100;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;

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
    labels: parsed.labels ?? [],
  };
}

// Resume the autosaved map if there is one, otherwise show the starter dungeon
function initialMap(): MapData {
  const saved = loadAutosave();
  return saved ? normalizeLoadedMap(saved) : createDefaultStarterMap();
}

export function App() {
  const [history, setHistory] = useState<MapHistoryState>(() => ({
    past: [],
    present: initialMap(),
    future: [],
  }));
  const mapData = history.present;
  const lastCoalesceRef = useRef<string | null>(null);

  const [activeTool, setActiveTool] = useState<ToolType>('room-brush');
  const [selection, setSelection] = useState<Selection | null>(null);
  // A selection whose object was removed (undo, eraser) counts as none
  const activeSelection = findSelected(mapData, selection) ? selection : null;

  const chooseTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (tool !== 'select' && tool !== 'label') setSelection(null);
  }, []);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [selectedDoorType, setSelectedDoorType] = useState<DoorType>('standard');
  const [selectedPropType, setSelectedPropType] = useState<PropType>('pillar');
  const [selectedFoliageType, setSelectedFoliageType] = useState<FoliageType>('tree');

  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  // Canvas size in CSS pixels, known after its first layout
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isPanelOpen, setIsPanelOpen] = useState<boolean>(true);
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
        labels: [...prev.labels],
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

  // Autosave shortly after the map stops changing
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAutosaveStatus(saveAutosave(mapData) ? 'saved' : 'failed');
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [mapData]);

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

  // Zoom about the centre of the canvas
  const zoomTo = useCallback(
    (zoomFor: (zoom: number) => number) => {
      const cx = (canvasSize?.width ?? 0) / 2;
      const cy = (canvasSize?.height ?? 0) / 2;
      setViewport((v) => {
        const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoomFor(v.zoom)));
        return {
          x: cx - (cx - v.x) * (zoom / v.zoom),
          y: cy - (cy - v.y) * (zoom / v.zoom),
          zoom,
        };
      });
    },
    [canvasSize]
  );
  const handleZoomIn = useCallback(() => zoomTo((z) => z * 1.25), [zoomTo]);
  const handleZoomOut = useCallback(() => zoomTo((z) => z / 1.25), [zoomTo]);
  const handleActualSize = useCallback(() => zoomTo(() => 1), [zoomTo]);

  // Centre the map origin once the canvas has a size
  const hasPlacedViewRef = useRef(false);
  useEffect(() => {
    if (!canvasSize || hasPlacedViewRef.current) return;
    hasPlacedViewRef.current = true;
    setViewport({ x: canvasSize.width / 2, y: canvasSize.height / 2, zoom: 1 });
  }, [canvasSize]);

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

  const toggleGrid = useCallback(() => {
    modifyMap((draft) => {
      draft.showGrid = !draft.showGrid;
    });
  }, [modifyMap]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField()) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        if (key === 'o') {
          e.preventDefault();
          fileInputRef.current?.click();
        } else if (key === 'e') {
          e.preventDefault();
          setIsExportOpen(true);
        } else if (key === '1') {
          e.preventDefault();
          handleActualSize();
        } else if (key === 'z') {
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

      // Selection editing with the select tool
      if (key === 'escape') {
        if (isExportOpen) setIsExportOpen(false);
        else setSelection(null);
        return;
      }
      if (key === '+' || key === '=') {
        handleZoomIn();
        return;
      }
      if (key === '-') {
        handleZoomOut();
        return;
      }
      if (activeSelection && (activeTool === 'select' || activeTool === 'label')) {
        if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          modifyMap((draft) => deleteObject(draft, activeSelection));
          setSelection(null);
          return;
        }
        if (key === 'r') {
          modifyMap((draft) => rotateObject(draft, activeSelection));
          return;
        }
      }

      const tool = TOOLS.find((t) => t.shortcut.toLowerCase() === key);
      if (tool) {
        chooseTool(tool.id);
      } else if (key === 'g') {
        toggleGrid();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleUndo,
    handleRedo,
    handleSaveJson,
    handleZoomIn,
    handleZoomOut,
    handleActualSize,
    toggleGrid,
    modifyMap,
    chooseTool,
    activeSelection,
    activeTool,
    isExportOpen,
  ]);

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
      draft.labels = [];
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
      draft.labels = [];
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
        draft.labels = [];
      });
    }
  };

  const selectionEditable = activeSelection !== null && (activeTool === 'select' || activeTool === 'label');
  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'Open…', shortcut: 'Ctrl+O', onSelect: () => fileInputRef.current?.click() },
        { label: 'Save', shortcut: 'Ctrl+S', onSelect: handleSaveJson },
        'separator',
        { label: 'Export…', shortcut: 'Ctrl+E', onSelect: () => setIsExportOpen(true) },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: handleUndo, disabled: history.past.length === 0 },
        { label: 'Redo', shortcut: 'Ctrl+Y', onSelect: handleRedo, disabled: history.future.length === 0 },
        'separator',
        {
          label: 'Rotate Selection',
          shortcut: 'R',
          disabled: !selectionEditable,
          onSelect: () => activeSelection && modifyMap((draft) => rotateObject(draft, activeSelection)),
        },
        {
          label: 'Delete Selection',
          shortcut: 'Del',
          disabled: !selectionEditable,
          onSelect: () => {
            if (!activeSelection) return;
            modifyMap((draft) => deleteObject(draft, activeSelection));
            setSelection(null);
          },
        },
        'separator',
        { label: 'Clear Map…', onSelect: handleClearMap },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: '+', onSelect: handleZoomIn },
        { label: 'Zoom Out', shortcut: '-', onSelect: handleZoomOut },
        { label: 'Actual Size', shortcut: 'Ctrl+1', onSelect: handleActualSize },
        'separator',
        { label: 'Show Grid', shortcut: 'G', checked: mapData.showGrid, onSelect: toggleGrid },
        { label: 'Properties Panel', checked: isPanelOpen, onSelect: () => setIsPanelOpen((v) => !v) },
      ],
    },
    {
      label: 'Tools',
      items: [
        ...TOOLS.map((t) => ({
          label: t.label,
          shortcut: t.shortcut,
          checked: activeTool === t.id,
          onSelect: () => chooseTool(t.id),
        })),
        'separator',
        { label: 'Generate Dungeon', onSelect: handleGenerateDungeon },
        { label: 'Generate Cave', onSelect: handleGenerateCave },
        { label: 'Add River', onSelect: handleGenerateRiver },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'Source Code on GitHub',
          onSelect: () => window.open('https://github.com/Pannbiffen/cartographer', '_blank', 'noopener'),
        },
        {
          label: 'Report a Problem',
          onSelect: () => window.open('https://github.com/Pannbiffen/cartographer/issues', '_blank', 'noopener'),
        },
      ],
    },
  ];

  return (
    <div className="w-screen h-screen flex flex-col bg-ui text-ui-text overflow-hidden select-none">
      <MenuBar menus={menus} />
      <Toolbar
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
        zoom={viewport.zoom}
        onOpen={() => fileInputRef.current?.click()}
        onSave={handleSaveJson}
        onExport={() => setIsExportOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onActualSize={handleActualSize}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.dndmap"
        onChange={handleLoadJson}
        className="hidden"
      />

      <div className="flex flex-1 min-h-0">
        <Toolbox activeTool={activeTool} onSelectTool={chooseTool} />

        <main className="relative flex-1 min-w-0 overflow-hidden">
          <MapCanvas
            mapData={mapData}
            activeTool={activeTool}
            brushSize={brushSize}
            selectedDoorType={selectedDoorType}
            selectedPropType={selectedPropType}
            selectedFoliageType={selectedFoliageType}
            viewport={viewport}
            onViewportChange={setViewport}
            onResize={setCanvasSize}
            onModifyMap={modifyMap}
            onHoverCoord={setHoverCoord}
            selection={activeSelection}
            onSelect={setSelection}
          />
        </main>

        {isPanelOpen && (
          <DockPanel
            activeTool={activeTool}
            brushSize={brushSize}
            onBrushSizeChange={setBrushSize}
            selectedDoorType={selectedDoorType}
            onDoorTypeChange={setSelectedDoorType}
            selectedPropType={selectedPropType}
            onPropTypeChange={setSelectedPropType}
            selectedFoliageType={selectedFoliageType}
            onFoliageTypeChange={setSelectedFoliageType}
            selection={activeSelection}
            onClearSelection={() => setSelection(null)}
            mapData={mapData}
            onModifyMap={modifyMap}
          />
        )}
      </div>

      <footer className="flex h-6 items-center gap-4 px-2 bg-ui border-t border-ui-border text-ui-muted">
        <span data-testid="cursor-position" className="w-28 tabular-nums">
          {hoverCoord ? `Grid: (${hoverCoord.gx}, ${hoverCoord.gy})` : ''}
        </span>
        <span data-testid="map-stats" className="tabular-nums">
          Rooms: {Object.keys(mapData.rooms).length} · Water: {Object.keys(mapData.water).length} ·
          Foliage: {Object.keys(mapData.foliage).length}
        </span>
        <span className="flex-1" />
        {autosaveStatus === 'saved' && <span>Autosaved in this browser</span>}
        {autosaveStatus === 'failed' && (
          <span className="text-ui-danger">Autosave failed - save a .dndmap file</span>
        )}
      </footer>

      <ExportModal
        mapData={mapData}
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
      />
    </div>
  );
}

export default App;
