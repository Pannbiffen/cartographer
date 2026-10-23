import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  LevelMap,
  MapData,
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  LabelStyle,
  FillWith,
  ShapeMode,
  ViewportTransform,
  MapHistoryState,
  Selection,
  WaterStyle,
  MapLayer,
  PlacedDoor,
  PlacedWall,
} from './types/map';
import { MenuBar, type Menu, type MenuItem } from './components/MenuBar';
import { ContextMenu } from './components/ContextMenu';
import { Toolbar } from './components/Toolbar';
import { Toolbox } from './components/Toolbox';
import { DockPanel } from './components/DockPanel';
import { MapSettingsDrawer } from './components/MapSettingsDrawer';
import { DOOR_TYPES, FLOOR_TEXTURES, LABEL_STYLES, LIQUID_NAMES, PROP_TYPES, TOOLS, WATER_STYLES, keepsSelection, laysFloor, laysLiquid } from './components/options';
import { MapCanvas, type CanvasMenuRequest } from './canvas/MapCanvas';
import { ExportModal } from './components/ExportModal';
import { PreferencesDialog } from './components/PreferencesDialog';
import { UnsavedChangesDialog } from './components/UnsavedChangesDialog';
import { ConfirmDialog, type ConfirmDialogProps } from './components/ConfirmDialog';
import { ShareDialog } from './components/ShareDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { MyMapsDialog } from './components/MyMapsDialog';
import { WelcomeDialog } from './components/WelcomeDialog';
import {
  DEFAULT_CAVE,
  DEFAULT_DUNGEON,
  generateBspDungeon,
  generateCaveSystem,
  type CaveSettings,
  type DungeonSettings,
  type GeneratorKind,
} from './core/generators/dungeonGenerator';
import { triggerDownload } from './core/export/imageExporter';
import { ARROW_DIRECTIONS, focusUsesArrows, isTypingInField } from './core/keyboard';
import {
  currentMapId,
  forgetCurrentMap,
  listMaps,
  loadMap,
  migrateLegacyAutosave,
  newMapId,
  rememberCurrentMap,
  storeMap,
  type LibraryEntry,
} from './core/library';
import { applyPreferences, loadPreferences, savePreferences, type Preferences } from './core/preferences';
import { clearLocalData } from './core/storage';
import {
  addObject,
  copyObjects,
  deleteObjects,
  findSelected,
  findStairs,
  nudgeObjects,
  placeCopies,
  retypeObject,
  rotateObjects,
  sameSelection,
  type ClipboardEntry,
} from './core/objects';
import {
  addLayer,
  cloneLayer,
  deleteLayer,
  emptyContent,
  findLayer,
  hasContent,
  isLayerEditable,
  moveLayer,
  newLayer,
  newLayerId,
  nextLayerName,
  isMapLike,
  normalizeLoadedMap,
  visibleLayers,
  withLayer,
} from './core/layers';
import {
  addLevel,
  deleteLevel,
  findLevel,
  levelView,
  moveLevel,
  newLevel,
  newLevelId,
  nextLevelName,
  stairsBackTo,
  stairsTarget,
  withLevel,
} from './core/levels';
import { fitViewport, zoomAbout } from './core/viewport';
import { drainRoom, fillRoom, floodRoom, textureAt } from './core/tools/fill';
import { DEFAULT_RIVER, DEFAULT_ROAD, type RiverSettings } from './core/geometry/river';
import { hasWater, setWaterStyleAt, waterStyleAt } from './core/geometry/region';
import { createBlankMap, mapLook } from './core/newMap';
import { clearShareFragment, isShareFragment, readShareFragment } from './core/share';
import { EXAMPLES, starterMap, type ExampleMap } from './core/examples';

const AUTOSAVE_DELAY_MS = 800;

const MAX_HISTORY = 100;

export interface ModifyMapOptions {
  // Consecutive edits sharing a coalesce key (one brush stroke, one slider
  // drag, typing in the title) collapse into a single undo step
  coalesce?: string;
}

export type ModifyMap = (mutator: (draft: MapData) => void, options?: ModifyMapOptions) => void;

// Reopen the map in use on the last visit if there is one, otherwise show the starter dungeon
function initialMap(): { map: MapData; id: string; resumed: boolean; saved: boolean } {
  migrateLegacyAutosave();
  const id = currentMapId();
  const stored = id && loadMap(id);
  if (!id || !stored) return { map: starterMap(), id: newMapId(), resumed: false, saved: true };
  const saved = !!listMaps().find((e) => e.id === id)?.saved;
  return { map: normalizeLoadedMap(stored, starterMap()), id, resumed: true, saved };
}

// File > Open Recent lists this many maps
const RECENT_MAPS = 8;

/** Cells of one terrain kind across a level's layers */
function countCells(map: LevelMap, kind: 'rooms' | 'water' | 'clearWater' | 'foliage'): number {
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
  // The map as last saved to or opened from a file. A map reopened from My
  // Maps counts as saved only if it matched its file when it was stored.
  const [savedMap, setSavedMap] = useState<MapData | null>(() => (initial.saved ? initial.map : null));
  const unsaved = mapData !== savedMap;
  // Read by the autosave, which can run in the same event as a save
  const savedMapRef = useRef(savedMap);
  const markSaved = useCallback((map: MapData | null) => {
    savedMapRef.current = map;
    setSavedMap(map);
  }, []);
  // The open map's entry in My Maps. A new or starter map (pristine) is only
  // stored once it has been changed.
  const [mapId, setMapId] = useState(initial.id);
  const [pristineMap, setPristineMap] = useState<MapData | null>(() => (initial.resumed ? null : initial.map));
  const lastCoalesceRef = useRef<string | null>(null);
  // Counts arrow-key nudges; a held key's repeats share one undo step
  const nudgeCountRef = useRef(0);

  const [activeTool, setActiveTool] = useState<ToolType>('room-brush');
  // The level shown and edited; if it is gone (undo, delete) the first one is used.
  // The canvas, tools and exports see only this level (levelMap).
  const [activeLevelChoice, setActiveLevelId] = useState<string>('');
  const activeLevel = findLevel(mapData, activeLevelChoice) ?? mapData.levels[0];
  const activeLevelId = activeLevel.id;
  const levelMap = useMemo(() => levelView(mapData, activeLevel), [mapData, activeLevel]);
  // Tools draw on the active layer; if it is gone (undo, delete, another
  // level) the level's top one is used
  const [activeLayerChoice, setActiveLayerId] = useState<string>('');
  const activeLayer = findLayer(levelMap, activeLayerChoice) ?? levelMap.layers[levelMap.layers.length - 1];
  const activeLayerId = activeLayer.id;
  const activeLayerEditable = isLayerEditable(activeLayer);

  // The selected objects; the last one picked is the one the panel edits
  const [selection, setSelection] = useState<Selection[]>([]);
  // Objects that were removed (undo, eraser), whose layer was hidden or
  // locked, or which are on another level drop out of the selection
  const activeSelection = useMemo(
    () => selection.filter((sel) => isLayerEditable(findLayer(levelMap, sel.layerId)) && findSelected(levelMap, sel)),
    [selection, levelMap]
  );
  const primarySelection = activeSelection[activeSelection.length - 1] ?? null;
  // Selecting objects makes the last one's layer the one being edited
  const select = useCallback((sels: Selection[]) => {
    setSelection(sels);
    if (sels.length) setActiveLayerId(sels[sels.length - 1].layerId);
  }, []);

  // Levels. Switching level keeps the view, so floors drawn one above
  // another line up; it drops the selection, which belongs to the old level.
  const goToLevel = useCallback((id: string) => {
    setActiveLevelId(id);
    setSelection([]);
  }, []);
  const activeLevelIndex = mapData.levels.indexOf(activeLevel);
  const goToNextLevel = useCallback(
    (delta: 1 | -1) => {
      const level = mapData.levels[activeLevelIndex + delta];
      if (level) goToLevel(level.id);
    },
    [mapData.levels, activeLevelIndex, goToLevel]
  );
  // The generator whose settings show at the top of the panel, if any;
  // picking a tool closes it
  const [generator, setGenerator] = useState<GeneratorKind | null>(null);
  const [dungeonSettings, setDungeonSettings] = useState<DungeonSettings>(DEFAULT_DUNGEON);
  const [caveSettings, setCaveSettings] = useState<CaveSettings>(DEFAULT_CAVE);
  const generatorSessionRef = useRef(0);
  const chooseTool = useCallback((tool: ToolType) => {
    setActiveTool(tool);
    setGenerator(null);
    if (!keepsSelection(tool)) setSelection([]);
  }, []);
  const [brushSize, setBrushSize] = useState<number>(1);
  const [selectedDoorType, setSelectedDoorType] = useState<DoorType>('standard');
  const [selectedPropType, setSelectedPropType] = useState<PropType>('pillar');
  const [selectedFoliageType, setSelectedFoliageType] = useState<FoliageType>('tree');
  const [floorTexture, setFloorTexture] = useState<FloorTexture>('plain');
  const [paintTexture, setPaintTexture] = useState<FloorTexture>('dirt');
  const [labelStyle, setLabelStyle] = useState<LabelStyle>('text');
  const [shapeMode, setShapeMode] = useState<ShapeMode>('add');
  const [fillWith, setFillWith] = useState<FillWith>('floor');
  const [river, setRiver] = useState<RiverSettings>(DEFAULT_RIVER);
  const [road, setRoad] = useState<RiverSettings>(DEFAULT_ROAD);
  const [waterStyle, setWaterStyle] = useState<WaterStyle>('solid');

  const [viewport, setViewport] = useState<ViewportTransform>({ x: 0, y: 0, zoom: 1 });
  // Canvas size in CSS pixels, known after its first layout
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  // The levels under this one, shown faintly beneath it while drawing (deepest first)
  const { showLevelBelow, levelBelowOpacity, showLevelsFurtherBelow, levelBelowFade } = preferences;
  const levelsBelow = useMemo(() => {
    const shown: { map: LevelMap; opacity: number }[] = [];
    if (!showLevelBelow) return shown;
    for (let depth = 0; activeLevelIndex - depth > 0; depth++) {
      if (depth > 0 && !showLevelsFurtherBelow) break;
      // In whole percent, so 30% less three 10% steps is 0, not a hair above
      const opacity = Math.round((levelBelowOpacity - depth * levelBelowFade) * 100) / 100;
      if (opacity <= 0) break;
      shown.unshift({ map: levelView(mapData, mapData.levels[activeLevelIndex - depth - 1]), opacity });
    }
    return shown;
  }, [showLevelBelow, levelBelowOpacity, showLevelsFurtherBelow, levelBelowFade, mapData, activeLevelIndex]);
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
      const next: MapData = {
        ...prev,
        levels: prev.levels.map((level) => ({ ...level, layers: level.layers.map(cloneLayer) })),
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

  // Autosave into My Maps shortly after the map stops changing. A pending
  // save can be flushed, so replacing the map doesn't lose the last edits.
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const flushAutosaveRef = useRef<(() => boolean) | null>(null);
  useEffect(() => {
    if (!preferences.autosave) {
      forgetCurrentMap();
      return;
    }
    if (mapData === pristineMap) return;
    const save = () => {
      window.clearTimeout(timer);
      flushAutosaveRef.current = null;
      const stored = storeMap(mapId, mapData, mapData === savedMapRef.current);
      setAutosaveStatus(stored ? 'saved' : 'failed');
      return stored;
    };
    const timer = window.setTimeout(save, AUTOSAVE_DELAY_MS);
    flushAutosaveRef.current = save;
    return () => {
      window.clearTimeout(timer);
      flushAutosaveRef.current = null;
    };
  }, [mapData, mapId, unsaved, pristineMap, preferences.autosave]);
  // Closing or reloading the tab stores a pending save too. pagehide also
  // fires on mobile, where beforeunload often doesn't.
  useEffect(() => {
    const flush = () => flushAutosaveRef.current?.();
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);

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
    if (canvasSize) setViewport(fitViewport(levelMap, canvasSize.width, canvasSize.height));
  }, [levelMap, canvasSize]);

  // Frame the map on open and whenever a new map replaces it (file open,
  // generators). Waits for the canvas size and for the new map to render.
  const fitPendingRef = useRef(true);
  const requestFit = useCallback(() => {
    fitPendingRef.current = true;
  }, []);
  useEffect(() => {
    if (!canvasSize || !fitPendingRef.current) return;
    fitPendingRef.current = false;
    setViewport(fitViewport(levelMap, canvasSize.width, canvasSize.height));
  }, [levelMap, canvasSize]);

  // Project JSON Save/Load
  const handleSaveJson = useCallback(() => {
    const jsonStr = JSON.stringify(mapData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const cleanTitle = mapData.title.toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'map';
    triggerDownload(blob, `${cleanTitle}.dndmap`);
    markSaved(mapData);
  }, [mapData, markSaved]);

  // Replacing the map (New, Open) waits for an answer while it has unsaved
  // changes, unless an answer is remembered in Preferences. Relying on the
  // in-browser copy needs it stored, so with autosave off or failing (storage
  // full) the dialog still asks.
  const [pendingReplace, setPendingReplace] = useState<{ action: string; run: () => void } | null>(null);
  // An edit waiting for a yes in ConfirmDialog (generating over a layer, Clear Map)
  const [pendingConfirm, setPendingConfirm] = useState<Omit<ConfirmDialogProps, 'onCancel'> | null>(null);
  const confirmReplace = useCallback(
    (action: string, run: () => void) => {
      const choice = preferences.unsavedChanges;
      const kept = () => preferences.autosave && (flushAutosaveRef.current?.() ?? autosaveStatus !== 'failed');
      if (!unsaved || (choice === 'browser' && kept())) {
        run();
      } else if (choice === 'download') {
        handleSaveJson();
        run();
      } else {
        setPendingReplace({ action, run });
      }
    },
    [unsaved, preferences.unsavedChanges, preferences.autosave, autosaveStatus, handleSaveJson]
  );

  // A replacing map starts its own history, framed in the window. The map it
  // replaces stays in My Maps; one reopened from there keeps its entry (id).
  const replaceMap = useCallback(
    (map: MapData, from: { id?: string; saved?: boolean; pristine?: boolean } = {}) => {
      flushAutosaveRef.current?.();
      if (from.id && preferences.autosave) rememberCurrentMap(from.id);
      requestFit();
      resetMap(map);
      setMapId(from.id ?? newMapId());
      markSaved(from.saved === false ? null : map);
      setPristineMap(from.pristine ? map : null);
      setAutosaveStatus('idle');
      setSelection([]);
      setActiveLevelId('');
    },
    [requestFit, resetMap, markSaved, preferences.autosave]
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
        offerSharedMap.current(normalizeLoadedMap(parsed, starterMap()));
      } catch {
        alert('This share link is damaged or incomplete. Ask for the link again, or for a .dndmap file.');
      }
    };
    openSharedMap();
    window.addEventListener('hashchange', openSharedMap);
    return () => window.removeEventListener('hashchange', openSharedMap);
  }, []);

  const handleEmptyMap = useCallback(() => {
    confirmReplace('Start a new map', () => replaceMap(createBlankMap(preferences.newMap), { pristine: true }));
  }, [confirmReplace, replaceMap, preferences.newMap]);

  // The welcome dialog offers an empty map or an example. It opens on a
  // first visit (no map to resume, no share link to offer) unless switched
  // off in Preferences, and always for File > New.
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(
    () => preferences.showWelcome && !initial.resumed && !isShareFragment(window.location.hash)
  );
  const handleNewMap = useCallback(() => setIsWelcomeOpen(true), []);

  const handleOpenExample = useCallback(
    (example: ExampleMap) => {
      confirmReplace(`Open “${example.title}”`, () => replaceMap(example.load(), { pristine: true }));
    },
    [confirmReplace, replaceMap]
  );

  // My Maps and File > Open Recent. The recent list is reread when the open
  // map changes or the dialog closes, not on every render.
  const [isMyMapsOpen, setIsMyMapsOpen] = useState(false);
  const recentMaps = useMemo(
    () => (isMyMapsOpen ? [] : listMaps().filter((e) => e.id !== mapId).slice(0, RECENT_MAPS)),
    [mapId, isMyMapsOpen]
  );
  const openMyMaps = () => {
    flushAutosaveRef.current?.();
    setIsMyMapsOpen(true);
  };
  const handleOpenStoredMap = (entry: LibraryEntry) => {
    const stored = loadMap(entry.id);
    if (!stored) {
      alert('This map could not be read from browser storage.');
      return;
    }
    const map = normalizeLoadedMap(stored, starterMap());
    confirmReplace(`Open “${entry.title || 'Untitled map'}”`, () =>
      replaceMap(map, { id: entry.id, saved: entry.saved })
    );
  };

  const handleLoadJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (isMapLike(parsed)) {
          const map = normalizeLoadedMap(parsed, starterMap());
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
  const toggleMapSettings = useCallback(() => {
    setPreferences((p) => ({ ...p, showMapSettings: !p.showMapSettings }));
  }, []);

  // Copy, paste and duplicate map objects. A paste lands one cell along from
  // the copy and becomes the next one copied, so pasting again keeps stepping.
  // Ctrl+V with the pointer over the map pastes under it instead.
  // Several objects copy together and keep their layout. Paste puts them all
  // on the active layer; Duplicate leaves each copy on its object's layer.
  const [clipboard, setClipboard] = useState<ClipboardEntry[] | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const selectionEditable = activeSelection.length > 0 && keepsSelection(activeTool);
  const placeCopy = useCallback(
    (copied: ClipboardEntry[], layerId?: string, at?: { x: number; y: number }) => {
      const copies = placeCopies(levelMap, copied, layerId, at);
      modifyMap((draft) => {
        for (const copy of copies) addObject(draft, copy.layerId, copy);
      });
      select(copies.map((copy) => ({ kind: copy.kind, id: copy.object.id, layerId: copy.layerId })));
      if (!keepsSelection(activeTool)) setActiveTool('select');
      return copies;
    },
    [levelMap, modifyMap, select, activeTool]
  );
  const handleCopy = useCallback(() => {
    if (selectionEditable) setClipboard(copyObjects(levelMap, activeSelection));
  }, [selectionEditable, levelMap, activeSelection]);
  const handlePaste = useCallback((at?: { x: number; y: number }) => {
    if (clipboard && activeLayerEditable) setClipboard(placeCopy(clipboard, activeLayerId, at));
  }, [clipboard, activeLayerEditable, activeLayerId, placeCopy]);
  const rotateSelection = () => {
    modifyMap((draft) => rotateObjects(draft, activeSelection));
  };
  const deleteSelection = () => {
    modifyMap((draft) => deleteObjects(draft, activeSelection));
    setSelection([]);
  };
  const handleDuplicate = useCallback(() => {
    if (selectionEditable) placeCopy(copyObjects(levelMap, activeSelection));
  }, [selectionEditable, levelMap, activeSelection, placeCopy]);

  // Right-click menu on the map: actions for the object under the pointer,
  // or for the spot clicked. Right-clicking an object selects it.
  const mainRef = useRef<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    at: { x: number; y: number };
    onObject: boolean;
    fromKeyboard?: boolean;
  } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = ({ clientX, clientY, at, hit }: CanvasMenuRequest) => {
    // Right-clicking one of several selected objects keeps them all
    if (hit) {
      if (!keepsSelection(activeTool)) setActiveTool('select');
      if (!activeSelection.some((sel) => sameSelection(sel, hit))) select([hit]);
    }
    setContextMenu({ x: clientX, y: clientY, at, onObject: !!hit });
  };
  // Shift+F10 or the menu key: at the selection, else the pointer, else the middle of the map
  const openKeyboardMenu = useCallback(() => {
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return;
    const selected = selectionEditable ? findSelected(levelMap, primarySelection) : undefined;
    const centre = { x: (rect.width / 2 - viewport.x) / viewport.zoom / mapData.gridSize, y: (rect.height / 2 - viewport.y) / viewport.zoom / mapData.gridSize };
    const at = selected
      ? primarySelection?.kind === 'label' ? { x: selected.x, y: selected.y } : { x: selected.x + 0.5, y: selected.y + 0.5 }
      : (pointerRef.current ?? centre);
    const cell = mapData.gridSize * viewport.zoom;
    setContextMenu({
      x: rect.left + viewport.x + at.x * cell,
      y: rect.top + viewport.y + at.y * cell,
      at,
      onObject: !!selected,
      fromKeyboard: true,
    });
  }, [selectionEditable, levelMap, primarySelection, viewport, mapData.gridSize]);
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
          handlePaste(pointerRef.current ?? undefined);
        } else if (key === 'd') {
          // Also keeps the browser from bookmarking the page
          e.preventDefault();
          handleDuplicate();
        }
        return;
      }
      if (e.altKey) return;

      if ((key === 'f10' && e.shiftKey) || key === 'contextmenu') {
        e.preventDefault();
        openKeyboardMenu();
        return;
      }

      // Selection editing with the select tool (open dialogs take Escape first)
      if (key === 'escape') {
        setSelection([]);
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
      if (key === 'pageup' || key === 'pagedown') {
        e.preventDefault();
        goToNextLevel(key === 'pageup' ? 1 : -1);
        return;
      }
      if (selectionEditable) {
        if (key === 'delete' || key === 'backspace') {
          e.preventDefault();
          modifyMap((draft) => deleteObjects(draft, activeSelection));
          setSelection([]);
          return;
        }
        if (key === 'r') {
          modifyMap((draft) => rotateObjects(draft, activeSelection));
          return;
        }
        const direction = ARROW_DIRECTIONS[e.key];
        if (direction && !focusUsesArrows()) {
          e.preventDefault();
          if (!e.repeat) nudgeCountRef.current++;
          const [dx, dy] = direction;
          modifyMap((draft) => nudgeObjects(draft, activeSelection, dx, dy, e.shiftKey ? 1 : 0.5), {
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
      } else if (key === 'm') {
        toggleMapSettings();
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
    toggleMapSettings,
    modifyMap,
    chooseTool,
    activeSelection,
    activeTool,
    selectionEditable,
    clipboard,
    handleCopy,
    handlePaste,
    handleDuplicate,
    goToNextLevel,
    openKeyboardMenu,
  ]);

  // Procedural generators: Tools > Generate Dungeon / Cave open their settings
  // in the panel, and each Generate replaces the active layer's content. All
  // the layouts tried while it stays open on one layer are one undo step.
  const openGenerator = (kind: GeneratorKind) => {
    generatorSessionRef.current++;
    setGenerator(kind);
    if (!preferences.showPanel) changePreferences({ showPanel: true });
  };
  const generate = (settings?: { seed: number }) => {
    if (!generator || !activeLayerEditable) return;
    const coalesce = `generate-${generatorSessionRef.current}-${activeLayerId}`;
    const layerId = activeLayerId;
    const run = () => {
      let content;
      if (generator === 'dungeon') {
        const next = { ...dungeonSettings, ...settings };
        setDungeonSettings(next);
        content = generateBspDungeon(next);
      } else {
        const next = { ...caveSettings, ...settings };
        setCaveSettings(next);
        content = generateCaveSystem(next);
      }
      requestFit();
      setSelection([]);
      modifyMap((draft) => withLayer(draft, layerId, (layer) => Object.assign(layer, emptyContent(), content)), {
        coalesce,
      });
    };
    // Ask before wiping drawn content, but not a layout from this session
    if (lastCoalesceRef.current === coalesce || !hasContent(activeLayer)) {
      run();
      return;
    }
    setPendingConfirm({
      title: `Generate ${generator === 'dungeon' ? 'Dungeon' : 'Cave'}`,
      message: `Replace everything on the layer “${activeLayer.name}” with a generated ${generator}? Undo brings it back.`,
      confirmLabel: 'Replace layer',
      onConfirm: run,
    });
  };

  const handleClearMap = () => {
    setPendingConfirm({
      title: 'Clear Map',
      message: 'Clear every layer on every level of this map? Undo brings it back.',
      confirmLabel: 'Clear map',
      onConfirm: () =>
        modifyMap((draft) => {
          for (const level of draft.levels) {
            level.layers = level.layers.map((layer) => ({ ...layer, ...emptyContent() }));
          }
        }),
    });
  };

  // Layers, on the active level
  const handleAddLayer = () => {
    const layer = newLayer(newLayerId(), nextLayerName(activeLevel));
    modifyMap((draft) => withLevel(draft, activeLevelId, (level) => addLayer(level, layer, activeLayerId)));
    setActiveLayerId(layer.id);
  };
  const handleDeleteLayer = () => {
    // The layer below takes over, or the new bottom one
    const index = activeLevel.layers.findIndex((l) => l.id === activeLayerId);
    const next = activeLevel.layers[index - 1] ?? activeLevel.layers[index + 1];
    modifyMap((draft) => withLevel(draft, activeLevelId, (level) => deleteLayer(level, activeLayerId)));
    if (next) setActiveLayerId(next.id);
  };
  const handleMoveLayer = (delta: 1 | -1) =>
    modifyMap((draft) => withLevel(draft, activeLevelId, (level) => moveLayer(level, activeLayerId, delta)));
  const activeLayerIndex = activeLevel.layers.indexOf(activeLayer);

  // Levels
  const handleAddLevel = (where: 'above' | 'below') => {
    const level = newLevel(newLevelId(), nextLevelName(mapData));
    modifyMap((draft) => addLevel(draft, level, activeLevelId, where));
    goToLevel(level.id);
  };
  const handleDeleteLevel = () => {
    // The level before takes over, or the new first one
    const next = mapData.levels[activeLevelIndex - 1] ?? mapData.levels[activeLevelIndex + 1];
    modifyMap((draft) => deleteLevel(draft, activeLevelId));
    if (next) goToLevel(next.id);
  };
  const handleMoveLevel = (delta: 1 | -1) => modifyMap((draft) => moveLevel(draft, activeLevelId, delta));
  // Taking a staircase opens the level it leads to. Stairs there leading
  // back are selected and brought into view, so a town and the interiors
  // drawn elsewhere on their own levels still join up.
  const takeStairs = (sel: Selection) => {
    const layer = sel.kind === 'stairs' ? findLayer(levelMap, sel.layerId) : undefined;
    const stairs = layer && findStairs(layer, sel.id);
    const target = stairs && stairsTarget(mapData, stairs);
    if (!target) return;
    goToLevel(target.id);
    const back = stairsBackTo(target, activeLevelId);
    if (!back) return;
    setSelection([{ kind: 'stairs', id: back.stairs.id, layerId: back.layerId }]);
    setActiveLayerId(back.layerId);
    if (canvasSize) {
      const g = mapData.gridSize;
      const cx = (back.stairs.x + back.stairs.width / 2) * g;
      const cy = (back.stairs.y + back.stairs.height / 2) * g;
      setViewport((v) => ({ ...v, x: canvasSize.width / 2 - cx * v.zoom, y: canvasSize.height / 2 - cy * v.zoom }));
    }
  };

  // Exports draw the current level; with several, its name joins the title
  // (file names, PDF page captions)
  const exportMap = useMemo(
    () =>
      mapData.levels.length > 1
        ? { ...levelMap, title: `${levelMap.title || 'Untitled map'} - ${activeLevel.name || 'Untitled level'}` }
        : levelMap,
    [levelMap, mapData.levels.length, activeLevel.name]
  );

  const menus: Menu[] = [
    {
      label: 'File',
      items: [
        { label: 'New…', shortcut: 'Ctrl+Alt+N', onSelect: handleNewMap },
        { label: 'Open…', shortcut: 'Ctrl+O', onSelect: () => fileInputRef.current?.click() },
        {
          label: 'Open Recent',
          disabled: recentMaps.length === 0,
          submenu: recentMaps.map((entry) => ({
            label: entry.title || 'Untitled map',
            onSelect: () => handleOpenStoredMap(entry),
          })),
        },
        { label: 'My Maps…', onSelect: openMyMaps },
        {
          label: 'Examples',
          submenu: EXAMPLES.map((example) => ({ label: example.title, onSelect: () => handleOpenExample(example) })),
        },
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
        { label: 'Redo', shortcut: 'Ctrl+Y', macShortcut: 'Ctrl+Shift+Z', onSelect: handleRedo, disabled: history.future.length === 0 },
        'separator',
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: !selectionEditable, onSelect: handleCopy },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: !clipboard || !activeLayerEditable, onSelect: () => handlePaste() },
        { label: 'Duplicate', shortcut: 'Ctrl+D', disabled: !selectionEditable, onSelect: handleDuplicate },
        'separator',
        {
          label: 'Rotate Selection',
          shortcut: 'R',
          disabled: !selectionEditable,
          onSelect: rotateSelection,
        },
        {
          label: 'Delete Selection',
          shortcut: 'Del',
          disabled: !selectionEditable,
          onSelect: deleteSelection,
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
        {
          label: 'Toolbar on Top',
          checked: preferences.toolboxPosition === 'top',
          onSelect: () => changePreferences({ toolboxPosition: preferences.toolboxPosition === 'top' ? 'left' : 'top' }),
        },
        {
          label: 'Level Below',
          checked: preferences.showLevelBelow,
          disabled: mapData.levels.length < 2,
          onSelect: () => changePreferences({ showLevelBelow: !preferences.showLevelBelow }),
        },
        { label: 'Map Settings', shortcut: 'M', checked: preferences.showMapSettings, onSelect: toggleMapSettings },
      ],
    },
    {
      label: 'Layer',
      items: [
        {
          label: 'Show Layers in Panel',
          checked: preferences.showLayersSection,
          onSelect: () => changePreferences({ showLayersSection: !preferences.showLayersSection }),
        },
        'separator',
        { label: 'New Layer', onSelect: handleAddLayer },
        { label: 'Delete Layer', disabled: activeLevel.layers.length <= 1, onSelect: handleDeleteLayer },
        'separator',
        {
          label: 'Move Layer Up',
          disabled: activeLayerIndex >= activeLevel.layers.length - 1,
          onSelect: () => handleMoveLayer(1),
        },
        { label: 'Move Layer Down', disabled: activeLayerIndex <= 0, onSelect: () => handleMoveLayer(-1) },
      ],
    },
    {
      label: 'Level',
      items: [
        {
          label: 'Show Levels in Panel',
          checked: preferences.showLevelsSection,
          onSelect: () => changePreferences({ showLevelsSection: !preferences.showLevelsSection }),
        },
        'separator',
        { label: 'New Level Above', onSelect: () => handleAddLevel('above') },
        { label: 'New Level Below', onSelect: () => handleAddLevel('below') },
        { label: 'Delete Level', disabled: mapData.levels.length <= 1, onSelect: handleDeleteLevel },
        'separator',
        {
          label: 'Go Up a Level',
          shortcut: 'Page Up',
          disabled: activeLevelIndex >= mapData.levels.length - 1,
          onSelect: () => goToNextLevel(1),
        },
        { label: 'Go Down a Level', shortcut: 'Page Down', disabled: activeLevelIndex <= 0, onSelect: () => goToNextLevel(-1) },
        {
          label: 'Go to Level',
          submenu: [...mapData.levels].reverse().map((level) => ({
            label: level.name || 'Untitled level',
            checked: level.id === activeLevelId,
            onSelect: () => goToLevel(level.id),
          })),
        },
        'separator',
        {
          label: 'Move Level Up',
          disabled: activeLevelIndex >= mapData.levels.length - 1,
          onSelect: () => handleMoveLevel(1),
        },
        { label: 'Move Level Down', disabled: activeLevelIndex <= 0, onSelect: () => handleMoveLevel(-1) },
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
        { label: 'Generate Dungeon…', disabled: !activeLayerEditable, onSelect: () => openGenerator('dungeon') },
        { label: 'Generate Cave…', disabled: !activeLayerEditable, onSelect: () => openGenerator('cave') },
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

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const choices = <T extends string | number>(
    label: string,
    options: T[],
    value: T,
    onChange: (value: T) => void,
    name: (option: T) => string = (o) => capitalize(String(o))
  ): MenuItem => ({
    label,
    submenu: options.map((option) => ({ label: name(option), checked: option === value, onSelect: () => onChange(option) })),
  });
  const selectedObject = selectionEditable ? findSelected(levelMap, primarySelection) : undefined;
  // The selected object's type (or a label's style): submenu title, choices and current one
  const retypeSpec: [string, string[], string] | null =
    !selectedObject || activeSelection.length > 1 ? null
    : primarySelection?.kind === 'door' && 'type' in selectedObject ? ['Door Type', DOOR_TYPES, selectedObject.type]
    : primarySelection?.kind === 'prop' && 'type' in selectedObject ? ['Prop', PROP_TYPES, selectedObject.type]
    : 'style' in selectedObject ? ['Label Style', LABEL_STYLES, selectedObject.style ?? 'text']
    : null;
  const retype = (type: string) => primarySelection && modifyMap((draft) => retypeObject(draft, primarySelection, type));
  const objectMenu: MenuItem[] = !selectedObject
    ? []
    : [
        ...(activeSelection.every((sel) => sel.kind === 'label' || sel.kind === 'light')
          ? []
          : [{ label: 'Rotate', shortcut: 'R', onSelect: rotateSelection }]),
        { label: 'Duplicate', shortcut: 'Ctrl+D', onSelect: handleDuplicate },
        { label: 'Copy', shortcut: 'Ctrl+C', onSelect: handleCopy },
        ...(retypeSpec
          ? [{
              label: retypeSpec[0],
              submenu: retypeSpec[1].map((type) => ({
                label: capitalize(type),
                checked: type === retypeSpec[2],
                onSelect: () => retype(type),
              })),
            }]
          : []),
        'separator',
        { label: 'Delete', shortcut: 'Del', onSelect: deleteSelection },
      ];
  const brushTool = ['room-brush', 'tunnel', 'path', 'water', 'paint', 'foliage', 'eraser'].includes(activeTool);
  const toolSettings: MenuItem[] = [
    ...(activeTool === 'door' ? [choices('Door Type', DOOR_TYPES, selectedDoorType, setSelectedDoorType)] : []),
    ...(activeTool === 'prop' ? [choices('Prop', PROP_TYPES, selectedPropType, setSelectedPropType)] : []),
    ...(activeTool === 'foliage'
      ? [choices('Plant / Terrain', ['tree', 'bush', 'rock'] as FoliageType[], selectedFoliageType, setSelectedFoliageType)]
      : []),
    ...(activeTool === 'label' ? [choices('Label Style', LABEL_STYLES, labelStyle, setLabelStyle)] : []),
    ...(brushTool ? [choices(activeTool === 'path' ? 'Path Width' : 'Brush Size', [1, 2, 3, 4, 5], brushSize, setBrushSize)] : []),
    ...(activeTool === 'fill' ? [choices('Fill With', ['floor', 'liquid'] as FillWith[], fillWith, setFillWith)] : []),
    ...(laysFloor(activeTool, shapeMode, fillWith) ? [choices('Floor', FLOOR_TEXTURES, floorTexture, setFloorTexture)] : []),
    ...(activeTool === 'paint' || activeTool === 'road' ? [choices('Texture', FLOOR_TEXTURES, paintTexture, setPaintTexture)] : []),
    ...(laysLiquid(activeTool, fillWith) ? [choices('New Liquid', WATER_STYLES, waterStyle, setWaterStyle, (style) => LIQUID_NAMES[style])] : []),
    ...(activeTool === 'polygon' || activeTool === 'circle' || activeTool === 'path'
      ? [choices('Mode', ['add', 'cut'] as ShapeMode[], shapeMode, setShapeMode)]
      : []),
  ];
  // The floor texture under the right-click, if there is floor on the active layer
  const menuAt = contextMenu?.at;
  const spotTexture = menuAt && activeLayerEditable ? textureAt(activeLayer, menuAt.x, menuAt.y) : null;
  const spotWater = menuAt && activeLayerEditable ? waterStyleAt(activeLayer, menuAt.x, menuAt.y) : null;
  // Re-textures, floods or drains the room under the right-click, bounded by doors and walls on any shown layer
  const editRoomAt = (edit: (layer: MapLayer, doors: PlacedDoor[], walls: PlacedWall[]) => void) => {
    const shown = visibleLayers(levelMap);
    const [doors, walls] = [shown.flatMap((l) => l.doors), shown.flatMap((l) => l.walls)];
    modifyMap((draft) => withLayer(draft, activeLayerId, (layer) => edit(layer, doors, walls)));
  };
  const mapMenu: MenuItem[] = [
    {
      label: 'Paste Here',
      shortcut: 'Ctrl+V',
      disabled: !clipboard || !activeLayerEditable,
      onSelect: () => contextMenu && handlePaste(contextMenu.at),
    },
    ...(menuAt && spotTexture
      ? [{
          label: 'Fill Room With',
          submenu: [
            ...FLOOR_TEXTURES.map((texture) => ({
              label: capitalize(texture),
              checked: texture === spotTexture,
              onSelect: () => editRoomAt((layer, doors, walls) => fillRoom(layer, doors, walls, menuAt.x, menuAt.y, texture, levelMap.gridType)),
            })),
            'separator' as const,
            ...WATER_STYLES.map((style) => ({
              label: LIQUID_NAMES[style],
              checked: style === spotWater,
              onSelect: () => editRoomAt((layer, doors, walls) => floodRoom(layer, doors, walls, menuAt.x, menuAt.y, style, levelMap.gridType)),
            })),
          ],
        },
        ...(hasWater(activeLayer)
          ? [{ label: 'Drain Room', onSelect: () => editRoomAt((layer, doors, walls) => drainRoom(layer, doors, walls, menuAt.x, menuAt.y, levelMap.gridType)) }]
          : []),
        { label: 'Pick Floor Texture', onSelect: () => setFloorTexture(spotTexture) }]
      : []),
    ...(menuAt && spotWater
      ? [{
          label: 'Liquid Here',
          submenu: WATER_STYLES.map((style) => ({
            label: LIQUID_NAMES[style],
            checked: style === spotWater,
            onSelect: () =>
              modifyMap((draft) => withLayer(draft, activeLayerId, (layer) => setWaterStyleAt(layer, menuAt.x, menuAt.y, style))),
          })),
        }]
      : []),
    ...(toolSettings.length ? ['separator' as const, ...toolSettings] : []),
    'separator',
    { label: 'Zoom to Fit', shortcut: 'Ctrl+0', onSelect: handleZoomToFit },
    { label: 'Show Grid', shortcut: 'G', checked: mapData.showGrid, onSelect: toggleGrid },
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
        aria-label="Open map file"
        onChange={handleLoadJson}
        className="hidden"
      />

      {preferences.toolboxPosition === 'top' && <Toolbox activeTool={activeTool} onSelectTool={chooseTool} position="top" />}

      <div className="flex flex-1 min-h-0">
        {preferences.toolboxPosition === 'left' && (
          <Toolbox activeTool={activeTool} onSelectTool={chooseTool} position="left" />
        )}

        <div className="flex flex-col flex-1 min-w-0">
          <main ref={mainRef} className="relative flex-1 min-h-0 overflow-hidden">
            <MapCanvas
              mapData={levelMap}
              levelsBelow={levelsBelow}
              activeTool={activeTool}
              brushSize={brushSize}
              selectedDoorType={selectedDoorType}
              selectedPropType={selectedPropType}
              selectedFoliageType={selectedFoliageType}
              floorTexture={floorTexture}
              paintTexture={paintTexture}
              labelStyle={labelStyle}
              shapeMode={shapeMode}
              fillWith={fillWith}
              river={river}
              road={road}
              waterStyle={waterStyle}
              activeLayerId={activeLayerId}
              viewport={viewport}
              onViewportChange={setViewport}
              zoomSpeed={preferences.zoomSpeed}
              onResize={setCanvasSize}
              onModifyMap={modifyMap}
              onHoverCoord={setHoverCoord}
              pointerRef={pointerRef}
              selection={activeSelection}
              onSelect={select}
              onTakeStairs={takeStairs}
              onOpenMenu={openContextMenu}
              onPickFloorTexture={setFloorTexture}
            />
          </main>

          <MapSettingsDrawer
            open={preferences.showMapSettings}
            onToggle={toggleMapSettings}
            mapData={mapData}
            onModifyMap={modifyMap}
          />
        </div>

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
            paintTexture={paintTexture}
            onPaintTextureChange={setPaintTexture}
            labelStyle={labelStyle}
            onLabelStyleChange={setLabelStyle}
            shapeMode={shapeMode}
            onShapeModeChange={setShapeMode}
            fillWith={fillWith}
            onFillWithChange={setFillWith}
            river={river}
            onRiverChange={setRiver}
            road={road}
            onRoadChange={setRoad}
            waterStyle={waterStyle}
            onWaterStyleChange={setWaterStyle}
            selection={activeSelection}
            onClearSelection={() => setSelection([])}
            onDuplicate={handleDuplicate}
            onCopy={handleCopy}
            mapData={levelMap}
            levels={mapData.levels}
            activeLevelId={activeLevelId}
            onSelectLevel={goToLevel}
            onAddLevel={handleAddLevel}
            onDeleteLevel={handleDeleteLevel}
            onMoveLevel={handleMoveLevel}
            preferences={preferences}
            onPreferencesChange={changePreferences}
            onTakeStairs={takeStairs}
            onModifyMap={modifyMap}
            activeLayerId={activeLayerId}
            onSelectLayer={setActiveLayerId}
            onAddLayer={handleAddLayer}
            onDeleteLayer={handleDeleteLayer}
            onMoveLayer={handleMoveLayer}
            generator={
              generator && {
                kind: generator,
                dungeon: dungeonSettings,
                onDungeonChange: setDungeonSettings,
                cave: caveSettings,
                onCaveChange: setCaveSettings,
                onGenerate: () => generate(),
                onReroll: () => generate({ seed: 1 + Math.floor(Math.random() * 99999) }),
                onClose: () => setGenerator(null),
                disabled: !activeLayerEditable,
              }
            }
          />
        )}
      </div>

      <footer className="flex h-6 items-center gap-4 px-2 bg-ui border-t border-ui-border text-ui-muted">
        <span data-testid="cursor-position" className="w-28 tabular-nums">
          {hoverCoord ? `Grid: (${hoverCoord.gx}, ${hoverCoord.gy})` : ''}
        </span>
        <span data-testid="map-stats" className="tabular-nums">
          Rooms: {countCells(levelMap, 'rooms')} · Water: {countCells(levelMap, 'water') + countCells(levelMap, 'clearWater')} ·
          Foliage: {countCells(levelMap, 'foliage')}
        </span>
        {mapData.levels.length > 1 && (
          <span>
            Level: <span data-testid="current-level">{activeLevel.name || 'Untitled level'}</span>
          </span>
        )}
        {!activeLayerEditable && (
          <span className="text-ui-danger">
            Layer “{activeLayer.name}” is {activeLayer.visible ? 'locked' : 'hidden'}
          </span>
        )}
        <span className="flex-1" />
        {!preferences.autosave && <span>Autosave off</span>}
        {preferences.autosave && autosaveStatus === 'saved' && <span>Autosaved in this browser</span>}
        {preferences.autosave && autosaveStatus === 'failed' && (
          <span className="text-ui-danger">Autosave failed - delete maps in File &gt; My Maps or save a .dndmap file</span>
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
        mapData={exportMap}
        levelName={mapData.levels.length > 1 ? activeLevel.name || 'Untitled level' : undefined}
        isOpen={isExportOpen}
        onSaveProject={handleSaveJson}
        onClose={() => setIsExportOpen(false)}
      />

      {isShareOpen && <ShareDialog mapData={mapData} onClose={() => setIsShareOpen(false)} />}

      {isWelcomeOpen && (
        <WelcomeDialog
          showOnStart={preferences.showWelcome}
          onShowOnStartChange={(showWelcome) => changePreferences({ showWelcome })}
          onEmpty={() => {
            setIsWelcomeOpen(false);
            handleEmptyMap();
          }}
          onExample={(example) => {
            setIsWelcomeOpen(false);
            handleOpenExample(example);
          }}
          onClose={() => setIsWelcomeOpen(false)}
        />
      )}

      {isMyMapsOpen && (
        <MyMapsDialog
          currentId={mapId}
          autosave={preferences.autosave}
          onOpen={handleOpenStoredMap}
          onRenameOpenMap={(title) =>
            modifyMap((draft) => {
              draft.title = title;
            })
          }
          onClose={() => setIsMyMapsOpen(false)}
        />
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          label={contextMenu.onObject && selectedObject ? 'Object' : 'Map'}
          items={contextMenu.onObject && selectedObject ? objectMenu : mapMenu}
          autoFocus={contextMenu.fromKeyboard}
          onClose={closeContextMenu}
        />
      )}

      {isShortcutsOpen && <ShortcutsDialog menus={menus} onClose={() => setIsShortcutsOpen(false)} />}

      {pendingConfirm && (
        <ConfirmDialog
          {...pendingConfirm}
          onConfirm={() => {
            pendingConfirm.onConfirm();
            setPendingConfirm(null);
          }}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {pendingReplace && (
        <UnsavedChangesDialog
          action={pendingReplace.action}
          mapTitle={mapData.title}
          keptInBrowser={preferences.autosave}
          onSaveFirst={(remember) => {
            if (remember) changePreferences({ unsavedChanges: 'download' });
            handleSaveJson();
            pendingReplace.run();
            setPendingReplace(null);
          }}
          onDiscard={(remember) => {
            if (remember) changePreferences({ unsavedChanges: 'browser' });
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
