// Shared map renderer used by both the live canvas and the exporters
import type { LevelMap, MapLayer } from '../../types/map';
import { THEMES } from '../theme';
import {
  extractWallSegments,
  renderDysonHatching,
  renderBandHatching,
  renderWallOutlines,
  extractWaterSegments,
  renderWaterRipples,
  renderFoliageCluster,
} from '../geometry/hatching';
import { renderDoor, renderStairs, renderProp } from './propsRenderer';
import { renderLabel } from './labelRenderer';
import { renderFloorTextures } from './floorRenderer';
import { renderLighting } from './lightingRenderer';
import { floorPath, floorSegments, hasShapes, layerFloor } from '../geometry/region';
import { hexGridPath, isHexGrid } from '../geometry/hex';

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

// Scratch canvas for drawing a see-through layer before blending it in
let blendCanvas: HTMLCanvasElement | null = null;

/** Runs `draw` on a blank canvas matching `ctx`, then blends it in at `opacity` */
function drawWithOpacity(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  draw: (layerCtx: CanvasRenderingContext2D) => void
) {
  blendCanvas ??= document.createElement('canvas');
  const { width, height } = ctx.canvas;
  if (blendCanvas.width !== width || blendCanvas.height !== height) {
    blendCanvas.width = width;
    blendCanvas.height = height;
  }
  const layerCtx = blendCanvas.getContext('2d');
  if (!layerCtx) return;
  layerCtx.setTransform(1, 0, 0, 1, 0, 0);
  layerCtx.clearRect(0, 0, width, height);
  layerCtx.setTransform(ctx.getTransform());
  draw(layerCtx);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.drawImage(blendCanvas, 0, 0);
  ctx.restore();
}

/** One layer's terrain and objects, bottom to top (labels are drawn separately) */
function renderLayer(ctx: CanvasRenderingContext2D, layer: MapLayer, mapData: LevelMap) {
  const theme = THEMES[mapData.theme] || THEMES.parchment;
  const gridSize = mapData.gridSize;
  // Cells alone are quick to outline; free-form shapes need merging with them
  const floor = hasShapes(layer) ? floorPath(layerFloor(layer), gridSize) : null;
  const wallSegments = floor
    ? floorSegments(layerFloor(layer), gridSize)
    : extractWallSegments(layer.rooms, gridSize);

  // 1. Exterior hatching goes down first so floors cover any strokes that
  //    stray into neighbouring rooms
  const hatchStyle = mapData.hatchStyle;
  if (hatchStyle === 'dyson') {
    renderDysonHatching(
      ctx,
      wallSegments,
      gridSize,
      mapData.hatchLength,
      mapData.hatchDensity,
      theme.hatch
    );
  } else if (hatchStyle !== 'none') {
    renderBandHatching(ctx, wallSegments, hatchStyle, mapData.hatchLength, mapData.hatchDensity, theme.hatch);
  }

  // 2. Floors and their textures
  ctx.fillStyle = theme.floor;
  if (floor) {
    ctx.fill(floor, 'evenodd');
    // Textures stop where a cut crosses them
    ctx.save();
    ctx.clip(floor, 'evenodd');
    renderFloorTextures(ctx, layer, gridSize, theme.ink);
    ctx.restore();
  } else {
    fillCells(ctx, layer.rooms, gridSize);
    renderFloorTextures(ctx, layer, gridSize, theme.ink);
  }

  // 3. Water sits on top of floors (pools inside rooms) and terrain
  if (Object.keys(layer.water).length > 0) {
    ctx.fillStyle = theme.waterTint;
    fillCells(ctx, layer.water, gridSize);
    const waterSegments = extractWaterSegments(layer.water, gridSize);
    renderWaterRipples(ctx, waterSegments, theme.waterRipples);
  }

  // 4. Thick wall outlines
  renderWallOutlines(ctx, wallSegments, mapData.wallStyle, theme.ink);

  // 5. Foliage (trees, bushes, boulders)
  for (const key of Object.keys(layer.foliage)) {
    const item = layer.foliage[key];
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
  for (const stairs of layer.stairs) {
    renderStairs(ctx, stairs, gridSize, theme.ink, theme.floor);
  }
  for (const door of layer.doors) {
    renderDoor(ctx, door, gridSize, theme.ink, theme.propFill);
  }
  for (const prop of layer.props) {
    renderProp(ctx, prop, gridSize, theme.ink);
  }
}

/**
 * Draws all shown map layers in world coordinates (the caller sets up
 * pan/zoom and fills the background). Grid lines are drawn over `gridRange`
 * when given. Pass `lighting: false` to leave out darkness and lights even
 * when the map has them on (VTT exports light the map themselves).
 */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  mapData: LevelMap,
  gridRange: GridRange | null,
  { lighting = true }: { lighting?: boolean } = {}
) {
  const theme = THEMES[mapData.theme] || THEMES.parchment;
  const gridSize = mapData.gridSize;
  const layers = mapData.layers.filter((l) => l.visible && l.opacity > 0);

  // A see-through layer is drawn whole and then blended, so its own
  // overlapping strokes don't show through each other
  for (const layer of layers) {
    if (layer.opacity >= 1) renderLayer(ctx, layer, mapData);
    else drawWithOpacity(ctx, layer.opacity, (layerCtx) => renderLayer(layerCtx, layer, mapData));
  }

  // Grid overlay
  if (gridRange && mapData.showGrid) {
    ctx.save();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    ctx.globalAlpha = mapData.gridOpacity;

    ctx.beginPath();
    if (isHexGrid(mapData.gridType)) {
      // Kept to the range, as exports clip to it anyway
      ctx.rect(
        gridRange.minX * gridSize,
        gridRange.minY * gridSize,
        (gridRange.maxX - gridRange.minX + 1) * gridSize,
        (gridRange.maxY - gridRange.minY + 1) * gridSize
      );
      ctx.clip();
      ctx.beginPath();
      hexGridPath(ctx, mapData.gridType, gridSize, gridRange.minX, gridRange.minY, gridRange.maxX + 1, gridRange.maxY + 1);
    } else {
      for (let x = gridRange.minX; x <= gridRange.maxX + 1; x++) {
        ctx.moveTo(x * gridSize, gridRange.minY * gridSize);
        ctx.lineTo(x * gridSize, (gridRange.maxY + 1) * gridSize);
      }
      for (let y = gridRange.minY; y <= gridRange.maxY + 1; y++) {
        ctx.moveTo(gridRange.minX * gridSize, y * gridSize);
        ctx.lineTo((gridRange.maxX + 1) * gridSize, y * gridSize);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Darkness covers the grid too, but labels stay readable on top
  if (lighting && mapData.lighting) renderLighting(ctx, mapData);

  // Labels of every layer sit above everything, including the grid
  for (const layer of layers) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    for (const label of layer.labels) {
      renderLabel(ctx, label, gridSize, theme.ink, theme.floor);
    }
    ctx.restore();
  }
}
