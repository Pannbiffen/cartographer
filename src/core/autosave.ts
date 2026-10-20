// Browser-local autosave: the current map survives reloads with no account
import type { MapData } from '../types/map';
import { readStored, removeStored, writeStored } from './storage';

const AUTOSAVE_KEY = 'autosave.v1';

/** The last autosaved map as parsed JSON, or null if none / unreadable */
export function loadAutosave(): Partial<MapData> | null {
  const parsed = readStored(AUTOSAVE_KEY) as Partial<MapData> | null;
  return parsed && typeof parsed.rooms === 'object' ? parsed : null;
}

/** Returns false when storage is unavailable or full */
export function saveAutosave(map: MapData): boolean {
  return writeStored(AUTOSAVE_KEY, map);
}

export function clearAutosave() {
  removeStored(AUTOSAVE_KEY);
}
