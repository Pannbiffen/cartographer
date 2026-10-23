// Darkness and light: every light lifts the darkness within its radius,
// except where walls block it, and tints what it reaches with its colour.
// Through a window it reaches further, dimmed and tinted by the pane. Lava
// glows: the darkness lifts off it, and its shores catch a dim orange light.
import type { LevelMap, MapLayer, PlacedWindow } from '../../types/map';
import { combinedWalls, floorPath, hasWater, layerWater } from '../geometry/region';
import { mergeWallSegments, visibilityPolygon, wallsWithGap, type Point, type Segment } from '../geometry/visibility';
import { lavaLights, mapLights, mapWindows, type MapLight } from '../lighting';
import { visibleLayers } from '../layers';
import { WINDOW_PANE_LENGTH } from './propsRenderer';
import { doorLine } from '../tools/toolGeometry';

// Walls and light shapes per level drawn (the active one and the faint ones
// below); maps are replaced on every edit, so the layer list identifies the content
interface ShapeCache {
  gridSize: number;
  walls: Segment[];
  shapes: Map<string, Point[]>;
  // Per light and window, the shape with that window open; null where it adds nothing
  through: Map<string, Point[] | null>;
}
const caches = new WeakMap<MapLayer[], ShapeCache>();

function shapeCache(map: LevelMap): ShapeCache {
  const g = map.gridSize;
  let cache = caches.get(map.layers);
  if (!cache || cache.gridSize !== g) {
    const walls = mergeWallSegments(combinedWalls(visibleLayers(map), g));
    cache = { gridSize: g, walls, shapes: new Map(), through: new Map() };
    caches.set(map.layers, cache);
  }
  return cache;
}

function lightShape(map: LevelMap, light: MapLight): Point[] {
  const g = map.gridSize;
  const cache = shapeCache(map);
  const key = `${light.x},${light.y},${light.radius}`;
  let shape = cache.shapes.get(key);
  if (!shape) {
    shape = visibilityPolygon({ x: light.x * g, y: light.y * g }, light.radius * g, cache.walls);
    cache.shapes.set(key, shape);
  }
  return shape;
}

/** The window's glass along its edge, in pixels */
function windowEdge(w: PlacedWindow, g: number): Segment {
  const { cx, cy, ux, uy, length } = doorLine(w);
  const half = (length * WINDOW_PANE_LENGTH) / 2;
  return { x1: (cx - ux * half) * g, y1: (cy - uy * half) * g, x2: (cx + ux * half) * g, y2: (cy + uy * half) * g };
}

/**
 * Each window within a light's reach that sits in a wall, with what the light
 * would see were that window open: the part outside `lightShape` is what
 * shines through the pane
 */
function throughWindows(map: LevelMap, light: MapLight): { pane: PlacedWindow; shape: Point[] }[] {
  const g = map.gridSize;
  const cache = shapeCache(map);
  const found: { pane: PlacedWindow; shape: Point[] }[] = [];
  for (const pane of mapWindows(map)) {
    // Only windows within the light's square
    const edge = windowEdge(pane, g);
    const r = light.radius * g;
    const [cx, cy] = [light.x * g, light.y * g];
    if (Math.max(edge.x1, edge.x2) < cx - r || Math.min(edge.x1, edge.x2) > cx + r) continue;
    if (Math.max(edge.y1, edge.y2) < cy - r || Math.min(edge.y1, edge.y2) > cy + r) continue;
    const key = `${light.x},${light.y},${light.radius}|${pane.orientation},${pane.x},${pane.y},${pane.angle},${pane.length}`;
    let shape = cache.through.get(key);
    if (shape === undefined) {
      const walls = wallsWithGap(cache.walls, edge);
      shape = walls === cache.walls ? null : visibilityPolygon({ x: cx, y: cy }, r, walls);
      cache.through.set(key, shape);
    }
    if (shape) found.push({ pane, shape });
  }
  return found;
}

function tracePolygon(ctx: CanvasRenderingContext2D, shape: Point[]) {
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

function clipTo(ctx: CanvasRenderingContext2D, shape: Point[]) {
  ctx.beginPath();
  tracePolygon(ctx, shape);
  ctx.clip();
}

/** Clips to what `outer` covers beyond `inner`, which lies within it */
function clipBetween(ctx: CanvasRenderingContext2D, outer: Point[], inner: Point[]) {
  ctx.beginPath();
  tracePolygon(ctx, outer);
  tracePolygon(ctx, inner);
  ctx.clip('evenodd');
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgba(hex: string, alpha: number): string {
  return `rgba(${rgb(hex).join(', ')}, ${alpha})`;
}

/** A light's colour after passing through a pane of `tint`, as filters multiply */
function filtered(color: string, tint: string): string {
  const [a, b] = [rgb(color), rgb(tint)];
  return `#${a.map((c, i) => Math.round((c * b[i]) / 255).toString(16).padStart(2, '0')).join('')}`;
}

// Scratch canvas holding the darkness while lights are cut out of it
let darkCanvas: HTMLCanvasElement | null = null;

// How much of the darkness lifts off lava itself
const LAVA_BRIGHTNESS = 0.8;

/** Placed lights, torches and the glow off lava */
function allLights(map: LevelMap): MapLight[] {
  const lava = lavaLights(map);
  return lava.length > 0 ? [...mapLights(map), ...lava] : mapLights(map);
}

/** Darkens the whole canvas except where lights reach (world transform on `ctx`) */
export function renderLighting(ctx: CanvasRenderingContext2D, map: LevelMap) {
  const g = map.gridSize;
  const lights = allLights(map);

  darkCanvas ??= document.createElement('canvas');
  const { width, height } = ctx.canvas;
  if (darkCanvas.width !== width || darkCanvas.height !== height) {
    darkCanvas.width = width;
    darkCanvas.height = height;
  }
  const dark = darkCanvas.getContext('2d');
  if (!dark) return;
  dark.setTransform(1, 0, 0, 1, 0, 0);
  dark.globalCompositeOperation = 'source-over';
  dark.clearRect(0, 0, width, height);
  dark.fillStyle = `rgba(6, 8, 14, ${map.darkness})`;
  dark.fillRect(0, 0, width, height);

  // Each light erases darkness, fully near its centre and fading to its
  // edge, and less through a window
  dark.setTransform(ctx.getTransform());
  dark.globalCompositeOperation = 'destination-out';
  for (const light of lights) {
    const cx = light.x * g;
    const cy = light.y * g;
    const r = light.radius * g;
    const fade = (strength: number) => {
      const gradient = dark.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(0.5, `rgba(0, 0, 0, ${strength * 0.75})`);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      return gradient;
    };
    const shape = lightShape(map, light);
    dark.save();
    clipTo(dark, shape);
    dark.fillStyle = fade(light.intensity);
    dark.fillRect(cx - r, cy - r, r * 2, r * 2);
    dark.restore();
    for (const { pane, shape: through } of throughWindows(map, light)) {
      dark.save();
      clipBetween(dark, through, shape);
      dark.fillStyle = fade(light.intensity * pane.clarity);
      dark.fillRect(cx - r, cy - r, r * 2, r * 2);
      dark.restore();
    }
  }
  // Lava shows through the dark, in its own colour
  dark.fillStyle = `rgba(0, 0, 0, ${LAVA_BRIGHTNESS})`;
  for (const layer of visibleLayers(map)) {
    if (hasWater(layer, 'lava')) dark.fill(floorPath(layerWater(layer, 'lava'), g), 'evenodd');
  }

  // Coloured glow first, so the darkness on top dims it near the edges too
  renderLightGlow(ctx, map);

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0);
  ctx.restore();
}

/**
 * Each light's coloured glow, stopped by walls, without lifting any darkness;
 * through a window it is dimmer and takes on the pane's tint
 */
export function renderLightGlow(ctx: CanvasRenderingContext2D, map: LevelMap) {
  const g = map.gridSize;
  for (const light of allLights(map)) {
    const cx = light.x * g;
    const cy = light.y * g;
    const r = light.radius * g;
    const glow = (color: string, strength: number) => {
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      gradient.addColorStop(0, rgba(color, (light.glow ?? 0.4) * strength));
      gradient.addColorStop(1, rgba(color, 0));
      return gradient;
    };
    const shape = lightShape(map, light);
    ctx.save();
    clipTo(ctx, shape);
    ctx.fillStyle = glow(light.color, light.intensity);
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    for (const { pane, shape: through } of throughWindows(map, light)) {
      ctx.save();
      clipBetween(ctx, through, shape);
      ctx.fillStyle = glow(filtered(light.color, pane.tint), light.intensity * pane.clarity);
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();
    }
  }
}

/**
 * Small sun icons where placed lights are, for the editor only (exports
 * show just the light). Sized in screen pixels whatever the zoom.
 */
export function renderLightMarkers(ctx: CanvasRenderingContext2D, map: LevelMap, zoom: number, ink: string) {
  const g = map.gridSize;
  const r = 6 / zoom;
  ctx.save();
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = ink;
  for (const layer of visibleLayers(map)) {
    for (const light of layer.lights) {
      const cx = (light.x + 0.5) * g;
      const cy = (light.y + 0.5) * g;
      ctx.beginPath();
      for (let n = 0; n < 8; n++) {
        const a = (n / 8) * Math.PI * 2;
        ctx.moveTo(cx + Math.cos(a) * r * 1.4, cy + Math.sin(a) * r * 1.4);
        ctx.lineTo(cx + Math.cos(a) * r * 2, cy + Math.sin(a) * r * 2);
      }
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = light.color;
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}
