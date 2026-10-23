import React, { useRef, useEffect, useCallback, useState } from 'react';
import type {
  LayerContent,
  LevelMap,
  ToolType,
  WaterStyle,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  GridCoord,
  LabelStyle,
  Pair,
  Polygon,
  Selection,
  FillWith,
  ShapeMode,
  ViewportTransform,
} from '../types/map';
import { THEMES } from '../core/theme';
import { wheelZoomFactor, zoomAbout, type ZoomSpeed } from '../core/viewport';
import { useKeyboardPan } from './useKeyboardPan';
import { keepsSelection, laysFloor } from '../components/options';
import { renderGhostLevel, renderMap, renderMapGround } from '../core/renderers/mapRenderer';
import { renderLightMarkers } from '../core/renderers/lightingRenderer';
import { DEFAULT_LIGHT, DEFAULT_WINDOW } from '../core/lighting';
import { nextRoomNumber } from '../core/renderers/labelRenderer';
import {
  brushCells,
  rectCells,
  tunnelCells,
  doorLine,
  doorTouchesCell,
  sameDoorSpot,
  snapDoor,
  type DoorSpot,
  stairsContainCell,
  lineCells,
} from '../core/tools/toolGeometry';
import { drainRoom, fillRoom, floodRoom, isFloorAt, textureAt } from '../core/tools/fill';
import { isTypingInField } from '../core/keyboard';
import {
  findDoor,
  findSelected,
  findWall,
  findWindow,
  hitTestObject,
  moveObjects,
  newObjectId,
  objectBounds,
  objectOrigins,
  objectsInBox,
  replaceDoor,
  replaceLabel,
  replaceLight,
  replaceProp,
  replaceStairs,
  replaceWall,
  replaceWindow,
  sameSelection,
  type ObjectOrigin,
} from '../core/objects';
import { findLayer, isLayerEditable, visibleLayers, withLayer } from '../core/layers';
import {
  addWater,
  applyShape,
  circlePolygon,
  doorWalls,
  addPaint,
  erasePaint,
  eraseShapesInCells,
  eraseWater,
  paintCells,
  paintWaterCells,
  pathPolygon,
  polygonFromPoints,
  uncutCells,
} from '../core/geometry/region';
import { riverOutline, riverPolygon, type RiverSettings } from '../core/geometry/river';
import {
  hexAt,
  hexCenter,
  hexKey,
  hexLine,
  hexOffset,
  hexPolygon,
  hexRect,
  hexSlot,
  hexTunnel,
  hexesWithin,
  isHexGrid,
  nearestHexSide,
  snapToHex,
  type Hex,
} from '../core/geometry/hex';
import { enclosedByStroke } from '../core/tools/enclose';
import { edgeKey, edgePath, nearestCorner, wallKey, wallTouchesCell } from '../core/geometry/walls';
import type { ModifyMap } from '../App';

interface MapCanvasProps {
  mapData: LevelMap;
  // Levels under this one, drawn faintly behind it, deepest first
  levelsBelow?: { map: LevelMap; opacity: number }[];
  activeTool: ToolType;
  brushSize: number;
  selectedDoorType: DoorType;
  selectedPropType: PropType;
  selectedFoliageType: FoliageType;
  // Texture laid by the room tools
  floorTexture: FloorTexture;
  // Texture the paint tool lays on the ground
  paintTexture: FloorTexture;
  labelStyle: LabelStyle;
  // Whether the polygon, circle and path tools add floor or cut it away
  shapeMode: ShapeMode;
  // Whether the fill tool lays floor or a liquid
  fillWith: FillWith;
  // Width, wander and seed of the rivers the river tool draws
  river: RiverSettings;
  // The same for the roads the road tool paints, in `paintTexture`
  road: RiverSettings;
  // The liquid the water, river and fill tools lay
  waterStyle: WaterStyle;
  // Layer the drawing tools edit
  activeLayerId: string;
  viewport: ViewportTransform;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportTransform>>;
  // How fast the mouse wheel zooms
  zoomSpeed: ZoomSpeed;
  // Reports the canvas size in CSS pixels whenever it changes
  onResize?: (size: { width: number; height: number }) => void;
  onModifyMap: ModifyMap;
  onHoverCoord?: (coord: { gx: number; gy: number } | null) => void;
  // Kept at the pointer's position in grid units (null off the canvas), for pasting under it
  pointerRef?: React.RefObject<{ x: number; y: number } | null>;
  selection: Selection[];
  onSelect: (selection: Selection[]) => void;
  // Double-clicking stairs with the select tool goes to the level they lead to
  onTakeStairs?: (stairs: Selection) => void;
  // Right-click or long-press: where (screen and grid units) and the object there
  onOpenMenu?: (menu: CanvasMenuRequest) => void;
  // Alt+click with a floor tool: the floor texture under the pointer
  onPickFloorTexture?: (texture: FloorTexture) => void;
}

export interface CanvasMenuRequest {
  clientX: number;
  clientY: number;
  at: { x: number; y: number };
  hit: Selection | null;
}

// How long a touch must stay put to open the menu, and how far it may wander
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 8;

interface HoverState {
  gx: number;
  gy: number;
  worldX: number;
  worldY: number;
}


const PREVIEW_FILLS: Partial<Record<ToolType, string>> = {
  eraser: 'rgba(230, 80, 80, 0.2)',
  water: 'rgba(60, 140, 180, 0.25)',
  river: 'rgba(60, 140, 180, 0.35)',
  paint: 'rgba(150, 120, 80, 0.25)',
  road: 'rgba(150, 120, 80, 0.35)',
  foliage: 'rgba(80, 150, 80, 0.25)',
};
const LAVA_PREVIEW_FILL = 'rgba(220, 90, 40, 0.3)';
const DEFAULT_PREVIEW_FILL = 'rgba(210, 180, 140, 0.25)';

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  levelsBelow,
  activeTool,
  brushSize,
  selectedDoorType,
  selectedPropType,
  selectedFoliageType,
  floorTexture,
  paintTexture,
  labelStyle,
  shapeMode,
  fillWith,
  river,
  road,
  waterStyle,
  activeLayerId,
  viewport,
  onViewportChange,
  zoomSpeed,
  onResize,
  onModifyMap,
  onHoverCoord,
  pointerRef,
  selection,
  onSelect,
  onTakeStairs,
  onOpenMenu,
  onPickFloorTexture,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // An Alt+press with a floor tool picks the texture there, unless it pans
  const pickRef = useRef<{ at: Pair; clientX: number; clientY: number } | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  // Start cell of a click-drag shape (rectangle room or tunnel)
  const dragStartRef = useRef<GridCoord | null>(null);
  const currentHoverRef = useRef<HoverState | null>(null);
  // Corners placed so far by the polygon or path tool, in grid units
  const shapePointsRef = useRef<Pair[] | null>(null);
  // Centre of the circle being dragged out
  const circleCentreRef = useRef<Pair | null>(null);
  // Shift places shape points off the grid
  const freePlacementRef = useRef<boolean>(false);
  // Hex under the pointer during a hex-grid brush stroke
  const lastHexRef = useRef<Hex | null>(null);
  // Hex a rectangle or tunnel drag started on, on a hex grid
  const hexDragStartRef = useRef<Hex | null>(null);
  // Corner the wall stroke has reached, whether it erases (Shift held), and
  // the edges it has run along
  const wallStrokeRef = useRef<{ corner: Pair; erase: boolean; edges: [Pair, Pair][] } | null>(null);
  const wallEraseRef = useRef<boolean>(false);
  const strokeCountRef = useRef<number>(0);
  const longPressRef = useRef<{ timer: number; x: number; y: number } | null>(null);
  // When a long-press last opened the menu, so the browser's own contextmenu event after it is ignored
  const longPressOpenedRef = useRef(0);
  // Object being dragged with the select tool, and where the drag began.
  // Several selected objects move together from their `group` origins.
  const moveDragRef = useRef<{
    sel: Selection;
    startCell: GridCoord;
    startWorld: { x: number; y: number };
    origin: GridCoord;
    group?: ObjectOrigin[];
    offset?: GridCoord;
    moved?: boolean;
  } | null>(null);
  // Box being dragged out with the select tool (grid units), and the
  // selection it adds to (Shift held)
  const selectBoxRef = useRef<{ start: Pair; end: Pair; base: Selection[] } | null>(null);
  // The map as last drawn, and what it was drawn from (see `drawMap`)
  const mapCacheRef = useRef<{ canvas: HTMLCanvasElement; key: unknown[] | null } | null>(null);
  // Drawing is blocked while the active layer is hidden or locked
  const layerEditable = isLayerEditable(findLayer(mapData, activeLayerId));
  const editLayer = useCallback(
    (edit: Parameters<typeof withLayer>[2], options?: Parameters<ModifyMap>[1]) =>
      onModifyMap((draft) => withLayer(draft, activeLayerId, edit), options),
    [onModifyMap, activeLayerId]
  );
  const hexGrid = isHexGrid(mapData.gridType) ? mapData.gridType : null;
  const hexBrush = hexGrid !== null && usesBrush(activeTool);
  // The hexes the active tool would cover with the pointer over `h`
  const hexFootprint = useCallback(
    (h: Hex): Hex[] => {
      if (!hexGrid) return [];
      const start = hexDragStartRef.current;
      if (activeTool === 'room-rect') return start ? hexRect(hexGrid, start, h) : [h];
      if (activeTool === 'tunnel') return start ? hexTunnel(start, h, brushSize) : hexesWithin(h, brushSize);
      return usesBrush(activeTool) ? hexesWithin(h, brushSize) : [h];
    },
    [hexGrid, activeTool, brushSize]
  );

  // Where a shape point would go: on the nearest half cell, or hex centre or corner
  const snapPoint = useCallback(
    (hover: HoverState): Pair => {
      const x = hover.worldX / mapData.gridSize;
      const y = hover.worldY / mapData.gridSize;
      if (freePlacementRef.current) return [x, y];
      if (isHexGrid(mapData.gridType)) return snapToHex(mapData.gridType, x, y);
      return [Math.round(x * 2) / 2, Math.round(y * 2) / 2];
    },
    [mapData.gridSize, mapData.gridType]
  );
  // Where a prop, light or stairs would go: the cell under the pointer, or the middle of the hex
  const slotAt = (hover: HoverState): Pair =>
    hexGrid ? hexSlot(hexGrid, hexAt(hexGrid, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize)) : [hover.gx, hover.gy];
  // Where a door or window would go: on a wall off the grid lines nearby, turned to match, or
  // else the nearest cell edge (hex side on a hex grid)
  const doorSpotAt = useCallback(
    (hover: HoverState): DoorSpot => {
      const [x, y] = [hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize];
      const hex = isHexGrid(mapData.gridType) ? mapData.gridType : null;
      const spot = snapDoor(x, y, doorWalls(visibleLayers(mapData), hex !== null));
      return hex && spot.angle === undefined ? { ...nearestHexSide(hex, x, y), orientation: 'horizontal' } : spot;
    },
    [mapData]
  );
  const spaceHeldRef = useRef<boolean>(false);
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);

  // Screen to world grid coordinates
  const screenToGrid = useCallback(
    (screenX: number, screenY: number): HoverState => {
      const worldX = (screenX - viewport.x) / viewport.zoom;
      const worldY = (screenY - viewport.y) / viewport.zoom;
      const gx = Math.floor(worldX / mapData.gridSize);
      const gy = Math.floor(worldY / mapData.gridSize);
      return { gx, gy, worldX, worldY };
    },
    [viewport, mapData.gridSize]
  );

  // Main Render Routine
  const drawMap = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Nothing to draw before the first resize (and drawImage rejects empty canvases)
    if (canvas.width === 0 || canvas.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const theme = THEMES[mapData.theme] || THEMES.parchment;
    const gridSize = mapData.gridSize;

    // The map itself only changes with an edit, pan, zoom or resize, so it is
    // kept on a spare canvas; hovering then only blits it and draws the overlays
    if (!mapCacheRef.current) {
      const spare = document.createElement('canvas');
      spare.dataset.mapCache = 'true';
      mapCacheRef.current = { canvas: spare, key: null };
    }
    const cache = mapCacheRef.current;
    const key = [mapData, levelsBelow, viewport.x, viewport.y, viewport.zoom, canvas.width, canvas.height, dpr];
    if (!cache.key || cache.key.some((part, i) => part !== key[i])) {
      if (cache.canvas.width !== canvas.width) cache.canvas.width = canvas.width;
      if (cache.canvas.height !== canvas.height) cache.canvas.height = canvas.height;
      const mapCtx = cache.canvas.getContext('2d');
      if (!mapCtx) return;
      // Work in CSS pixels regardless of display density
      mapCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      mapCtx.fillStyle = theme.bg;
      mapCtx.fillRect(0, 0, width, height);

      mapCtx.save();
      // Apply viewport transform (pan & zoom)
      mapCtx.translate(viewport.x, viewport.y);
      mapCtx.scale(viewport.zoom, viewport.zoom);

      // The ground goes under the faint levels below, so it doesn't hide them
      renderMapGround(mapCtx, mapData);
      for (const below of levelsBelow ?? []) renderGhostLevel(mapCtx, below.map, below.opacity);

      // Map layers, with grid lines limited to the visible area
      renderMap(mapCtx, mapData, {
        minX: Math.floor(-viewport.x / viewport.zoom / gridSize) - 1,
        minY: Math.floor(-viewport.y / viewport.zoom / gridSize) - 1,
        maxX: Math.ceil((width - viewport.x) / viewport.zoom / gridSize) + 1,
        maxY: Math.ceil((height - viewport.y) / viewport.zoom / gridSize) + 1,
      }, { ground: false, lightsBelow: levelsBelow });
      renderLightMarkers(mapCtx, mapData, viewport.zoom, theme.ink);
      mapCtx.restore();
      cache.key = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cache.canvas, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Live cursor & drag previews
    const hover = currentHoverRef.current;
    if (
      hover &&
      layerEditable &&
      !isPanningRef.current &&
      activeTool !== 'select' &&
      activeTool !== 'label' &&
      activeTool !== 'light' &&
      !(activeTool === 'window' && hitTestObject(mapData, hover.worldX, hover.worldY)?.kind === 'window')
    ) {
      ctx.save();
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.fillStyle =
        (activeTool === 'water' || activeTool === 'river') && waterStyle === 'lava'
          ? LAVA_PREVIEW_FILL
          : (PREVIEW_FILLS[activeTool] ?? DEFAULT_PREVIEW_FILL);

      const here = { x: hover.gx, y: hover.gy };
      const dragStart = dragStartRef.current;

      if (isShapeTool(activeTool)) {
        if (shapeMode === 'cut' && !winds(activeTool)) ctx.fillStyle = PREVIEW_FILLS.eraser!;
        const point = snapPoint(hover);
        const points = shapePointsRef.current;
        const centre = circleCentreRef.current;
        let preview: Polygon[] = [];
        if (activeTool === 'circle' && centre) {
          preview = [circlePolygon(centre[0], centre[1], circleRadius(centre, point, freePlacementRef.current))];
        } else if (activeTool === 'polygon' && points) {
          preview = [[[...points, point]]];
        } else if (activeTool === 'path' && points) {
          preview = pathPolygon([...points, point], brushSize);
        } else if (winds(activeTool) && points) {
          // Over the first point, show the loop it would close
          const closing = points.length >= 3 && Math.hypot(point[0] - points[0][0], point[1] - points[0][1]) < 0.15;
          preview = [riverOutline([...points, closing ? points[0] : point], activeTool === 'road' ? road : river)];
        }
        ctx.beginPath();
        for (const polygon of preview) {
          for (const ring of polygon) {
            ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * gridSize, y * gridSize) : ctx.lineTo(x * gridSize, y * gridSize)));
            ctx.closePath();
          }
        }
        // A river's outline can cross itself in a tight bend
        ctx.fill(winds(activeTool) ? 'nonzero' : 'evenodd');
        ctx.stroke();
        // Corners placed so far, and where the next one would go
        ctx.setLineDash([]);
        ctx.fillStyle = theme.ink;
        ctx.beginPath();
        for (const [x, y] of [...(points ?? []), ...(centre ? [centre] : []), point]) {
          ctx.moveTo(x * gridSize + 3, y * gridSize);
          ctx.arc(x * gridSize, y * gridSize, 3, 0, Math.PI * 2);
        }
        ctx.fill();
      } else if (hexGrid && activeTool !== 'door' && activeTool !== 'window' && activeTool !== 'wall') {
        // On a hex grid every other tool works in whole hexes
        ctx.beginPath();
        for (const h of hexFootprint(hexAt(hexGrid, hover.worldX / gridSize, hover.worldY / gridSize))) {
          hexPolygon(hexGrid, h)[0].forEach(([x, y], i) =>
            i === 0 ? ctx.moveTo(x * gridSize, y * gridSize) : ctx.lineTo(x * gridSize, y * gridSize)
          );
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
      } else if (activeTool === 'door' || activeTool === 'window') {
        // Highlight the wall edge (or, for a door, the stretch of a wall off the grid) it will snap to
        const spot = doorSpotAt(hover);
        const { cx, cy, ux, uy, length } = doorLine(spot);
        const [hx, hy] = [(ux * length) / 2, (uy * length) / 2];
        ctx.setLineDash([]);
        ctx.lineWidth = 6;
        ctx.strokeStyle = activeTool === 'window' ? 'rgba(60, 140, 180, 0.6)' : 'rgba(139, 58, 43, 0.6)';
        ctx.beginPath();
        ctx.moveTo((cx - hx) * gridSize, (cy - hy) * gridSize);
        ctx.lineTo((cx + hx) * gridSize, (cy + hy) * gridSize);
        ctx.stroke();
      } else if (activeTool === 'wall') {
        // The corner the wall will start from or run to; red while erasing
        const [cx, cy] = nearestCorner(mapData.gridType, hover.worldX / gridSize, hover.worldY / gridSize);
        ctx.setLineDash([]);
        ctx.fillStyle = wallEraseRef.current ? 'rgba(230, 80, 80, 0.8)' : 'rgba(139, 58, 43, 0.7)';
        ctx.beginPath();
        ctx.arc(cx * gridSize, cy * gridSize, 5 / viewport.zoom + 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (activeTool === 'room-rect' && dragStart) {
        const minX = Math.min(dragStart.x, here.x);
        const minY = Math.min(dragStart.y, here.y);
        const w = Math.abs(here.x - dragStart.x) + 1;
        const h = Math.abs(here.y - dragStart.y) + 1;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.fillRect(minX * gridSize, minY * gridSize, w * gridSize, h * gridSize);
        ctx.strokeRect(minX * gridSize, minY * gridSize, w * gridSize, h * gridSize);
      } else {
        const cells =
          activeTool === 'tunnel' && dragStart
            ? tunnelCells(dragStart, here, brushSize)
            : usesBrush(activeTool)
              ? brushCells(hover.gx, hover.gy, brushSize)
              : [here];
        ctx.beginPath();
        for (const c of cells) {
          ctx.rect(c.x * gridSize, c.y * gridSize, gridSize, gridSize);
        }
        ctx.fill();
        if (cells.length <= 25) ctx.stroke();
      }

      ctx.restore();
    }

    // Selection outlines
    const pad = 4 / viewport.zoom;
    ctx.save();
    ctx.strokeStyle = '#c2513d';
    ctx.lineWidth = 2 / viewport.zoom;
    ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
    for (const sel of selection) {
      const bounds = objectBounds(mapData, sel);
      if (!bounds) continue;
      ctx.strokeRect(
        bounds.x * gridSize - pad,
        bounds.y * gridSize - pad,
        bounds.w * gridSize + pad * 2,
        bounds.h * gridSize + pad * 2
      );
    }
    const box = selectBoxRef.current;
    if (box) {
      const [x0, y0] = box.start;
      const [x1, y1] = box.end;
      ctx.lineWidth = 1 / viewport.zoom;
      ctx.fillStyle = 'rgba(194, 81, 61, 0.08)';
      ctx.beginPath();
      ctx.rect(Math.min(x0, x1) * gridSize, Math.min(y0, y1) * gridSize, Math.abs(x1 - x0) * gridSize, Math.abs(y1 - y0) * gridSize);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();

    ctx.restore();
  }, [mapData, levelsBelow, activeTool, brushSize, viewport, selection, layerEditable, shapeMode, river, road, waterStyle, snapPoint, doorSpotAt, hexGrid, hexFootprint]);

  // Keep the canvas backing store matched to its on-screen size
  const drawRef = useRef(drawMap);
  const onResizeRef = useRef(onResize);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    drawRef.current = drawMap;
    drawMap();
  }, [drawMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      drawRef.current();
      onResizeRef.current?.({ width: rect.width, height: rect.height });
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  // Hold Space to pan with the left mouse button
  useEffect(() => {
    const setSpace = (held: boolean) => {
      spaceHeldRef.current = held;
      setIsSpaceHeld(held);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || isTypingInField()) return;
      // Stop the page scrolling or a focused button being "clicked"
      e.preventDefault();
      if (!e.repeat) setSpace(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    const handleBlur = () => setSpace(false);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // Zoom with the mouse wheel. React registers wheel listeners as passive,
  // so preventDefault needs a native listener.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const factor = wheelZoomFactor(e, zoomSpeed);
      onViewportChange((v) => zoomAbout(v, mouseX, mouseY, v.zoom * factor));
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [onViewportChange, zoomSpeed]);

  // With a selection being edited, arrow keys nudge it (App.tsx) instead
  useKeyboardPan(onViewportChange, selection.length > 0 && keepsSelection(activeTool));

  // Apply brush action to map cells around each centre cell
  const applyBrush = useCallback(
    (centers: GridCoord[]) => {
      const cells = new Map<string, GridCoord>();
      for (const center of centers) {
        for (const c of brushCells(center.x, center.y, brushSize)) cells.set(`${c.x},${c.y}`, c);
      }
      editLayer(
        (draft) => {
          if (activeTool === 'room-brush') uncutCells(draft, [...cells.values()]);
          if (activeTool === 'eraser') eraseShapesInCells(draft, [...cells.values()]);
          if (activeTool === 'water') paintWaterCells(draft, [...cells.values()], waterStyle);
          if (activeTool === 'paint') paintCells(draft, [...cells.values()], paintTexture);
          for (const { x: gx, y: gy } of cells.values()) {
            const key = `${gx},${gy}`;

            if (activeTool === 'room-brush') {
              carveFloor(draft, key, floorTexture);
            } else if (activeTool === 'foliage') {
              // Keep existing plants so dragging over them doesn't reshuffle their shape
              if (draft.foliage[key]?.type !== selectedFoliageType) {
                draft.foliage[key] = {
                  type: selectedFoliageType,
                  seed: Math.floor(Math.random() * 10000),
                };
              }
            } else if (activeTool === 'eraser') {
              delete draft.rooms[key];
              delete draft.floors[key];
              eraseCellContents(draft, gx, gy);
            }
          }
        },
        { coalesce: `stroke-${strokeCountRef.current}` }
      );
    },
    [activeTool, brushSize, selectedFoliageType, floorTexture, paintTexture, waterStyle, editLayer]
  );

  // On a hex grid the brushes lay, plant or cut whole hexes
  const applyHexBrush = useCallback(
    (centers: Hex[]) => {
      if (!hexGrid) return;
      const hexes = new Map<string, Hex>();
      for (const center of centers) {
        for (const h of hexesWithin(center, brushSize)) hexes.set(hexKey(h), h);
      }
      const shape = [...hexes.values()].map((h) => hexPolygon(hexGrid, h));
      editLayer(
        (draft) => {
          if (activeTool === 'paint') {
            addPaint(draft, shape, paintTexture);
            return;
          }
          if (activeTool === 'water') {
            addWater(draft, shape, waterStyle);
            return;
          }
          if (activeTool === 'foliage') {
            // A plant in the middle of each hex, kept if already there so
            // dragging over it doesn't reshuffle its shape
            for (const h of hexes.values()) {
              const key = hexSlot(hexGrid, h).join(',');
              if (draft.foliage[key]?.type !== selectedFoliageType) {
                draft.foliage[key] = { type: selectedFoliageType, seed: Math.floor(Math.random() * 10000) };
              }
            }
            return;
          }
          applyShape(draft, shape, activeTool === 'eraser' ? 'cut' : 'add', floorTexture);
          if (activeTool !== 'eraser') return;
          eraseWater(draft, shape);
          erasePaint(draft, shape);
          // Plants and objects centred in the hexes go, as do walls on their
          // edges and water or plants in the cells centred in them
          const inHexes = (x: number, y: number) => hexes.has(hexKey(hexAt(hexGrid, x, y)));
          for (const key of Object.keys(draft.foliage)) {
            const [x, y] = key.split(',').map(Number);
            if (inHexes(x + 0.5, y + 0.5)) delete draft.foliage[key];
          }
          draft.props = draft.props.filter((p) => !inHexes(p.x + 0.5, p.y + 0.5));
          draft.lights = draft.lights.filter((l) => !inHexes(l.x + 0.5, l.y + 0.5));
          draft.stairs = draft.stairs.filter((s) => !inHexes(s.x + 0.5, s.y + 0.5));
          for (const h of hexes.values()) {
            const [cx, cy] = hexCenter(hexGrid, h);
            draft.walls = draft.walls.filter(
              (w) => Math.hypot(w.x + w.dx / 2 - cx, w.y + w.dy / 2 - cy) > 0.5 + 1e-6
            );
            const offSides = (d: { x: number; y: number; angle?: number }) =>
              d.angle === undefined || Math.hypot(d.x - cx, d.y - cy) > 0.5 + 1e-3;
            draft.doors = draft.doors.filter(offSides);
            draft.windows = draft.windows.filter(offSides);
            for (let gy = Math.floor(cy) - 1; gy <= Math.floor(cy) + 1; gy++) {
              for (let gx = Math.floor(cx) - 1; gx <= Math.floor(cx) + 1; gx++) {
                if (hexKey(hexAt(hexGrid, gx + 0.5, gy + 0.5)) === hexKey(h)) eraseCellContents(draft, gx, gy);
              }
            }
          }
        },
        { coalesce: `stroke-${strokeCountRef.current}` }
      );
    },
    [hexGrid, activeTool, brushSize, floorTexture, paintTexture, waterStyle, selectedFoliageType, editLayer]
  );

  // Adds walls along grid edges, or erases those there
  const traceWalls = useCallback(
    (edges: [Pair, Pair][], erase: boolean) => {
      if (edges.length === 0) return;
      editLayer(
        (draft) => {
          const keys = new Set(edges.map(([a, b]) => edgeKey(a, b)));
          if (erase) {
            draft.walls = draft.walls.filter((w) => !keys.has(wallKey(w)));
            return;
          }
          const taken = new Set(draft.walls.map(wallKey));
          const added = edges
            .filter(([a, b]) => !taken.has(edgeKey(a, b)))
            .map(([a, b]) => ({ id: newObjectId('wall'), x: a[0], y: a[1], dx: b[0] - a[0], dy: b[1] - a[1] }));
          if (added.length > 0) draft.walls = [...draft.walls, ...added];
        },
        { coalesce: `stroke-${strokeCountRef.current}` }
      );
    },
    [editLayer]
  );

  // Makes whatever a finished wall stroke closed off into floor, in the same undo step
  const finishWallStroke = (edges: [Pair, Pair][]) => {
    const { cells, hexes } = enclosedByStroke(mapData.gridType, visibleLayers(mapData), edges);
    if (cells.length === 0 && hexes.length === 0) return;
    editLayer(
      (draft) => {
        if (hexGrid && hexes.length > 0) {
          applyShape(draft, hexes.map((h) => hexPolygon(hexGrid, h)), 'add', floorTexture);
          return;
        }
        uncutCells(draft, cells);
        for (const c of cells) carveFloor(draft, `${c.x},${c.y}`, floorTexture);
      },
      { coalesce: `stroke-${strokeCountRef.current}` }
    );
  };

  // Adds the finished polygon or path to the active layer, or cuts it out;
  // a river adds water, and a road paints the ground
  const finishShape = useCallback(() => {
    const points = shapePointsRef.current;
    shapePointsRef.current = null;
    if (!points) return;
    if (activeTool === 'river') {
      const water = riverPolygon(points, river);
      if (water.length > 0) editLayer((draft) => addWater(draft, water, waterStyle));
    } else if (activeTool === 'road') {
      const strip = riverPolygon(points, road);
      if (strip.length > 0) editLayer((draft) => addPaint(draft, strip, paintTexture));
    } else {
      const shape =
        activeTool === 'path' ? pathPolygon(points, brushSize) : polygonFromPoints(points);
      if (shape.length > 0) editLayer((draft) => applyShape(draft, shape, shapeMode, floorTexture));
    }
    drawRef.current();
  }, [activeTool, brushSize, shapeMode, floorTexture, paintTexture, river, road, waterStyle, editLayer]);
  const finishShapeRef = useRef(finishShape);
  useEffect(() => {
    finishShapeRef.current = finishShape;
  }, [finishShape]);

  // Switching tools drops a half-drawn shape
  useEffect(() => {
    shapePointsRef.current = null;
    circleCentreRef.current = null;
  }, [activeTool]);

  // Enter finishes a polygon or path, Backspace takes back its last corner
  // and Escape abandons it
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const points = shapePointsRef.current;
      if (!points || isTypingInField()) return;
      if (e.key === 'Enter') {
        finishShapeRef.current();
      } else if (e.key === 'Escape') {
        shapePointsRef.current = null;
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        shapePointsRef.current = points.length > 1 ? points.slice(0, -1) : null;
      } else {
        return;
      }
      drawRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Moves the dragged object: doors and windows re-snap to the nearest wall edge, stairs
  // and props shift by whole cells from where the drag started
  const moveSelectedTo = (hover: HoverState) => {
    const drag = moveDragRef.current;
    if (!drag) return;
    const coalesce = { coalesce: `move-${strokeCountRef.current}` };
    // Things move by whole cells, or from hex to hex on a hex grid
    const [stepX, stepY] = hexGrid
      ? hexOffset(hexGrid, [drag.startWorld.x / mapData.gridSize, drag.startWorld.y / mapData.gridSize], [hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize])
      : [hover.gx - drag.startCell.x, hover.gy - drag.startCell.y];
    if (drag.group) {
      // A group keeps its layout
      const offset = { x: stepX, y: stepY };
      if (drag.offset && offset.x === drag.offset.x && offset.y === drag.offset.y) return;
      drag.offset = offset;
      drag.moved = true;
      const group = drag.group;
      onModifyMap((draft) => moveObjects(draft, group, offset.x, offset.y), coalesce);
      return;
    }
    const layer = findLayer(mapData, drag.sel.layerId);
    if (!layer) return;
    const editDragged = (edit: Parameters<typeof withLayer>[2]) =>
      onModifyMap((draft) => withLayer(draft, layer.id, edit), coalesce);

    if (drag.sel.kind === 'door') {
      const door = findDoor(layer, drag.sel.id);
      const spot = doorSpotAt(hover);
      if (!door) return;
      const same =
        door.x === spot.x && door.y === spot.y && door.orientation === spot.orientation && door.angle === spot.angle && door.length === spot.length;
      const occupied = layer.doors.some((d) => d.id !== door.id && sameDoorSpot(d, spot));
      if (!same && !occupied) {
        editDragged((draft) => replaceDoor(draft, { ...door, ...spot }));
      }
      return;
    }

    if (drag.sel.kind === 'window') {
      const pane = findWindow(layer, drag.sel.id);
      const spot = doorSpotAt(hover);
      if (!pane) return;
      const same =
        pane.x === spot.x && pane.y === spot.y && pane.orientation === spot.orientation && pane.angle === spot.angle && pane.length === spot.length;
      if (!same && !layer.windows.some((w) => w.id !== pane.id && sameDoorSpot(w, spot))) {
        editDragged((draft) => replaceWindow(draft, { ...pane, ...spot }));
      }
      return;
    }

    if (drag.sel.kind === 'wall') {
      // Walls move by whole steps, but not onto an edge another wall uses
      const wall = findWall(layer, drag.sel.id);
      if (!wall) return;
      const moved = { ...wall, x: drag.origin.x + stepX, y: drag.origin.y + stepY };
      const key = wallKey(moved);
      if ((moved.x !== wall.x || moved.y !== wall.y) && !layer.walls.some((w) => w.id !== wall.id && wallKey(w) === key)) {
        editDragged((draft) => replaceWall(draft, moved));
      }
      return;
    }

    if (drag.sel.kind === 'label') {
      // Labels move freely, in 1/8-cell steps
      const snap = (v: number) => Math.round(v * 8) / 8;
      const x = snap(drag.origin.x + (hover.worldX - drag.startWorld.x) / mapData.gridSize);
      const y = snap(drag.origin.y + (hover.worldY - drag.startWorld.y) / mapData.gridSize);
      const label = layer.labels.find((l) => l.id === drag.sel.id);
      if (label && (label.x !== x || label.y !== y)) {
        editDragged((draft) => replaceLabel(draft, { ...label, x, y }));
      }
      return;
    }

    const x = drag.origin.x + stepX;
    const y = drag.origin.y + stepY;
    const obj = findSelected(mapData, drag.sel);
    if (!obj || (obj.x === x && obj.y === y)) return;
    editDragged((draft) => {
      if (drag.sel.kind === 'stairs') {
        const s = draft.stairs.find((st) => st.id === drag.sel.id);
        if (s) replaceStairs(draft, { ...s, x, y });
      } else if (drag.sel.kind === 'light') {
        const l = draft.lights.find((li) => li.id === drag.sel.id);
        if (l) replaceLight(draft, { ...l, x, y });
      } else {
        const p = draft.props.find((pr) => pr.id === drag.sel.id);
        if (p) replaceProp(draft, { ...p, x, y });
      }
    });
  };

  const pointerToGrid = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
  };

  const openMenuAt = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    const { worldX, worldY } = screenToGrid(clientX - rect.left, clientY - rect.top);
    onOpenMenu?.({
      clientX,
      clientY,
      at: { x: worldX / mapData.gridSize, y: worldY / mapData.gridSize },
      hit: hitTestObject(mapData, worldX, worldY),
    });
  };
  const cancelLongPress = () => {
    if (longPressRef.current) window.clearTimeout(longPressRef.current.timer);
    longPressRef.current = null;
  };
  useEffect(() => () => window.clearTimeout(longPressRef.current?.timer), []);

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Keep receiving moves and the release even if the pointer leaves the canvas
    e.currentTarget.setPointerCapture(e.pointerId);

    // Holding a finger still opens the menu, ending whatever the touch started
    if (e.pointerType === 'touch' && onOpenMenu) {
      cancelLongPress();
      const canvas = e.currentTarget;
      const { clientX, clientY } = e;
      const timer = window.setTimeout(() => {
        longPressRef.current = null;
        longPressOpenedRef.current = Date.now();
        isDrawingRef.current = false;
        dragStartRef.current = null;
        hexDragStartRef.current = null;
        circleCentreRef.current = null;
        wallStrokeRef.current = null;
        moveDragRef.current = null;
        selectBoxRef.current = null;
        openMenuAt(canvas, clientX, clientY);
        drawMap();
      }, LONG_PRESS_MS);
      longPressRef.current = { timer, x: clientX, y: clientY };
    }

    // Middle click, Space + drag or Alt + drag pans
    if (e.button === 1 || (e.button === 0 && (spaceHeldRef.current || e.altKey))) {
      e.preventDefault();
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      const { worldX, worldY } = pointerToGrid(e);
      pickRef.current =
        e.button === 0 && e.altKey && !spaceHeldRef.current && laysFloor(activeTool, shapeMode, fillWith)
          ? { at: [worldX / mapData.gridSize, worldY / mapData.gridSize], clientX: e.clientX, clientY: e.clientY }
          : null;
      drawMap();
      return;
    }
    if (e.button !== 0) return;

    const hover = pointerToGrid(e);
    const { gx, gy } = hover;
    currentHoverRef.current = hover;

    if (activeTool === 'select') {
      // Shift+click adds an object to the selection or takes it out. Pressing
      // on a selected object keeps the group, to drag it; elsewhere starts a box.
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      const obj = findSelected(mapData, hit);
      if (!hit || !obj) {
        const at: Pair = [hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize];
        selectBoxRef.current = { start: at, end: at, base: e.shiftKey ? selection : [] };
        if (!e.shiftKey) onSelect([]);
        return;
      }
      const wasSelected = selection.some((sel) => sameSelection(sel, hit));
      if (e.shiftKey && wasSelected) {
        onSelect(selection.filter((sel) => !sameSelection(sel, hit)));
        return;
      }
      const next = e.shiftKey ? [...selection, hit] : wasSelected ? selection : [hit];
      // Keep the pressed object last, so the panel shows it
      onSelect([...next.filter((sel) => !sameSelection(sel, hit)), hit]);
      strokeCountRef.current++;
      moveDragRef.current = {
        sel: hit,
        startCell: { x: gx, y: gy },
        startWorld: { x: hover.worldX, y: hover.worldY },
        origin: { x: obj.x, y: obj.y },
        group: next.length > 1 ? objectOrigins(mapData, next) : undefined,
        offset: { x: 0, y: 0 },
      };
    } else if (activeTool === 'label') {
      // Clicking an existing label selects it; elsewhere places a new one
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      const existing = hit?.kind === 'label' ? findSelected(mapData, hit) : undefined;
      if (hit && existing) {
        onSelect([hit]);
        strokeCountRef.current++;
        moveDragRef.current = {
          sel: hit,
          startCell: { x: gx, y: gy },
          startWorld: { x: hover.worldX, y: hover.worldY },
          origin: { x: existing.x, y: existing.y },
        };
        return;
      }
      if (!layerEditable) return;
      // Room-number markers count up from the highest number on the map
      const id = newObjectId('label');
      const text =
        labelStyle === 'text'
          ? 'New label'
          : String(nextRoomNumber(mapData.layers.flatMap((l) => l.labels)));
      editLayer((draft) => {
        draft.labels.push({
          id,
          x: hover.worldX / mapData.gridSize,
          y: hover.worldY / mapData.gridSize,
          text,
          size: 20,
          style: labelStyle,
        });
      });
      onSelect([{ kind: 'label', id, layerId: activeLayerId }]);
    } else if (activeTool === 'light') {
      // Clicking a light selects it for editing or dragging; elsewhere places one
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      const light = hit?.kind === 'light' ? findSelected(mapData, hit) : undefined;
      if (hit && light) {
        onSelect([hit]);
        strokeCountRef.current++;
        moveDragRef.current = {
          sel: hit,
          startCell: { x: gx, y: gy },
          startWorld: { x: hover.worldX, y: hover.worldY },
          origin: { x: light.x, y: light.y },
        };
        return;
      }
      if (!layerEditable) return;
      const id = newObjectId('light');
      const [x, y] = slotAt(hover);
      onModifyMap((draft) => {
        withLayer(draft, activeLayerId, (layer) => layer.lights.push({ id, x, y, ...DEFAULT_LIGHT }));
        // A light only shows on a darkened map
        draft.lighting = true;
      });
      onSelect([{ kind: 'light', id, layerId: activeLayerId }]);
    } else if (activeTool === 'window') {
      // Clicking a window selects it for editing or dragging; elsewhere places one on the nearest edge
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      if (hit?.kind === 'window') {
        onSelect([hit]);
        strokeCountRef.current++;
        moveDragRef.current = {
          sel: hit,
          startCell: { x: gx, y: gy },
          startWorld: { x: hover.worldX, y: hover.worldY },
          origin: { x: gx, y: gy },
        };
        return;
      }
      if (!layerEditable) return;
      const id = newObjectId('window');
      const spot = doorSpotAt(hover);
      editLayer((draft) => {
        // Placing on a spot that has a window replaces it
        draft.windows = draft.windows.filter((w) => !sameDoorSpot(w, spot));
        draft.windows.push({ id, ...spot, ...DEFAULT_WINDOW });
      });
      onSelect([{ kind: 'window', id, layerId: activeLayerId }]);
    } else if (!layerEditable) {
      return;
    } else if (activeTool === 'polygon' || activeTool === 'path' || winds(activeTool)) {
      freePlacementRef.current = e.shiftKey;
      const point = snapPoint(hover);
      const points = shapePointsRef.current;
      const near = (p: Pair | undefined) => !!p && Math.hypot(p[0] - point[0], p[1] - point[1]) < 0.15;
      if (!points) {
        shapePointsRef.current = [point];
      } else if (winds(activeTool) && points.length >= 3 && near(points[0])) {
        // Back on its first point, a river or road closes into a loop
        shapePointsRef.current = [...points, points[0]];
        finishShape();
      } else if (
        // Clicking the last corner again (a double-click) finishes the shape,
        // as does closing a polygon on its first corner
        near(points[points.length - 1]) ||
        (activeTool === 'polygon' && points.length >= 3 && near(points[0]))
      ) {
        finishShape();
      } else {
        shapePointsRef.current = [...points, point];
      }
      drawMap();
    } else if (activeTool === 'fill') {
      const at: Pair = [hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize];
      const layer = findLayer(mapData, activeLayerId);
      if (!layer || !isFloorAt(layer, ...at)) return;
      // Doors and walls on any shown layer bound the room
      const shown = visibleLayers(mapData);
      const [doors, walls] = [shown.flatMap((l) => l.doors), shown.flatMap((l) => l.walls)];
      // Shift+click drains the room
      editLayer((draft) => {
        if (e.shiftKey) drainRoom(draft, doors, walls, ...at, mapData.gridType);
        else if (fillWith === 'liquid') floodRoom(draft, doors, walls, ...at, waterStyle, mapData.gridType);
        else fillRoom(draft, doors, walls, ...at, floorTexture, mapData.gridType);
      });
    } else if (activeTool === 'circle') {
      freePlacementRef.current = e.shiftKey;
      circleCentreRef.current = snapPoint(hover);
      drawMap();
    } else if (hexGrid && hexBrush) {
      isDrawingRef.current = true;
      strokeCountRef.current++;
      const h = hexAt(hexGrid, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize);
      lastHexRef.current = h;
      applyHexBrush([h]);
    } else if (activeTool === 'room-rect' || activeTool === 'tunnel') {
      dragStartRef.current = { x: gx, y: gy };
      hexDragStartRef.current = hexGrid && hexAt(hexGrid, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize);
      drawMap();
    } else if (activeTool === 'wall') {
      strokeCountRef.current++;
      wallEraseRef.current = e.shiftKey;
      wallStrokeRef.current = {
        corner: nearestCorner(mapData.gridType, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize),
        erase: e.shiftKey,
        edges: [],
      };
      drawMap();
    } else if (activeTool === 'door') {
      const spot = doorSpotAt(hover);
      editLayer((draft) => {
        // Placing on an occupied spot replaces the door there
        draft.doors = draft.doors.filter((d) => !sameDoorSpot(d, spot));
        draft.doors.push({ id: newObjectId('door'), ...spot, type: selectedDoorType });
      });
    } else if (activeTool === 'stairs') {
      const [x, y] = slotAt(hover);
      editLayer((draft) => {
        draft.stairs.push({
          id: newObjectId('stairs'),
          x,
          y,
          width: 1,
          height: 2,
          direction: 'down',
          steps: 4,
        });
      });
    } else if (activeTool === 'prop') {
      const [x, y] = slotAt(hover);
      editLayer((draft) => {
        draft.props.push({
          id: newObjectId('prop'),
          x,
          y,
          type: selectedPropType,
          rotation: 0,
        });
      });
    } else {
      isDrawingRef.current = true;
      strokeCountRef.current++;
      applyBrush([{ x: gx, y: gy }]);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const press = longPressRef.current;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > LONG_PRESS_SLOP) cancelLongPress();
    if (isPanningRef.current) {
      onViewportChange({
        ...viewport,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const hover = pointerToGrid(e);
    if (selectBoxRef.current) {
      selectBoxRef.current.end = [hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize];
      currentHoverRef.current = hover;
      drawMap();
      return;
    }
    if (moveDragRef.current) {
      moveSelectedTo(hover);
      currentHoverRef.current = hover;
      return;
    }
    if (activeTool === 'select') {
      const overObject = hitTestObject(mapData, hover.worldX, hover.worldY) !== null;
      e.currentTarget.style.cursor = overObject ? 'move' : '';
    } else if (!layerEditable) {
      e.currentTarget.style.cursor = 'not-allowed';
    } else if (activeTool === 'label') {
      e.currentTarget.style.cursor = 'text';
    } else if (activeTool === 'light') {
      const overLight = hitTestObject(mapData, hover.worldX, hover.worldY)?.kind === 'light';
      e.currentTarget.style.cursor = overLight ? 'move' : '';
    } else if (activeTool === 'window') {
      const overWindow = hitTestObject(mapData, hover.worldX, hover.worldY)?.kind === 'window';
      e.currentTarget.style.cursor = overWindow ? 'move' : '';
    } else {
      e.currentTarget.style.cursor = '';
    }
    const prev = currentHoverRef.current;
    const cellChanged = !prev || prev.gx !== hover.gx || prev.gy !== hover.gy;
    currentHoverRef.current = hover;
    if (pointerRef) pointerRef.current = { x: hover.worldX / mapData.gridSize, y: hover.worldY / mapData.gridSize };
    if (isShapeTool(activeTool)) freePlacementRef.current = e.shiftKey;

    if (activeTool === 'wall') {
      const stroke = wallStrokeRef.current;
      wallEraseRef.current = stroke ? stroke.erase : e.shiftKey;
      const corner = nearestCorner(mapData.gridType, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize);
      if (stroke && (corner[0] !== stroke.corner[0] || corner[1] !== stroke.corner[1])) {
        const edges = edgePath(mapData.gridType, stroke.corner, corner);
        stroke.edges.push(...edges);
        traceWalls(edges, stroke.erase);
        stroke.corner = corner;
      }
    }
    if (hexGrid && hexBrush && isDrawingRef.current) {
      const h = hexAt(hexGrid, hover.worldX / mapData.gridSize, hover.worldY / mapData.gridSize);
      const last = lastHexRef.current;
      if (last && hexKey(last) !== hexKey(h)) applyHexBrush(hexLine(last, h));
      lastHexRef.current = h;
    }
    if (cellChanged) {
      onHoverCoord?.({ gx: hover.gx, gy: hover.gy });
      if (isDrawingRef.current && prev && !hexBrush) {
        applyBrush(lineCells({ x: prev.gx, y: prev.gy }, { x: hover.gx, y: hover.gy }));
      }
    }
    drawMap();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    cancelLongPress();
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      const pick = pickRef.current;
      pickRef.current = null;
      const layer = findLayer(mapData, activeLayerId);
      if (pick && layer && Math.hypot(e.clientX - pick.clientX, e.clientY - pick.clientY) < 4) {
        const texture = textureAt(layer, ...pick.at);
        if (texture) onPickFloorTexture?.(texture);
      }
    }

    const start = dragStartRef.current;
    const end = currentHoverRef.current;
    const hexStart = hexDragStartRef.current;
    if (hexGrid && hexStart && end) {
      const hexes = hexFootprint(hexAt(hexGrid, end.worldX / mapData.gridSize, end.worldY / mapData.gridSize));
      editLayer((draft) => applyShape(draft, hexes.map((h) => hexPolygon(hexGrid, h)), 'add', floorTexture));
    } else if (start && end) {
      const here = { x: end.gx, y: end.gy };
      const cells =
        activeTool === 'tunnel' ? tunnelCells(start, here, brushSize) : rectCells(start, here);
      editLayer((draft) => {
        uncutCells(draft, cells);
        for (const c of cells) carveFloor(draft, `${c.x},${c.y}`, floorTexture);
      });
    }
    const centre = circleCentreRef.current;
    // A click without a drag places nothing
    const dragged = centre && end && Math.hypot(end.worldX / mapData.gridSize - centre[0], end.worldY / mapData.gridSize - centre[1]) >= 0.25;
    if (centre && end && dragged) {
      const radius = circleRadius(centre, snapPoint(end), freePlacementRef.current);
      editLayer((draft) => applyShape(draft, [circlePolygon(centre[0], centre[1], radius)], shapeMode, floorTexture));
    }
    const wallStroke = wallStrokeRef.current;
    if (wallStroke && !wallStroke.erase && wallStroke.edges.length > 0) finishWallStroke(wallStroke.edges);
    const box = selectBoxRef.current;
    if (box) {
      const [x0, y0] = box.start;
      const [x1, y1] = box.end;
      const found = objectsInBox(mapData, { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) });
      // A click without a drag only clears the selection
      if (Math.hypot(x1 - x0, y1 - y0) >= 0.1) {
        onSelect([...box.base, ...found.filter((sel) => !box.base.some((b) => sameSelection(b, sel)))]);
      }
    }
    // Clicking one of several selected objects without moving them selects just it
    const drag = moveDragRef.current;
    if (drag?.group && !drag.moved && !e.shiftKey && e.type === 'pointerup') onSelect([drag.sel]);
    selectBoxRef.current = null;
    circleCentreRef.current = null;
    wallStrokeRef.current = null;
    dragStartRef.current = null;
    hexDragStartRef.current = null;
    moveDragRef.current = null;
    isDrawingRef.current = false;
    drawMap();
  };

  const handlePointerLeave = () => {
    // With pointer capture this only fires once a drag has finished
    if (
      isDrawingRef.current ||
      dragStartRef.current ||
      circleCentreRef.current ||
      wallStrokeRef.current ||
      moveDragRef.current ||
      selectBoxRef.current ||
      isPanningRef.current
    ) {
      return;
    }
    currentHoverRef.current = null;
    if (pointerRef) pointerRef.current = null;
    onHoverCoord?.(null);
    drawMap();
  };

  const cursorClass = isPanning
    ? 'cursor-grabbing'
    : isSpaceHeld
      ? 'cursor-grab'
      : 'cursor-crosshair';

  return (
    <div className={`relative w-full h-full overflow-hidden ${cursorClass}`}>
      <canvas
        ref={canvasRef}
        className="w-full h-full block touch-none"
        // The current view, for end-to-end tests to aim at grid cells
        data-view={`${viewport.x},${viewport.y},${viewport.zoom}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onDoubleClick={(e) => {
          if (activeTool !== 'select' || !onTakeStairs) return;
          const { worldX, worldY } = pointerToGrid(e);
          const hit = hitTestObject(mapData, worldX, worldY);
          if (hit?.kind === 'stairs') onTakeStairs(hit);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (Date.now() - longPressOpenedRef.current > 1000) openMenuAt(e.currentTarget, e.clientX, e.clientY);
        }}
      />
    </div>
  );
};

/** Makes a cell floor with the given texture; drawing over floor re-textures it */
function carveFloor(layer: LayerContent, key: string, texture: FloorTexture) {
  layer.rooms[key] = true;
  if (texture === 'plain') delete layer.floors[key];
  else layer.floors[key] = texture;
}

/** Clears everything but floor from a cell: water, paint, plants and objects in it */
function eraseCellContents(layer: LayerContent, gx: number, gy: number) {
  const key = `${gx},${gy}`;
  delete layer.water[key];
  delete layer.clearWater[key];
  delete layer.lava[key];
  delete layer.paint[key];
  delete layer.foliage[key];
  layer.doors = layer.doors.filter((d) => !doorTouchesCell(d, gx, gy));
  layer.windows = layer.windows.filter((w) => !doorTouchesCell(w, gx, gy));
  layer.walls = layer.walls.filter((w) => !wallTouchesCell(w, gx, gy));
  layer.stairs = layer.stairs.filter((s) => !stairsContainCell(s, gx, gy));
  layer.props = layer.props.filter((p) => p.x !== gx || p.y !== gy);
  layer.lights = layer.lights.filter((l) => l.x !== gx || l.y !== gy);
  layer.labels = layer.labels.filter((l) => Math.floor(l.x) !== gx || Math.floor(l.y) !== gy);
}

function isShapeTool(tool: ToolType): boolean {
  return tool === 'polygon' || tool === 'circle' || tool === 'path' || winds(tool);
}

/** Tools that lay a winding strip through clicked points */
function winds(tool: ToolType): boolean {
  return tool === 'river' || tool === 'road';
}

/** A circle's radius out to `edge`, in half cells unless placed freely */
function circleRadius(centre: Pair, edge: Pair, free: boolean): number {
  const r = Math.hypot(edge[0] - centre[0], edge[1] - centre[1]);
  return free ? Math.max(0.1, r) : Math.max(0.5, Math.round(r * 2) / 2);
}

function usesBrush(tool: ToolType): boolean {
  return tool === 'room-brush' || tool === 'water' || tool === 'paint' || tool === 'foliage' || tool === 'eraser';
}
