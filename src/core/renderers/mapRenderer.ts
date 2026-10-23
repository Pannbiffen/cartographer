// Shared map renderer used by both the live canvas and the exporters
import type { LevelMap, MapLayer, WaterStyle } from '../../types/map';
import { mapTheme, propColor, type ThemeColors } from '../theme';
import {
  extractWallSegments,
  renderDysonHatching,
  renderBandHatching,
  renderWallOutlines,
  extractWaterSegments,
  renderWaterRipples,
  renderShoreRipples,
  renderFoliageCluster,
} from '../geometry/hatching';
import { renderDoor, renderStairs, renderProp, renderWindow } from './propsRenderer';
import { renderLabel } from './labelRenderer';
import { renderFloorTextures, renderGround, renderPaint } from './floorRenderer';
import { renderLightGlow, renderLighting } from './lightingRenderer';
import { floorPath, floorSegments, hasPaint, hasShapes, layerFloor, layerWater } from '../geometry/region';
import { hexGridPath, isHexGrid } from '../geometry/hex';
import { thinWallSegments } from '../geometry/walls';
import { layerHatching, visibleLayers } from '../layers';

export interface GridRange {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * One liquid on a layer: solid water hides what lies beneath, see-through
 * water tints it, and lava covers it in its own colour with crust along the edge
 */
function renderWater(ctx: CanvasRenderingContext2D, layer: MapLayer, style: WaterStyle, theme: ThemeColors, gridSize: number) {
  const { cells, areas, fills, lines } = {
    solid: { cells: layer.water, areas: layer.waterAreas, fills: [theme.floor, theme.waterTint], lines: theme.waterRipples },
    'see-through': { cells: layer.clearWater, areas: layer.clearWaterAreas, fills: [theme.waterTint], lines: theme.waterRipples },
    lava: { cells: layer.lava, areas: layer.lavaAreas, fills: [theme.lava], lines: theme.lavaCrust },
  }[style];
  if (areas.length > 0) {
    // Free-form water merges with the water cells into one shoreline
    const outline = layerWater(layer, style);
    const water = floorPath(outline, gridSize);
    for (const fill of fills) {
      ctx.fillStyle = fill;
      ctx.fill(water, 'evenodd');
    }
    ctx.save();
    ctx.clip(water, 'evenodd');
    renderShoreRipples(ctx, outline, gridSize, lines);
    ctx.restore();
  } else if (Object.keys(cells).length > 0) {
    for (const fill of fills) {
      ctx.fillStyle = fill;
      fillCells(ctx, cells, gridSize);
    }
    renderWaterRipples(ctx, extractWaterSegments(cells, gridSize), lines);
  }
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

// Scratch canvases for drawing a see-through layer before blending it in,
// one per nesting depth (a ghost level holds see-through layers of its own)
const blendCanvases: HTMLCanvasElement[] = [];
let blendDepth = 0;

/** Runs `draw` on a blank canvas matching `ctx`, then blends it in at `opacity` */
function drawWithOpacity(
  ctx: CanvasRenderingContext2D,
  opacity: number,
  draw: (layerCtx: CanvasRenderingContext2D) => void
) {
  const blendCanvas = (blendCanvases[blendDepth] ??= document.createElement('canvas'));
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
  blendDepth++;
  try {
    draw(layerCtx);
  } finally {
    blendDepth--;
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = opacity;
  ctx.drawImage(blendCanvas, 0, 0);
  ctx.restore();
}

/** One layer's terrain and objects, bottom to top (labels are drawn separately) */
function renderLayer(ctx: CanvasRenderingContext2D, layer: MapLayer, mapData: LevelMap) {
  const theme = mapTheme(mapData);
  const gridSize = mapData.gridSize;
  // Cells alone are quick to outline; free-form shapes need merging with them
  const floor = hasShapes(layer) ? floorPath(layerFloor(layer), gridSize) : null;
  const wallSegments = floor
    ? floorSegments(layerFloor(layer), gridSize)
    : extractWallSegments(layer.rooms, gridSize);

  // 1. Paint lies on the ground, under everything else. Exterior hatching
  //    goes next so floors cover any strokes that stray into neighbouring rooms
  if (hasPaint(layer)) renderPaint(ctx, layer, gridSize, theme);
  const hatch = layerHatching(layer, mapData);
  if (hatch.style === 'dyson') {
    renderDysonHatching(ctx, wallSegments, gridSize, hatch.length, hatch.density, theme.hatch);
  } else if (hatch.style !== 'none') {
    renderBandHatching(ctx, wallSegments, hatch.style, hatch.length, hatch.density, theme.hatch);
  }

  // 2. Floors and their textures
  ctx.fillStyle = theme.floor;
  if (floor) {
    ctx.fill(floor, 'evenodd');
    // Textures stop where a cut crosses them
    ctx.save();
    ctx.clip(floor, 'evenodd');
    renderFloorTextures(ctx, layer, gridSize, theme);
    ctx.restore();
  } else {
    fillCells(ctx, layer.rooms, gridSize);
    renderFloorTextures(ctx, layer, gridSize, theme);
  }

  // 3. Water sits on top of floors (pools inside rooms) and terrain
  renderWater(ctx, layer, 'see-through', theme, gridSize);
  renderWater(ctx, layer, 'solid', theme, gridSize);
  renderWater(ctx, layer, 'lava', theme, gridSize);

  // 4. Thick wall outlines, and thin walls in the same style; a door on
  //    any shown layer opens a thin wall where it sits
  renderWallOutlines(ctx, wallSegments, mapData.wallStyle, theme.ink);
  if (layer.walls.length > 0) {
    const doors = visibleLayers(mapData).flatMap((l) => l.doors);
    renderWallOutlines(ctx, thinWallSegments(layer.walls, doors, gridSize), mapData.wallStyle, theme.ink);
  }

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

  // 6. Stairs, doors, windows, props
  for (const stairs of layer.stairs) {
    renderStairs(ctx, stairs, gridSize, theme.ink, theme.floor);
  }
  for (const door of layer.doors) {
    renderDoor(ctx, door, gridSize, theme.ink, theme.propFill);
  }
  for (const pane of layer.windows) {
    renderWindow(ctx, pane, gridSize, theme.ink);
  }
  for (const prop of layer.props) {
    renderProp(ctx, prop, gridSize, theme.ink, propColor(theme, prop.type));
  }
}

/** Grid lines over `gridRange` */
function renderGrid(ctx: CanvasRenderingContext2D, mapData: LevelMap, gridRange: GridRange, colour: string) {
  const gridSize = mapData.gridSize;
  ctx.save();
  ctx.strokeStyle = colour;
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

/**
 * Draws all shown map layers in world coordinates (the caller sets up
 * pan/zoom and fills the background). Grid lines are drawn over `gridRange`
 * when given. Pass `lighting: false` to leave out darkness and lights even
 * when the map has them on (VTT exports light the map themselves),
 * `labels: false` to leave out the text, and `ground: false` to leave out a
 * textured background (drawn first with `renderMapGround`). `lightsBelow`
 * are the faint levels drawn underneath (`renderGhostLevel`), whose lights
 * then show where those levels do.
 */
export function renderMap(
  ctx: CanvasRenderingContext2D,
  mapData: LevelMap,
  gridRange: GridRange | null,
  {
    lighting = true,
    labels = true,
    ground = true,
    lightsBelow = [],
  }: { lighting?: boolean; labels?: boolean; ground?: boolean; lightsBelow?: { map: LevelMap; opacity: number }[] } = {}
) {
  const theme = mapTheme(mapData);
  const gridSize = mapData.gridSize;
  const layers = mapData.layers.filter((l) => l.visible && l.opacity > 0);

  if (ground) renderMapGround(ctx, mapData);
  // On a dark background, grid lines the floors then cover, as the grid over them is too dark to show
  if (gridRange && mapData.showGrid && theme.backgroundGrid) renderGrid(ctx, mapData, gridRange, theme.backgroundGrid);

  // A see-through layer is drawn whole and then blended, so its own
  // overlapping strokes don't show through each other
  for (const layer of layers) {
    if (layer.opacity >= 1) renderLayer(ctx, layer, mapData);
    else drawWithOpacity(ctx, layer.opacity, (layerCtx) => renderLayer(layerCtx, layer, mapData));
  }

  // Grid overlay
  if (gridRange && mapData.showGrid) renderGrid(ctx, mapData, gridRange, theme.grid);

  // Darkness covers the grid too, but labels stay readable on top
  if (lighting && mapData.lighting) {
    renderLighting(ctx, mapData);
    // Over this level's darkness, which would all but hide them, but kept
    // off its floors like the rest of the faint level
    for (const below of lightsBelow) {
      drawWithOpacity(ctx, below.opacity, (glowCtx) => {
        renderLightGlow(glowCtx, below.map);
        // The scratch canvas is shared, so its compositing is put back after
        glowCtx.save();
        glowCtx.globalCompositeOperation = 'destination-out';
        glowCtx.fillStyle = '#000';
        for (const layer of layers) {
          if (hasShapes(layer)) glowCtx.fill(floorPath(layerFloor(layer), gridSize), 'evenodd');
          else fillCells(glowCtx, layer.rooms, gridSize);
        }
        glowCtx.restore();
      });
    }
  }

  // Labels of every layer sit above everything, including the grid
  for (const layer of labels ? layers : []) {
    ctx.save();
    ctx.globalAlpha = layer.opacity;
    for (const label of layer.labels) {
      renderLabel(ctx, label, gridSize, theme.ink, theme.floor);
    }
    ctx.restore();
  }
}

/** A textured background, over everything the canvas shows; nothing for paper or black (the caller's `bg` fill) */
export function renderMapGround(ctx: CanvasRenderingContext2D, mapData: LevelMap) {
  if (mapData.background === 'paper' || mapData.background === 'black') return;
  renderGround(ctx, mapData.background, mapData.gridSize, mapTheme(mapData));
}

/**
 * Draws a level faintly, for showing under the one being edited: no grid,
 * light, text or ground (which would hide the levels under it)
 */
export function renderGhostLevel(ctx: CanvasRenderingContext2D, mapData: LevelMap, opacity: number) {
  drawWithOpacity(ctx, opacity, (ghostCtx) =>
    renderMap(ghostCtx, mapData, null, { lighting: false, labels: false, ground: false })
  );
}
