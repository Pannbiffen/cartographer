// Light sources: placed lights plus the torches that double as lights, the
// windows they shine through, and lava, which lights itself and its shores
import type { LightSettings, LevelMap, MapLayer, PlacedWindow } from '../types/map';
import { visibleLayers } from './layers';
import { hasWater, layerWater, pointInPolygons, polygonBounds } from './geometry/region';

export const DEFAULT_LIGHT: LightSettings = { color: '#ffe2a8', radius: 5, intensity: 1 };
export const TORCH_LIGHT: LightSettings = { color: '#ff9a3c', radius: 4, intensity: 0.9 };

// Each cell along lava's edge glows dimly a short way past it
export const LAVA_GLOW: LightSettings = { color: '#ff5a14', radius: 2.5, intensity: 0.18 };

export const DEFAULT_WINDOW: Pick<PlacedWindow, 'tint' | 'clarity'> = { tint: '#cfe8ff', clarity: 0.8 };

export const LIGHT_RADIUS_RANGE = { min: 1, max: 15 };

/** A light in grid units at the centre of its cell */
export interface MapLight extends LightSettings {
  x: number;
  y: number;
  glow?: number; // how strongly it tints what it lights, from 0; missing: 0.4
}

/** Every light on the shown layers, torches included */
export function mapLights(map: LevelMap): MapLight[] {
  const lights: MapLight[] = [];
  for (const layer of visibleLayers(map)) {
    for (const l of layer.lights) {
      lights.push({ ...l, x: l.x + 0.5, y: l.y + 0.5 });
    }
    for (const p of layer.props) {
      if (p.type === 'torch') lights.push({ ...(p.light ?? TORCH_LIGHT), x: p.x + 0.5, y: p.y + 0.5 });
    }
  }
  return lights;
}

/** Every window on the shown layers that lets any light through */
export function mapWindows(map: LevelMap): PlacedWindow[] {
  return visibleLayers(map).flatMap((layer) => layer.windows.filter((w) => w.clarity > 0));
}

const lavaCaches = new WeakMap<MapLayer[], MapLight[]>();

/**
 * The glow off the lava on the shown layers: a dim light at the centre of
 * each lava cell (or cell whose centre free-form lava covers) beside one without
 */
export function lavaLights(map: LevelMap): MapLight[] {
  const cached = lavaCaches.get(map.layers);
  if (cached) return cached;
  const lava = new Set<string>();
  for (const layer of visibleLayers(map)) {
    if (!hasWater(layer, 'lava')) continue;
    if (layer.lavaAreas.length === 0) {
      for (const key of Object.keys(layer.lava)) lava.add(key);
      continue;
    }
    const outline = layerWater(layer, 'lava');
    const b = polygonBounds(outline);
    for (let x = Math.floor(b.minX); x < Math.ceil(b.maxX); x++) {
      for (let y = Math.floor(b.minY); y < Math.ceil(b.maxY); y++) {
        if (pointInPolygons(outline, x + 0.5, y + 0.5)) lava.add(`${x},${y}`);
      }
    }
  }
  const lights: MapLight[] = [];
  for (const key of lava) {
    const [x, y] = key.split(',').map(Number);
    const shore = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !lava.has(`${x + dx},${y + dy}`));
    // Coloured more strongly than other light, as it lifts little darkness
    if (shore) lights.push({ ...LAVA_GLOW, x: x + 0.5, y: y + 0.5, glow: 1.5 });
  }
  lavaCaches.set(map.layers, lights);
  return lights;
}
