// Named looks (theme, walls, hatching, grid) kept in this browser and shared as files
import type { MapData } from '../types/map';
import { readStored, writeStored } from './storage';
import { DEFAULT_NEW_MAP, NEW_MAP_KEYS, type NewMapDefaults } from './newMap';

export interface StylePreset {
  id: string;
  name: string;
  look: NewMapDefaults;
}

const PRESETS_KEY = 'presets.v1';
const FILE_KIND = 'cartographer-style-presets';

export const MAX_PRESET_NAME = 40;

const THEMES = ['parchment', 'blueprint', 'slate', 'monochrome'];
const WALL_STYLES = ['bold', 'fine', 'rough'];
const HATCH_STYLES = ['dyson', 'crosshatch', 'stipple', 'shadow', 'none'];
const GRID_TYPES = ['square', 'hex-pointy', 'hex-flat'];

const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const oneOf = <T extends string>(v: unknown, allowed: string[], fallback: T) =>
  (typeof v === 'string' && allowed.includes(v) ? v : fallback) as T;

/** A look from untrusted data (a shared file or storage): bad fields fall back to the defaults */
function cleanLook(raw: unknown): NewMapDefaults {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_NEW_MAP;
  return {
    theme: oneOf(r.theme, THEMES, d.theme),
    wallStyle: oneOf(r.wallStyle, WALL_STYLES, d.wallStyle),
    hatchStyle: oneOf(r.hatchStyle, HATCH_STYLES, d.hatchStyle),
    hatchLength: num(r.hatchLength, 6, 24, d.hatchLength),
    hatchDensity: num(r.hatchDensity, 1, 5, d.hatchDensity),
    gridType: oneOf(r.gridType, GRID_TYPES, d.gridType),
    showGrid: typeof r.showGrid === 'boolean' ? r.showGrid : d.showGrid,
    gridOpacity: num(r.gridOpacity, 0.05, 0.8, d.gridOpacity),
  };
}

function cleanPresets(raw: unknown): StylePreset[] {
  if (!Array.isArray(raw)) return [];
  const presets: StylePreset[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_PRESET_NAME) : '';
    if (!name) continue;
    presets.push({ id: newPresetId(), name, look: cleanLook(item.look) });
  }
  return presets;
}

function newPresetId(): string {
  return `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function loadPresets(): StylePreset[] {
  return cleanPresets(readStored(PRESETS_KEY));
}

/** Returns false when the browser could not keep them */
export function savePresets(presets: StylePreset[]): boolean {
  return writeStored(PRESETS_KEY, presets);
}

/** Adds a preset, or replaces the one with the same name (ignoring case) */
export function upsertPreset(presets: StylePreset[], name: string, look: NewMapDefaults): StylePreset[] {
  const clean = name.trim().slice(0, MAX_PRESET_NAME);
  const same = (p: StylePreset) => p.name.toLowerCase() === clean.toLowerCase();
  const existing = presets.find(same);
  if (existing) return presets.map((p) => (p === existing ? { ...p, look } : p));
  return [...presets, { id: newPresetId(), name: clean, look }];
}

/** Copies a preset's look onto a map being edited */
export function applyLook(draft: MapData, look: NewMapDefaults) {
  for (const key of NEW_MAP_KEYS) (draft as unknown as Record<string, unknown>)[key] = look[key];
}

export function presetsToJson(presets: StylePreset[]): string {
  return JSON.stringify(
    { kind: FILE_KIND, version: 1, presets: presets.map(({ name, look }) => ({ name, look })) },
    null,
    2,
  );
}

/** Presets from a shared file; null if the file is not a presets file */
export function presetsFromJson(text: string): StylePreset[] | null {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || parsed.kind !== FILE_KIND) return null;
    return cleanPresets(parsed.presets);
  } catch {
    return null;
  }
}

/** Adds imported presets; one whose name is already taken replaces the old look */
export function mergePresets(presets: StylePreset[], imported: StylePreset[]): StylePreset[] {
  return imported.reduce((all, p) => upsertPreset(all, p.name, p.look), presets);
}
