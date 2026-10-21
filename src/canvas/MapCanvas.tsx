import React, { useRef, useEffect, useCallback, useState } from 'react';
import type {
  LayerContent,
  MapData,
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  GridCoord,
  LabelStyle,
  Pair,
  Polygon,
  Selection,
  ShapeMode,
  ViewportTransform,
} from '../types/map';
import { THEMES } from '../core/theme';
import { wheelZoomFactor, zoomAbout, type ZoomSpeed } from '../core/viewport';
import { useKeyboardPan } from './useKeyboardPan';
import { keepsSelection } from '../components/options';
import { renderMap } from '../core/renderers/mapRenderer';
import { renderLightMarkers } from '../core/renderers/lightingRenderer';
import { DEFAULT_LIGHT } from '../core/lighting';
import { nextRoomNumber } from '../core/renderers/labelRenderer';
import {
  brushCells,
  rectCells,
  tunnelCells,
  nearestDoorEdge,
  doorTouchesCell,
  stairsContainCell,
  lineCells,
} from '../core/tools/toolGeometry';
import { isTypingInField } from '../core/keyboard';
import {
  findDoor,
  findSelected,
  hitTestObject,
  newObjectId,
  objectBounds,
  replaceDoor,
  replaceLabel,
  replaceLight,
  replaceProp,
  replaceStairs,
} from '../core/objects';
import { findLayer, isLayerEditable, withLayer } from '../core/layers';
import {
  applyShape,
  circlePolygon,
  eraseShapesInCells,
  pathPolygon,
  polygonFromPoints,
  uncutCells,
} from '../core/geometry/region';
import {
  hexAt,
  hexCenter,
  hexKey,
  hexLine,
  hexPolygon,
  hexesWithin,
  isHexGrid,
  snapToHex,
  type Hex,
} from '../core/geometry/hex';
import type { ModifyMap } from '../App';

interface MapCanvasProps {
  mapData: MapData;
  activeTool: ToolType;
  brushSize: number;
  selectedDoorType: DoorType;
  selectedPropType: PropType;
  selectedFoliageType: FoliageType;
  // Texture laid by the room tools
  floorTexture: FloorTexture;
  labelStyle: LabelStyle;
  // Whether the polygon, circle and path tools add floor or cut it away
  shapeMode: ShapeMode;
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
  selection: Selection | null;
  onSelect: (selection: Selection | null) => void;
}

interface HoverState {
  gx: number;
  gy: number;
  worldX: number;
  worldY: number;
}


const PREVIEW_FILLS: Partial<Record<ToolType, string>> = {
  eraser: 'rgba(230, 80, 80, 0.2)',
  water: 'rgba(60, 140, 180, 0.25)',
  foliage: 'rgba(80, 150, 80, 0.25)',
};
const DEFAULT_PREVIEW_FILL = 'rgba(210, 180, 140, 0.25)';

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  activeTool,
  brushSize,
  selectedDoorType,
  selectedPropType,
  selectedFoliageType,
  floorTexture,
  labelStyle,
  shapeMode,
  activeLayerId,
  viewport,
  onViewportChange,
  zoomSpeed,
  onResize,
  onModifyMap,
  onHoverCoord,
  selection,
  onSelect,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
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
  const strokeCountRef = useRef<number>(0);
  // Object being dragged with the select tool, and where the drag began
  const moveDragRef = useRef<{
    sel: Selection;
    startCell: GridCoord;
    startWorld: { x: number; y: number };
    origin: GridCoord;
  } | null>(null);
  // Drawing is blocked while the active layer is hidden or locked
  const layerEditable = isLayerEditable(findLayer(mapData, activeLayerId));
  const editLayer = useCallback(
    (edit: Parameters<typeof withLayer>[2], options?: Parameters<ModifyMap>[1]) =>
      onModifyMap((draft) => withLayer(draft, activeLayerId, edit), options),
    [onModifyMap, activeLayerId]
  );
  const hexGrid = isHexGrid(mapData.gridType) ? mapData.gridType : null;
  const hexBrush = hexGrid !== null && (activeTool === 'room-brush' || activeTool === 'eraser');

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

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const theme = THEMES[mapData.theme] || THEMES.parchment;
    const gridSize = mapData.gridSize;

    // Work in CSS pixels regardless of display density
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply viewport transform (pan & zoom)
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Map layers, with grid lines limited to the visible area
    renderMap(ctx, mapData, {
      minX: Math.floor(-viewport.x / viewport.zoom / gridSize) - 1,
      minY: Math.floor(-viewport.y / viewport.zoom / gridSize) - 1,
      maxX: Math.ceil((width - viewport.x) / viewport.zoom / gridSize) + 1,
      maxY: Math.ceil((height - viewport.y) / viewport.zoom / gridSize) + 1,
    });

    renderLightMarkers(ctx, mapData, viewport.zoom, theme.ink);

    // Live cursor & drag previews
    const hover = currentHoverRef.current;
    if (
      hover &&
      layerEditable &&
      !isPanningRef.current &&
      activeTool !== 'select' &&
      activeTool !== 'label' &&
      activeTool !== 'light'
    ) {
      ctx.save();
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.fillStyle = PREVIEW_FILLS[activeTool] ?? DEFAULT_PREVIEW_FILL;

      const here = { x: hover.gx, y: hover.gy };
      const dragStart = dragStartRef.current;

      if (isShapeTool(activeTool)) {
        if (shapeMode === 'cut') ctx.fillStyle = PREVIEW_FILLS.eraser!;
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
        }
        ctx.beginPath();
        for (const polygon of preview) {
          for (const ring of polygon) {
            ring.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * gridSize, y * gridSize) : ctx.lineTo(x * gridSize, y * gridSize)));
            ctx.closePath();
          }
        }
        ctx.fill('evenodd');
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
      } else if (hexGrid && hexBrush) {
        ctx.beginPath();
        const centre = hexAt(hexGrid, hover.worldX / gridSize, hover.worldY / gridSize);
        for (const h of hexesWithin(centre, brushSize)) {
          hexPolygon(hexGrid, h)[0].forEach(([x, y], i) =>
            i === 0 ? ctx.moveTo(x * gridSize, y * gridSize) : ctx.lineTo(x * gridSize, y * gridSize)
          );
          ctx.closePath();
        }
        ctx.fill();
        ctx.stroke();
      } else if (activeTool === 'door') {
        // Highlight the wall edge the door will snap to
        const edge = nearestDoorEdge(hover.worldX, hover.worldY, gridSize);
        const x = edge.x * gridSize;
        const y = edge.y * gridSize;
        ctx.setLineDash([]);
        ctx.lineWidth = 6;
        ctx.strokeStyle = 'rgba(139, 58, 43, 0.6)';
        ctx.beginPath();
        ctx.moveTo(x, y);
        if (edge.orientation === 'horizontal') ctx.lineTo(x + gridSize, y);
        else ctx.lineTo(x, y + gridSize);
        ctx.stroke();
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

    // Selection outline
    const bounds = selection ? objectBounds(mapData, selection) : null;
    if (bounds) {
      const pad = 4 / viewport.zoom;
      ctx.save();
      ctx.strokeStyle = '#c2513d';
      ctx.lineWidth = 2 / viewport.zoom;
      ctx.setLineDash([6 / viewport.zoom, 4 / viewport.zoom]);
      ctx.strokeRect(
        bounds.x * gridSize - pad,
        bounds.y * gridSize - pad,
        bounds.w * gridSize + pad * 2,
        bounds.h * gridSize + pad * 2
      );
      ctx.restore();
    }

    ctx.restore();
  }, [mapData, activeTool, brushSize, viewport, selection, layerEditable, shapeMode, snapPoint, hexGrid, hexBrush]);

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
  useKeyboardPan(onViewportChange, selection !== null && keepsSelection(activeTool));

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
          for (const { x: gx, y: gy } of cells.values()) {
            const key = `${gx},${gy}`;

            if (activeTool === 'room-brush') {
              carveFloor(draft, key, floorTexture);
            } else if (activeTool === 'water') {
              draft.water[key] = true;
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
    [activeTool, brushSize, selectedFoliageType, floorTexture, editLayer]
  );

  // On a hex grid the room brush and eraser lay or cut whole hexes
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
          applyShape(draft, shape, activeTool === 'eraser' ? 'cut' : 'add');
          if (activeTool !== 'eraser') return;
          // Water, plants and objects go with the cells centred in the hexes
          for (const h of hexes.values()) {
            const [cx, cy] = hexCenter(hexGrid, h);
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
    [hexGrid, activeTool, brushSize, editLayer]
  );

  // Adds the finished polygon or path to the active layer, or cuts it out
  const finishShape = useCallback(() => {
    const points = shapePointsRef.current;
    shapePointsRef.current = null;
    if (!points) return;
    const shape =
      activeTool === 'path' ? pathPolygon(points, brushSize) : polygonFromPoints(points);
    if (shape.length > 0) editLayer((draft) => applyShape(draft, shape, shapeMode));
    drawRef.current();
  }, [activeTool, brushSize, shapeMode, editLayer]);
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

  // Moves the dragged object: doors re-snap to the nearest wall edge, stairs
  // and props shift by whole cells from where the drag started
  const moveSelectedTo = (hover: HoverState) => {
    const drag = moveDragRef.current;
    if (!drag) return;
    const coalesce = { coalesce: `move-${strokeCountRef.current}` };
    const layer = findLayer(mapData, drag.sel.layerId);
    if (!layer) return;
    const editDragged = (edit: Parameters<typeof withLayer>[2]) =>
      onModifyMap((draft) => withLayer(draft, layer.id, edit), coalesce);

    if (drag.sel.kind === 'door') {
      const door = findDoor(layer, drag.sel.id);
      const edge = nearestDoorEdge(hover.worldX, hover.worldY, mapData.gridSize);
      if (!door) return;
      const same =
        door.x === edge.x && door.y === edge.y && door.orientation === edge.orientation;
      const occupied = layer.doors.some(
        (d) =>
          d.id !== door.id &&
          d.x === edge.x &&
          d.y === edge.y &&
          d.orientation === edge.orientation
      );
      if (!same && !occupied) {
        editDragged((draft) => replaceDoor(draft, { ...door, ...edge }));
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

    const x = drag.origin.x + hover.gx - drag.startCell.x;
    const y = drag.origin.y + hover.gy - drag.startCell.y;
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

  const pointerToGrid = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return screenToGrid(e.clientX - rect.left, e.clientY - rect.top);
  };

  // Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Keep receiving moves and the release even if the pointer leaves the canvas
    e.currentTarget.setPointerCapture(e.pointerId);

    // Middle click, Space + drag or Alt + drag pans
    if (e.button === 1 || (e.button === 0 && (spaceHeldRef.current || e.altKey))) {
      e.preventDefault();
      isPanningRef.current = true;
      setIsPanning(true);
      panStartRef.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      drawMap();
      return;
    }
    if (e.button !== 0) return;

    const hover = pointerToGrid(e);
    const { gx, gy } = hover;
    currentHoverRef.current = hover;

    if (activeTool === 'select') {
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      onSelect(hit);
      const obj = findSelected(mapData, hit);
      if (hit && obj) {
        strokeCountRef.current++;
        moveDragRef.current = {
          sel: hit,
          startCell: { x: gx, y: gy },
          startWorld: { x: hover.worldX, y: hover.worldY },
          origin: { x: obj.x, y: obj.y },
        };
      }
    } else if (activeTool === 'label') {
      // Clicking an existing label selects it; elsewhere places a new one
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      const existing = hit?.kind === 'label' ? findSelected(mapData, hit) : undefined;
      if (hit && existing) {
        onSelect(hit);
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
      onSelect({ kind: 'label', id, layerId: activeLayerId });
    } else if (activeTool === 'light') {
      // Clicking a light selects it for editing or dragging; elsewhere places one
      const hit = hitTestObject(mapData, hover.worldX, hover.worldY);
      if (hit?.kind === 'light') {
        onSelect(hit);
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
      const id = newObjectId('light');
      onModifyMap((draft) => {
        withLayer(draft, activeLayerId, (layer) => layer.lights.push({ id, x: gx, y: gy, ...DEFAULT_LIGHT }));
        // A light only shows on a darkened map
        draft.lighting = true;
      });
      onSelect({ kind: 'light', id, layerId: activeLayerId });
    } else if (!layerEditable) {
      return;
    } else if (activeTool === 'polygon' || activeTool === 'path') {
      freePlacementRef.current = e.shiftKey;
      const point = snapPoint(hover);
      const points = shapePointsRef.current;
      const near = (p: Pair | undefined) => !!p && Math.hypot(p[0] - point[0], p[1] - point[1]) < 0.15;
      if (!points) {
        shapePointsRef.current = [point];
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
      drawMap();
    } else if (activeTool === 'door') {
      const edge = nearestDoorEdge(hover.worldX, hover.worldY, mapData.gridSize);
      editLayer((draft) => {
        // Placing on an occupied edge replaces the door there
        draft.doors = draft.doors.filter(
          (d) => d.x !== edge.x || d.y !== edge.y || d.orientation !== edge.orientation
        );
        draft.doors.push({ id: newObjectId('door'), ...edge, type: selectedDoorType });
      });
    } else if (activeTool === 'stairs') {
      editLayer((draft) => {
        draft.stairs.push({
          id: newObjectId('stairs'),
          x: gx,
          y: gy,
          width: 1,
          height: 2,
          direction: 'down',
          steps: 4,
        });
      });
    } else if (activeTool === 'prop') {
      editLayer((draft) => {
        draft.props.push({
          id: newObjectId('prop'),
          x: gx,
          y: gy,
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
    if (isPanningRef.current) {
      onViewportChange({
        ...viewport,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const hover = pointerToGrid(e);
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
    } else {
      e.currentTarget.style.cursor = '';
    }
    const prev = currentHoverRef.current;
    const cellChanged = !prev || prev.gx !== hover.gx || prev.gy !== hover.gy;
    currentHoverRef.current = hover;
    if (isShapeTool(activeTool)) freePlacementRef.current = e.shiftKey;

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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
    }

    const start = dragStartRef.current;
    const end = currentHoverRef.current;
    if (start && end) {
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
      editLayer((draft) => applyShape(draft, [circlePolygon(centre[0], centre[1], radius)], shapeMode));
    }
    circleCentreRef.current = null;
    dragStartRef.current = null;
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
      moveDragRef.current ||
      isPanningRef.current
    ) {
      return;
    }
    currentHoverRef.current = null;
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
        onContextMenu={(e) => e.preventDefault()}
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

/** Clears everything but floor from a cell: water, plants and objects in it */
function eraseCellContents(layer: LayerContent, gx: number, gy: number) {
  const key = `${gx},${gy}`;
  delete layer.water[key];
  delete layer.foliage[key];
  layer.doors = layer.doors.filter((d) => !doorTouchesCell(d, gx, gy));
  layer.stairs = layer.stairs.filter((s) => !stairsContainCell(s, gx, gy));
  layer.props = layer.props.filter((p) => p.x !== gx || p.y !== gy);
  layer.lights = layer.lights.filter((l) => l.x !== gx || l.y !== gy);
  layer.labels = layer.labels.filter((l) => Math.floor(l.x) !== gx || Math.floor(l.y) !== gy);
}

function isShapeTool(tool: ToolType): boolean {
  return tool === 'polygon' || tool === 'circle' || tool === 'path';
}

/** A circle's radius out to `edge`, in half cells unless placed freely */
function circleRadius(centre: Pair, edge: Pair, free: boolean): number {
  const r = Math.hypot(edge[0] - centre[0], edge[1] - centre[1]);
  return free ? Math.max(0.1, r) : Math.max(0.5, Math.round(r * 2) / 2);
}

function usesBrush(tool: ToolType): boolean {
  return tool === 'room-brush' || tool === 'water' || tool === 'foliage' || tool === 'eraser';
}
