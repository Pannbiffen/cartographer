// Light sources: placed lights plus the torches that double as lights
import type { LightSettings, MapData } from '../types/map';
import { visibleLayers } from './layers';

export const DEFAULT_LIGHT: LightSettings = { color: '#ffe2a8', radius: 5, intensity: 1 };
export const TORCH_LIGHT: LightSettings = { color: '#ff9a3c', radius: 4, intensity: 0.9 };

export const LIGHT_RADIUS_RANGE = { min: 1, max: 15 };

/** A light in grid units at the centre of its cell */
export interface MapLight extends LightSettings {
  x: number;
  y: number;
}

/** Every light on the shown layers, torches included */
export function mapLights(map: MapData): MapLight[] {
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

/** The floor of every shown layer together, which is what blocks light */
export function combinedRooms(map: MapData): { [key: string]: boolean } {
  return Object.assign({}, ...visibleLayers(map).map((l) => l.rooms));
}
