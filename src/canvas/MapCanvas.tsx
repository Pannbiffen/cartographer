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
  Selection,
  ViewportTransform,
} from '../types/map';
import { THEMES } from '../core/theme';
import { MAX_ZOOM, MIN_ZOOM } from '../core/viewport';
import { renderMap } from '../core/renderers/mapRenderer';
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
  replaceProp,
  replaceStairs,
} from '../core/objects';
import { findLayer, isLayerEditable, withLayer } from '../core/layers';
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
  // Layer the drawing tools edit
  activeLayerId: string;
  viewport: ViewportTransform;
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportTransform>>;
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
  activeLayerId,
  viewport,
  onViewportChange,
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

    // Live cursor & drag previews
    const hover = currentHoverRef.current;
    if (
      hover &&
      layerEditable &&
      !isPanningRef.current &&
      activeTool !== 'select' &&
      activeTool !== 'label'
    ) {
      ctx.save();
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.fillStyle = PREVIEW_FILLS[activeTool] ?? DEFAULT_PREVIEW_FILL;

      const here = { x: hover.gx, y: hover.gy };
      const dragStart = dragStartRef.current;

      if (activeTool === 'door') {
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
  }, [mapData, activeTool, brushSize, viewport, selection, layerEditable]);

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
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;

      onViewportChange((v) => {
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * zoomFactor));
        // Keep point under cursor invariant
        return {
          x: mouseX - (mouseX - v.x) * (newZoom / v.zoom),
          y: mouseY - (mouseY - v.y) * (newZoom / v.zoom),
          zoom: newZoom,
        };
      });
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [onViewportChange]);

  // Apply brush action to map cells around each centre cell
  const applyBrush = useCallback(
    (centers: GridCoord[]) => {
      const cells = new Map<string, GridCoord>();
      for (const center of centers) {
        for (const c of brushCells(center.x, center.y, brushSize)) cells.set(`${c.x},${c.y}`, c);
      }
      editLayer(
        (draft) => {
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
              delete draft.water[key];
              delete draft.foliage[key];
              draft.doors = draft.doors.filter((d) => !doorTouchesCell(d, gx, gy));
              draft.stairs = draft.stairs.filter((s) => !stairsContainCell(s, gx, gy));
              draft.props = draft.props.filter((p) => p.x !== gx || p.y !== gy);
              draft.labels = draft.labels.filter(
                (l) => Math.floor(l.x) !== gx || Math.floor(l.y) !== gy
              );
            }
          }
        },
        { coalesce: `stroke-${strokeCountRef.current}` }
      );
    },
    [activeTool, brushSize, selectedFoliageType, floorTexture, editLayer]
  );

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
    } else if (!layerEditable) {
      return;
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
    } else {
      e.currentTarget.style.cursor = '';
    }
    const prev = currentHoverRef.current;
    const cellChanged = !prev || prev.gx !== hover.gx || prev.gy !== hover.gy;
    currentHoverRef.current = hover;

    if (cellChanged) {
      onHoverCoord?.({ gx: hover.gx, gy: hover.gy });
      if (isDrawingRef.current && prev) {
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
        for (const c of cells) carveFloor(draft, `${c.x},${c.y}`, floorTexture);
      });
    }
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

function usesBrush(tool: ToolType): boolean {
  return tool === 'room-brush' || tool === 'water' || tool === 'foliage' || tool === 'eraser';
}
