import React, { useState, useEffect, useCallback, useRef } from 'react';
import type {
  MapData,
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  LabelStyle,
  ShapeMode,
  ViewportTransform,
  MapHistoryState,
  MapLayer,
  Selection,
} from './types/map';
import { MenuBar, type Menu } from './components/MenuBar';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';
import { DockPanel } from './components/DockPanel';
import { TOOLS, keepsSelection } from './components/options';
import { MapCanvas } from './canvas/MapCanvas';
import { ExportModal } from './components/ExportModal';
import { PreferencesDialog } from './components/PreferencesDialog';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog';
import { ShareDialog } from './components/ShareDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import {
  generateBspDungeon,
  generateCaveSystem,
  generateRiver,
} from './core/generators/dungeonGenerator';
import { triggerDownload } from './core/export/imageExporter';
import { ARROW_DIRECTIONS, focusUsesArrows, isTypingInField } from './core/keyboard';
import { clearAutosave, loadAutosave, saveAutosave } from './core/autosave';
import { applyPreferences, loadPreferences, savePreferences, type Preferences } from './core/preferences';
import { clearLocalData } from './core/storage';
import {
  addObject,
  copyObject,
  deleteObject,
  findSelected,
  nudgeObject,
  offsetCopy,
  rotateObject,
  type CopiedObject,
} from './core/objects';
import {
  addLayer,
  cloneLayer,
  deleteLayer,
  emptyContent,
  findLayer,
  isLayerEditable,
  moveLayer,
  newLayer,
  newLayerId,
  nextLayerName,
  isMapLike,
  normalizeLoadedMap,
  withLayer,
} from './core/layers';
import { fitViewport, zoomAbout } from './core/viewport';
import { createBlankMap, mapLook } from './core/newMap';
import { clearShareFragment, isShareFragment, readShareFragment } from './core/share';

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
    version: 2,
    title: 'The Sunken Crypt',
    gridSize: 40,
    theme: 'parchment',
    showGrid: true,
    gridType: 'square',
    gridOpacity: 0.22,
    hatchDensity: 3,
    hatchLength: 14,
    hatchStyle: 'dyson',
    wallStyle: 'bold',
    lighting: false,
    darkness: 0.75,
    layers: [
      newLayer('layer1', 'Dungeon', {
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
      }),
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

// Resume the autosaved map if there is one, otherwise show the starter dungeon
function initialMap(): { map: MapData; resumed: boolean } {
  const saved = loadAutosave();
  return saved
    ? { map: normalizeLoadedMap(saved, createDefaultStarterMap()), resumed: true }
    : { map: createDefaultStarterMap(), resumed: false };
}

/** Cells of one terrain kind across all layers */
function countCells(map: MapData, kind: 'rooms' | 'water' | 'foliage'): number {
  return map.layers.reduce((n, layer) => n + Object.keys(layer[kind]).length, 0);
}

export function App() {
  const [initial] = useState(initialMap);
  const [history, setHistory] = useState<MapHistoryState>(() => ({
    past: [],
    present: initial.map,
    future: [],
  }));
  const mapData = history.present;
  // The map as last saved to or opened from a file. A resumed autosave may
  // never have been saved, so it counts as unsaved.
  const [savedMap, setSavedMap] = useState<MapData | null>(() => (initial.resumed ? null : initial.map));
  const unsaved = mapData !== savedMap;
  // Replacing the map (New, Open) waits for an answer while it has unsaved changes
  const [pendingReplace, setPendingReplace] = useState<{ action: string; run: () => void } | null>(null);
  const confirmReplace = useCallback(
    (action: string, run: () => void) => {
      if (unsaved) setPendingReplace({ action, run });
      else run();
    },
    [unsaved]
  );
  const lastCoalesceRef = useRef<string | null>(null);
  // Counts arrow-key nudges; a held key's repeats share one undo step
  const nudgeCountRef = useRef(0);

  const [activeTool, setActiveTool] = useState<ToolType>('room-brush');
  // Tools draw on the active layer; if it is gone (undo, delete) the top one is used
  const [activeLayerChoice, setActiveLayerId] = useState<string>('');
  const activeLayer = findLayer(mapData, activeLayerChoice) ?? mapData.layers[mapData.layers.length - 1];
  const activeLayerId = activeLayer.id;
  const activeLayerEditable = isLayerEditable(activeLayer);

  const [selection, setSelection] = useState<Selection | null>(null);
  // A selection whose object was removed (undo, eraser) or whose layer was
  // hidden or locked counts as none
  const activeSelection =
    selection && isLayerEditable(findLayer(mapData, selection.layerId)) && findSelected(mapData, selection)
      ? selection
      : null;
  // Selecting an object makes its layer the one being edited
  const select = useCallback((sel: Selection | null) => {
    setSelection(sel);
    if (sel) setActiveLayerId(sel.layerId);
  }, []);

  const chooseTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    if (!keepsSelection(tool)) setSelection(null);
  }, []);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [selectedDoorType, setSelectedDoorType] = useState<DoorType>('standard');
  const [selectedPropType, setSelectedPropType] = useState<PropType>('pillar');
  const [selectedFoliageType, setSelectedFoliageType] = useState<FoliageType>('tree');
  const [floorTexture, setFloorTexture] = useState<FloorTexture>('plain');
  const [labelStyle, setLabelStyle] = useState<LabelStyle>('text');
  const [shapeMode, setShapeMode] = useState<ShapeMode>('add');

  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  // Canvas size in CSS pixels, known after its first layout
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const changePreferences = useCallback((changes: Partial<Preferences>) => {
    setPreferences((p) => ({ ...p, ...changes }));
  }, []);
  useEffect(() => {
    savePreferences(preferences);
    return applyPreferences(preferences);
  }, [preferences]);
  const handleResetLocalData = () => {
    skipUnloadWarningRef.current = true;
    clearLocalData();
    window.location.reload();
  };

  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [isPreferencesOpen, setIsPreferencesOpen] = useState<boolean>(false);
  const [isShareOpen, setIsShareOpen] = useState<boolean>(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);
  const [hoverCoord, setHoverCoord] = useState<{ gx: number; gy: number } | null>(null);

  // Modify map state with an immer-style draft mutator. The state updater
  // stays pure so React StrictMode's double invocation can't record twice.
  const modifyMap = useCallback<ModifyMap>((mutator, options) => {
    const coalesce = options?.coalesce ?? null;
    const merge = coalesce !== null && coalesce === lastCoalesceRef.current;
    lastCoalesceRef.current = coalesce;

    setHistory((h) => {
      const prev = h.present;
      const next: MapData = { ...prev, layers: prev.layers.map(cloneLayer) };
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
    if (!preferences.autosave) {
      clearAutosave();
      return;
    }
    const timer = window.setTimeout(() => {
      setAutosaveStatus(saveAutosave(mapData) ? 'saved' : 'failed');
    }, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [mapData, preferences.autosave]);

  // With autosave off, closing or reloading the tab would lose work not
  // saved to a file, so the browser asks first
  const skipUnloadWarningRef = useRef(false);
  useEffect(() => {
    if (preferences.autosave || !unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      if (!skipUnloadWarningRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [preferences.autosave, unsaved]);

  // The tab names the map, with a dot while it has changes not saved to a file
  useEffect(() => {
    document.title = `${unsaved ? '• ' : ''}${mapData.title || 'Untitled map'} — Cartographer`;
  }, [unsaved, mapData.title]);

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
      setViewport((v) => zoomAbout(v, cx, cy, zoomFor(v.zoom)));
    },
    [canvasSize]
  );
  const handleZoomIn = useCallback(() => zoomTo((z) => z * 1.25), [zoomTo]);
  const handleZoomOut = useCallback(() => zoomTo((z) => z / 1.25), [zoomTo]);
  const handleActualSize = useCallback(() => zoomTo(() => 1), [zoomTo]);

  const handleZoomToFit = useCallback(() => {
    if (canvasSize) setViewport(fitViewport(mapData, canvasSize.width, canvasSize.height));
  }, [mapData, canvasSize]);

  // Frame the map on open and whenever a new map replaces it (file open,
  // generators). Waits for the canvas size and for the new map to render.
  const fitPendingRef = useRef(true);
  const requestFit = useCallback(() => {
    fitPendingRef.current = true;
  }, []);
  useEffect(() => {
    if (!canvasSize || !fitPendingRef.current) return;
    fitPendingRef.current = false;
    setViewport(fitViewport(mapData, canvasSize.width, canvasSize.height));
  }, [mapData, canvasSize]);

  // Project JSON Save/Load
  const handleSaveJson = useCallback(() => {
    const jsonStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
    triggerDownload(blob, `${cleanTitle}.dndmap`);
    setSavedMap(mapData);
  }, [mapData]);

  // A replacing map starts its own history, framed in the window
  const replaceMap = useCallback(
    (map: MapData) => {
      requestFit();
      resetMap(map);
      setSavedMap(map);
      setSelection(null);
    },
    [requestFit, resetMap]
  );

  // Opening a share link, on load or pasted into an open tab, offers its map.
  // The link is read asynchronously, so it goes through the latest callback.
  const offerSharedMap = useRef<(map: MapData) => void>(() => {});
  useEffect(() => {
    offerSharedMap.current = (map) =>
      confirmReplace(`Open shared map “${map.title || 'Untitled map'}”`, () => replaceMap(map));
  }, [confirmReplace, replaceMap]);
  useEffect(() => {
    const openSharedMap = async () => {
      const hash = window.location.hash;
      if (!isShareFragment(hash)) return;
      clearShareFragment();
      try {
        const parsed = await readShareFragment(hash);
        if (!isMapLike(parsed)) throw new Error('Not a map');
        offerSharedMap.current(normalizeLoadedMap(parsed, createDefaultStarterMap()));
      } catch {
        alert('This share link is damaged or incomplete. Ask for the link again, or for a .dndmap file.');
      }
    };
    openSharedMap();
    window.addEventListener('hashchange', openSharedMap);
    return () => window.removeEventListener('hashchange', openSharedMap);
  }, []);

  const handleNewMap = useCallback(() => {
    confirmReplace('Start a new map', () => replaceMap(createBlankMap(preferences.newMap)));
  }, [confirmReplace, replaceMap, preferences.newMap]);

  const handleLoadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (isMapLike(parsed)) {
          const map = normalizeLoadedMap(parsed, createDefaultStarterMap());
          confirmReplace(`Open “${file.name}”`, () => replaceMap(map));
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

  // Copy, paste and duplicate map objects. A paste lands one cell along from
  // the copy and becomes the next one copied, so pasting again keeps stepping.
  const [clipboard, setClipboard] = useState<CopiedObject | null>(null);
  const selectionEditable = activeSelection !== null && keepsSelection(activeTool);
  const placeCopy = useCallback(
    (copied: CopiedObject, layer: MapLayer) => {
      const copy = offsetCopy(layer, copied);
      modifyMap((draft) => addObject(draft, layer.id, copy));
      select({ kind: copy.kind, id: copy.object.id, layerId: layer.id });
      if (!keepsSelection(activeTool)) setActiveTool('select');
      return copy;
    },
    [modifyMap, select, activeTool]
  );
  const handleCopy = useCallback(() => {
    if (selectionEditable) setClipboard(copyObject(mapData, activeSelection) ?? null);
  }, [selectionEditable, mapData, activeSelection]);
  const handlePaste = useCallback(() => {
    if (clipboard && activeLayerEditable) setClipboard(placeCopy(clipboard, activeLayer));
  }, [clipboard, activeLayerEditable, activeLayer, placeCopy]);
  const handleDuplicate = useCallback(() => {
    const copied = selectionEditable && copyObject(mapData, activeSelection);
    const layer = activeSelection && findLayer(mapData, activeSelection.layerId);
    if (copied && layer) placeCopy(copied, layer);
  }, [selectionEditable, mapData, activeSelection, placeCopy]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTypingInField()) return;

      const key = e.key.toLowerCase();
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+N alone would open a browser window. e.code, as Alt changes e.key on macOS.
        if (e.altKey && e.code === 'KeyN') {
          e.preventDefault();
          handleNewMap();
        } else if (key === 'o') {
          e.preventDefault();
          fileInputRef.current?.click();
        } else if (key === ',') {
          e.preventDefault();
          setIsPreferencesOpen(true);
        } else if (key === 'e') {
          e.preventDefault();
          setIsExportOpen(true);
        } else if (key === '1') {
          e.preventDefault();
          handleActualSize();
        } else if (key === '0') {
          e.preventDefault();
          handleZoomToFit();
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
        } else if (key === 'c' && selectionEditable) {
          e.preventDefault();
          handleCopy();
        } else if (key === 'v' && clipboard) {
          e.preventDefault();
          handlePaste();
        } else if (key === 'd') {
          // Also keeps the browser from bookmarking the page
          e.preventDefault();
          handleDuplicate();
        }
        return;
      }
      if (e.altKey) return;

      // Selection editing with the select tool (open dialogs take Escape first)
      if (key === 'escape') {
        setSelection(null);
        return;
      }
      if (key === '?') {
        setIsShortcutsOpen(true);
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
      if (activeSelection && keepsSelection(activeTool)) {
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
        const direction = ARROW_DIRECTIONS[e.key];
        if (direction && !focusUsesArrows()) {
          e.preventDefault();
          if (!e.repeat) nudgeCountRef.current++;
          const [dx, dy] = direction;
          modifyMap((draft) => nudgeObject(draft, activeSelection, dx, dy, e.shiftKey ? 1 : 0.5), {
            coalesce: `nudge-${nudgeCountRef.current}`,
          });
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
    handleNewMap,
    handleZoomIn,
    handleZoomOut,
    handleActualSize,
    handleZoomToFit,
    toggleGrid,
    modifyMap,
    chooseTool,
    activeSelection,
    activeTool,
    selectionEditable,
    clipboard,
    handleCopy,
    handlePaste,
    handleDuplicate,
  ]);

  // Procedural generators replace the active layer's content
  const handleGenerateDungeon = () => {
    const res = generateBspDungeon(28, 20, 4);
    requestFit();
    modifyMap((draft) =>
      withLayer(draft, activeLayerId, (layer) =>
        Object.assign(layer, emptyContent(), {
          rooms: res.rooms,
          stairs: [{ id: 's1', x: 0, y: 0, width: 1, height: 2, direction: 'down', steps: 4 }],
        })
      )
    );
  };

  const handleGenerateCave = () => {
    const res = generateCaveSystem(32, 24, 0.45);
    requestFit();
    modifyMap((draft) =>
      withLayer(draft, activeLayerId, (layer) =>
        Object.assign(layer, emptyContent(), { rooms: res.rooms, water: res.water })
      )
    );
  };

  const handleGenerateRiver = () => {
    const water = generateRiver(-18, 18, 0, 3);
    modifyMap((draft) =>
      withLayer(draft, activeLayerId, (layer) => {
        layer.water = { ...layer.water, ...water };
      })
    );
  };

  const handleClearMap = () => {
    if (window.confirm('Are you sure you want to clear the entire map?')) {
      modifyMap((draft) => {
        draft.layers = draft.layers.map((layer) => ({ ...layer, ...emptyContent() }));
      });
    }
  };

  // Layers
  const handleAddLayer = () => {
    const layer = newLayer(newLayerId(), nextLayerName(mapData));
    modifyMap((draft) => addLayer(draft, layer, activeLayerId));
    setActiveLayerId(layer.id);
  };
  const handleDeleteLayer = () => {
    // The layer below takes over, or the new bottom one
    const index = mapData.layers.findIndex((l) => l.id === activeLayerId);
    const next = mapData.layers[index - 1] ?? mapData.layers[index + 1];
    modifyMap((draft) => deleteLayer(draft, activeLayerId));
    if (next) setActiveLayerId(next.id);
  };
  const handleMoveLayer = (delta: 1 | -1) => modifyMap((draft) => moveLayer(draft, activeLayerId, delta));
  const activeLayerIndex = mapData.layers.indexOf(activeLayer);

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New', shortcut: 'Ctrl+Alt+N', onSelect: handleNewMap },
        { label: 'Open…', shortcut: 'Ctrl+O', onSelect: () => fileInputRef.current?.click() },
        { label: 'Save', shortcut: 'Ctrl+S', onSelect: handleSaveJson },
        { label: 'Share Link…', onSelect: () => setIsShareOpen(true) },
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
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: !selectionEditable, onSelect: handleCopy },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !clipboard || !activeLayerEditable, onSelect: handlePaste },
        { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !selectionEditable, onSelect: handleDuplicate },
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
        'separator',
        { label: 'Preferences…', shortcut: 'Ctrl+,', onSelect: () => setIsPreferencesOpen(true) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom In', shortcut: '+', onSelect: handleZoomIn },
        { label: 'Zoom Out', shortcut: '-', onSelect: handleZoomOut },
        { label: 'Zoom to Fit', shortcut: 'Ctrl+0', onSelect: handleZoomToFit },
        { label: 'Actual Size', shortcut: 'Ctrl+1', onSelect: handleActualSize },
        'separator',
        { label: 'Show Grid', shortcut: 'G', checked: mapData.showGrid, onSelect: toggleGrid },
        {
          label: 'Properties Panel',
          checked: preferences.showPanel,
          onSelect: () => changePreferences({ showPanel: !preferences.showPanel }),
        },
      ],
    },
    {
      label: 'Layer',
      items: [
        { label: 'New Layer', onSelect: handleAddLayer },
        { label: 'Delete Layer', disabled: mapData.layers.length <= 1, onSelect: handleDeleteLayer },
        'separator',
        {
          label: 'Move Layer Up',
          disabled: activeLayerIndex >= mapData.layers.length - 1,
          onSelect: () => handleMoveLayer(1),
        },
        { label: 'Move Layer Down', disabled: activeLayerIndex <= 0, onSelect: () => handleMoveLayer(-1) },
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
        { label: 'Generate Dungeon', disabled: !activeLayerEditable, onSelect: handleGenerateDungeon },
        { label: 'Generate Cave', disabled: !activeLayerEditable, onSelect: handleGenerateCave },
        { label: 'Add River', disabled: !activeLayerEditable, onSelect: handleGenerateRiver },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Keyboard Shortcuts', shortcut: '?', onSelect: () => setIsShortcutsOpen(true) },
        'separator',
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
        onNew={handleNewMap}
        onOpen={() => fileInputRef.current?.click()}
        onSave={handleSaveJson}
        onExport={() => setIsExportOpen(true)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onActualSize={handleActualSize}
        onZoomToFit={handleZoomToFit}
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
            floorTexture={floorTexture}
            labelStyle={labelStyle}
            shapeMode={shapeMode}
            activeLayerId={activeLayerId}
            viewport={viewport}
            onViewportChange={setViewport}
            zoomSpeed={preferences.zoomSpeed}
            onResize={setCanvasSize}
            onModifyMap={modifyMap}
            onHoverCoord={setHoverCoord}
            selection={activeSelection}
            onSelect={select}
          />
        </main>

        {preferences.showPanel && (
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
            floorTexture={floorTexture}
            onFloorTextureChange={setFloorTexture}
            labelStyle={labelStyle}
            onLabelStyleChange={setLabelStyle}
            shapeMode={shapeMode}
            onShapeModeChange={setShapeMode}
            selection={activeSelection}
            onClearSelection={() => setSelection(null)}
            mapData={mapData}
            onModifyMap={modifyMap}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayerId}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onMoveLayer={handleMoveLayer}
          />
        )}
      </div>

      <footer className="flex h-6 items-center gap-4 px-2 bg-ui border-t border-ui-border text-ui-muted">
        <span data-testid="cursor-position" className="w-28 tabular-nums">
          {hoverCoord ? `Grid: (${hoverCoord.gx}, ${hoverCoord.gy})` : ''}
        </span>
        <span data-testid="map-stats" className="tabular-nums">
          Rooms: {countCells(mapData, 'rooms')} · Water: {countCells(mapData, 'water')} ·
          Foliage: {countCells(mapData, 'foliage')}
        </span>
        {!activeLayerEditable && (
          <span className="text-ui-danger">
            Layer “{activeLayer.name}” is {activeLayer.visible ? 'locked' : 'hidden'}
          </span>
        )}
        <span className="flex-1" />
        {!preferences.autosave && <span>Autosave off</span>}
        {preferences.autosave && autosaveStatus === 'saved' && <span>Autosaved in this browser</span>}
        {preferences.autosave && autosaveStatus === 'failed' && (
          <span className="text-ui-danger">Autosave failed - save a .dndmap file</span>
        )}
      </footer>

      {isPreferencesOpen && (
        <PreferencesDialog
          preferences={preferences}
          onChange={changePreferences}
          currentLook={mapLook(mapData)}
          onResetLocalData={handleResetLocalData}
          onClose={() => setIsPreferencesOpen(false)}
        />
      )}

      <ExportModal
        mapData={mapData}
        isOpen={isExportOpen}
        onSaveProject={handleSaveJson}
        onClose={() => setIsExportOpen(false)}
      />

      {isShareOpen && <ShareDialog mapData={mapData} onClose={() => setIsShareOpen(false)} />}

      {isShortcutsOpen && <ShortcutsDialog menus={menus} onClose={() => setIsShortcutsOpen(false)} />}

      {pendingReplace && (
        <UnsavedChangesDialog
          action={pendingReplace.action}
          mapTitle={mapData.title}
          onSaveFirst={() => {
            handleSaveJson();
            pendingReplace.run();
            setPendingReplace(null);
          }}
          onDiscard={() => {
            pendingReplace.run();
            setPendingReplace(null);
          }}
          onCancel={() => setPendingReplace(null)}
        />
      )}
    </div>
  );
}

export default App;
