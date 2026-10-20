import React, { useRef, useEffect, useCallback } from 'react';
import type { MapData, ToolType, DoorType, PropType, ViewportTransform } from '../types/map';
import { THEMES } from '../core/theme';
import { renderMap } from '../core/renderers/mapRenderer';
import type { ModifyMap } from '../App';

interface MapCanvasProps {
  mapData: MapData;
  activeTool: ToolType;
  brushSize: number;
  selectedDoorType: DoorType;
  selectedPropType: PropType;
  viewport: ViewportTransform;
  onViewportChange: (viewport: ViewportTransform) => void;
  onModifyMap: ModifyMap;
  onHoverCoord?: (coord: { gx: number; gy: number } | null) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  mapData,
  activeTool,
  brushSize,
  selectedDoorType,
  selectedPropType,
  viewport,
  onViewportChange,
  onModifyMap,
  onHoverCoord,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDrawingRef = useRef<boolean>(false);
  const rectDragStartRef = useRef<{ gx: number; gy: number } | null>(null);
  const currentHoverRef = useRef<{ gx: number; gy: number } | null>(null);
  const strokeCountRef = useRef<number>(0);

  // Screen to world grid coordinates
  const screenToGrid = useCallback(
    (screenX: number, screenY: number) => {
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

    const width = canvas.width;
    const height = canvas.height;
    const theme = THEMES[mapData.theme] || THEMES.parchment;
    const gridSize = mapData.gridSize;

    // Clear background
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // Apply viewport transform (pan & zoom)
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.zoom, viewport.zoom);

    // Map layers, with grid lines limited to the visible area
    const dpr = window.devicePixelRatio || 1;
    renderMap(ctx, mapData, {
      minX: Math.floor(-viewport.x / viewport.zoom / gridSize) - 1,
      minY: Math.floor(-viewport.y / viewport.zoom / gridSize) - 1,
      maxX: Math.ceil((width / dpr - viewport.x) / viewport.zoom / gridSize) + 1,
      maxY: Math.ceil((height / dpr - viewport.y) / viewport.zoom / gridSize) + 1,
    });

    // 10. Live Cursor & Drag Previews
    const hover = currentHoverRef.current;
    if (hover) {
      ctx.save();

      if (activeTool === 'room-rect' && rectDragStartRef.current) {
        // Rectangle room drag preview
        const start = rectDragStartRef.current;
        const minGx = Math.min(start.gx, hover.gx);
        const maxGx = Math.max(start.gx, hover.gx);
        const minGy = Math.min(start.gy, hover.gy);
        const maxGy = Math.max(start.gy, hover.gy);

        const rx = minGx * gridSize;
        const ry = minGy * gridSize;
        const rw = (maxGx - minGx + 1) * gridSize;
        const rh = (maxGy - minGy + 1) * gridSize;

        ctx.fillStyle = 'rgba(180, 150, 120, 0.3)';
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = theme.ink;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2;
        ctx.strokeRect(rx, ry, rw, rh);

      } else {
        // Brush cursor highlight
        const radius = Math.floor(brushSize / 2);
        const hx = (hover.gx - radius) * gridSize;
        const hy = (hover.gy - radius) * gridSize;
        const hw = brushSize * gridSize;
        const hh = brushSize * gridSize;

        ctx.strokeStyle = theme.ink;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);

        if (activeTool === 'eraser') {
          ctx.fillStyle = 'rgba(230, 80, 80, 0.2)';
        } else if (activeTool === 'water') {
          ctx.fillStyle = 'rgba(60, 140, 180, 0.25)';
        } else if (activeTool === 'foliage') {
          ctx.fillStyle = 'rgba(80, 150, 80, 0.25)';
        } else {
          ctx.fillStyle = 'rgba(210, 180, 140, 0.25)';
        }

        ctx.fillRect(hx, hy, hw, hh);
        ctx.strokeRect(hx, hy, hw, hh);
      }

      ctx.restore();
    }

    ctx.restore();
  }, [mapData, activeTool, brushSize, viewport]);

  // Handle Canvas Resizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
      drawMap();
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, [drawMap]);

  useEffect(() => {
    drawMap();
  }, [drawMap]);

  // Apply brush action to map cells
  const applyBrush = useCallback(
    (centerGx: number, centerGy: number) => {
      const radius = Math.floor(brushSize / 2);
      onModifyMap((draft) => {
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const gx = centerGx + dx;
            const gy = centerGy + dy;
            const key = `${gx},${gy}`;

            if (activeTool === 'room-brush' || activeTool === 'tunnel') {
              draft.rooms[key] = true;
            } else if (activeTool === 'water') {
              draft.water[key] = true;
            } else if (activeTool === 'foliage') {
              draft.foliage[key] = {
                type: 'tree',
                seed: Math.floor(Math.random() * 10000),
              };
            } else if (activeTool === 'eraser') {
              delete draft.rooms[key];
              delete draft.water[key];
              delete draft.foliage[key];
              draft.doors = draft.doors.filter((d) => d.x !== gx || d.y !== gy);
              draft.stairs = draft.stairs.filter((s) => s.x !== gx || s.y !== gy);
              draft.props = draft.props.filter((p) => p.x !== gx || p.y !== gy);
            }
          }
        }
      }, { coalesce: `stroke-${strokeCountRef.current}` });
    },
    [activeTool, brushSize, onModifyMap]
  );

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Middle click or Space key panning
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - viewport.x, y: e.clientY - viewport.y };
      return;
    }

    if (e.button === 0) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const { gx, gy } = screenToGrid(e.clientX - rect.left, e.clientY - rect.top);

      if (activeTool === 'room-rect') {
        rectDragStartRef.current = { gx, gy };
      } else if (activeTool === 'door') {
        // Auto-detect horizontal vs vertical orientation based on neighboring rooms
        const hasTop = !!mapData.rooms[`${gx},${gy - 1}`];
        const hasBottom = !!mapData.rooms[`${gx},${gy + 1}`];
        const hasLeft = !!mapData.rooms[`${gx - 1},${gy}`];
        const hasRight = !!mapData.rooms[`${gx + 1},${gy}`];

        const orientation = (hasTop || hasBottom) && !(hasLeft && hasRight) ? 'horizontal' : 'vertical';

        onModifyMap((draft) => {
          draft.doors.push({
            id: `door_${Date.now()}`,
            x: gx,
            y: gy,
            orientation,
            type: selectedDoorType,
          });
        });
      } else if (activeTool === 'stairs') {
        onModifyMap((draft) => {
          draft.stairs.push({
            id: `stairs_${Date.now()}`,
            x: gx,
            y: gy,
            width: 1,
            height: 2,
            direction: 'down',
            steps: 4,
          });
        });
      } else if (activeTool === 'prop') {
        onModifyMap((draft) => {
          draft.props.push({
            id: `prop_${Date.now()}`,
            x: gx,
            y: gy,
            type: selectedPropType,
            rotation: 0,
          });
        });
      } else {
        isDrawingRef.current = true;
        strokeCountRef.current++;
        applyBrush(gx, gy);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (isPanningRef.current) {
      onViewportChange({
        ...viewport,
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    const { gx, gy } = screenToGrid(mouseX, mouseY);
    currentHoverRef.current = { gx, gy };
    if (onHoverCoord) onHoverCoord({ gx, gy });

    if (isDrawingRef.current) {
      applyBrush(gx, gy);
    }

    drawMap();
  };

  const handleMouseUp = (_e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
    }

    if (activeTool === 'room-rect' && rectDragStartRef.current && currentHoverRef.current) {
      const start = rectDragStartRef.current;
      const end = currentHoverRef.current;
      const minGx = Math.min(start.gx, end.gx);
      const maxGx = Math.max(start.gx, end.gx);
      const minGy = Math.min(start.gy, end.gy);
      const maxGy = Math.max(start.gy, end.gy);

      onModifyMap((draft) => {
        for (let y = minGy; y <= maxGy; y++) {
          for (let x = minGx; x <= maxGx; x++) {
            draft.rooms[`${x},${y}`] = true;
          }
        }
      });
      rectDragStartRef.current = null;
    }

    isDrawingRef.current = false;
    drawMap();
  };

  const handleMouseLeave = () => {
    isPanningRef.current = false;
    isDrawingRef.current = false;
    currentHoverRef.current = null;
    if (onHoverCoord) onHoverCoord(null);
    drawMap();
  };

  // Zoom with Mouse Wheel
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newZoom = Math.min(4.0, Math.max(0.2, viewport.zoom * zoomFactor));

    // Keep point under cursor invariant
    const newX = mouseX - (mouseX - viewport.x) * (newZoom / viewport.zoom);
    const newY = mouseY - (mouseY - viewport.y) * (newZoom / viewport.zoom);

    onViewportChange({
      x: newX,
      y: newY,
      zoom: newZoom,
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden cursor-crosshair">
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
};
