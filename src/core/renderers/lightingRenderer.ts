// Darkness and light: every light lifts the darkness within its radius,
// except where walls block it, and tints what it reaches with its colour
import type { MapData, MapLayer } from '../../types/map';
import { combinedWalls } from '../geometry/region';
import { mergeWallSegments, visibilityPolygon, type Point, type Segment } from '../geometry/visibility';
import { mapLights, type MapLight } from '../lighting';
import { visibleLayers } from '../layers';

// Walls and light shapes for the last map drawn; maps are replaced on every
// edit, so the layer list identifies the content
let cache: {
  layers: MapLayer[];
  gridSize: number;
  walls: Segment[];
  shapes: Map<string, Point[]>;
} | null = null;

function lightShape(map: MapData, light: MapLight): Point[] {
  const g = map.gridSize;
  if (!cache || cache.layers !== map.layers || cache.gridSize !== g) {
    const walls = mergeWallSegments(combinedWalls(visibleLayers(map), g));
    cache = { layers: map.layers, gridSize: g, walls, shapes: new Map() };
  }
  const key = `${light.x},${light.y},${light.radius}`;
  let shape = cache.shapes.get(key);
  if (!shape) {
    shape = visibilityPolygon({ x: light.x * g, y: light.y * g }, light.radius * g, cache.walls);
    cache.shapes.set(key, shape);
  }
  return shape;
}

function clipTo(ctx: CanvasRenderingContext2D, shape: Point[]) {
  ctx.beginPath();
  shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.clip();
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// Scratch canvas holding the darkness while lights are cut out of it
let darkCanvas: HTMLCanvasElement | null = null;

/** Darkens the whole canvas except where lights reach (world transform on `ctx`) */
export function renderLighting(ctx: CanvasRenderingContext2D, map: MapData) {
  const g = map.gridSize;
  const lights = mapLights(map);

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

  // Each light erases darkness, fully near its centre and fading to its edge
  dark.setTransform(ctx.getTransform());
  dark.globalCompositeOperation = 'destination-out';
  for (const light of lights) {
    const cx = light.x * g;
    const cy = light.y * g;
    const r = light.radius * g;
    const fade = dark.createRadialGradient(cx, cy, 0, cx, cy, r);
    fade.addColorStop(0, `rgba(0, 0, 0, ${light.intensity})`);
    fade.addColorStop(0.5, `rgba(0, 0, 0, ${light.intensity * 0.75})`);
    fade.addColorStop(1, 'rgba(0, 0, 0, 0)');
    dark.save();
    clipTo(dark, lightShape(map, light));
    dark.fillStyle = fade;
    dark.fillRect(cx - r, cy - r, r * 2, r * 2);
    dark.restore();
  }

  // Coloured glow first, so the darkness on top dims it near the edges too
  for (const light of lights) {
    const cx = light.x * g;
    const cy = light.y * g;
    const r = light.radius * g;
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, rgba(light.color, 0.4 * light.intensity));
    glow.addColorStop(1, rgba(light.color, 0));
    ctx.save();
    clipTo(ctx, lightShape(map, light));
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
  }

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(darkCanvas, 0, 0);
  ctx.restore();
}

/**
 * Small sun icons where placed lights are, for the editor only (exports
 * show just the light). Sized in screen pixels whatever the zoom.
 */
export function renderLightMarkers(ctx: CanvasRenderingContext2D, map: MapData, zoom: number, ink: string) {
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
