// Shared map renderer used by both the live canvas and the exporters
import type { MapData } from '../../types/map';
import { THEMES } from '../theme';
import {
  extractWallSegments,
  renderDysonHatching,
  renderWallOutlines,
  extractWaterSegments,
  renderWaterRipples,
  renderFoliageCluster,
} from '../geometry/hatching';
import { renderDoor, renderStairs, renderProp } from './propsRenderer';

export interface GridRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function fillCells(
  ctx: CanvasRenderingContext2D,
  cells: { [key: string]: boolean },
  gridSize: number
) {
  ctx.beginPath();
  for (const key of Object.keys(cells)) {
    if (!cells[key]) continue;
    const [gx, gy] = key.split(',').map(Number);
    ctx.rect(gx * gridSize, gy * gridSize, gridSize, gridSize);
  }
  ctx.fill();
}

/**
 * Draws all map layers in world coordinates (the caller sets up pan/zoom and
 * fills the background). Grid lines are drawn over `gridRange` when given.
 */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  mapData: MapData,
  gridRange: GridRange | null
) {
  const theme = THEMES[mapData.theme] || THEMES.parchment;
  const gridSize = mapData.gridSize;
  const wallSegments = extractWallSegments(mapData.rooms, gridSize);

  // 1. Exterior hatching goes down first so floors cover any strokes that
  //    stray into neighbouring rooms
  renderDysonHatching(
    ctx,
    wallSegments,
    gridSize,
    mapData.hatchLength,
    mapData.hatchDensity,
    theme.hatch
  );

  // 2. Floors
  ctx.fillStyle = theme.floor;
  fillCells(ctx, mapData.rooms, gridSize);

  // 3. Water sits on top of floors (pools inside rooms) and terrain
  if (Object.keys(mapData.water).length > 0) {
    ctx.fillStyle = theme.waterTint;
    fillCells(ctx, mapData.water, gridSize);
    const waterSegments = extractWaterSegments(mapData.water, gridSize);
    renderWaterRipples(ctx, waterSegments, theme.waterRipples);
  }

  // 4. Thick wall outlines
  renderWallOutlines(ctx, wallSegments, 3.2, theme.ink);

  // 5. Foliage (trees, bushes, boulders)
  for (const key of Object.keys(mapData.foliage)) {
    const item = mapData.foliage[key];
    if (!item) continue;
    const [gx, gy] = key.split(',').map(Number);
    renderFoliageCluster(
      ctx,
      gx,
      gy,
      gridSize,
      item.type,
      item.seed,
      theme.foliageInk,
      theme.foliageFill
    );
  }

  // 6. Stairs, doors, props
  for (const stairs of mapData.stairs) {
    renderStairs(ctx, stairs, gridSize, theme.ink, theme.floor);
  }
  for (const door of mapData.doors) {
    renderDoor(ctx, door, gridSize, theme.ink, theme.propFill);
  }
  for (const prop of mapData.props) {
    renderProp(ctx, prop, gridSize, theme.ink);
  }

  // 7. Grid overlay
  if (gridRange && mapData.showGrid) {
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = mapData.gridOpacity;

    ctx.beginPath();
    for (let x = gridRange.minX; x <= gridRange.maxX + 1; x++) {
      ctx.moveTo(x * gridSize, gridRange.minY * gridSize);
      ctx.lineTo(x * gridSize, (gridRange.maxY + 1) * gridSize);
    }
    for (let y = gridRange.minY; y <= gridRange.maxY + 1; y++) {
      ctx.moveTo(gridRange.minX * gridSize, y * gridSize);
      ctx.lineTo((gridRange.maxX + 1) * gridSize, y * gridSize);
    }
    ctx.stroke();
    ctx.restore();
  }
}
