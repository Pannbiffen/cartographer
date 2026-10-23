// Light sources: placed lights plus the torches that double as lights, and
// the windows they shine through
import type { LightSettings, LevelMap, PlacedWindow } from '../types/map';
import { visibleLayers } from './layers';

export const DEFAULT_LIGHT: LightSettings = { color: '#ffe2a8', radius: 5, intensity: 1 };
export const TORCH_LIGHT: LightSettings = { color: '#ff9a3c', radius: 4, intensity: 0.9 };

export const DEFAULT_WINDOW: Pick<PlacedWindow, 'tint' | 'clarity'> = { tint: '#cfe8ff', clarity: 0.8 };

export const LIGHT_RADIUS_RANGE = { min: 1, max: 15 };

/** A light in grid units at the centre of its cell */
export interface MapLight extends LightSettings {
  x: number;
  y: number;
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
