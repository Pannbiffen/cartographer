// The look a blank map starts with, chosen in Preferences
import type { MapData } from '../types/map';
import { newLevel, newLevelId } from './levels';

export type NewMapDefaults = Pick<
  MapData,
  | 'theme'
  | 'wallStyle'
  | 'hatchStyle'
  | 'hatchLength'
  | 'hatchDensity'
  | 'gridType'
  | 'showGrid'
  | 'gridOpacity'
  | 'background'
>;

export const NEW_MAP_KEYS: (keyof NewMapDefaults)[] = [
  'theme',
  'wallStyle',
  'hatchStyle',
  'hatchLength',
  'hatchDensity',
  'gridType',
  'showGrid',
  'gridOpacity',
  'background',
];

export const DEFAULT_NEW_MAP: NewMapDefaults = {
  theme: 'colour',
  wallStyle: 'rough',
  hatchStyle: 'dyson',
  hatchLength: 12,
  hatchDensity: 3,
  gridType: 'square',
  showGrid: true,
  gridOpacity: 0.22,
  background: 'grass',
};

/** The new-map settings of an existing map, e.g. to reuse its look */
export function mapLook(map: MapData): NewMapDefaults {
  return Object.fromEntries(NEW_MAP_KEYS.map((key) => [key, map[key]])) as unknown as NewMapDefaults;
}

/** An empty map with one level of one layer */
export function createBlankMap(defaults: NewMapDefaults): MapData {
  return {
    version: 4,
    title: 'Untitled map',
    gridSize: 40,
    ...DEFAULT_NEW_MAP,
    ...defaults,
    lighting: false,
    darkness: 0.75,
    levels: [newLevel(newLevelId(), 'Level 1')],
  };
}
