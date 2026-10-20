// Browser-local autosave: the current map survives reloads with no account
import type { MapData } from '../types/map';

const AUTOSAVE_KEY = 'cartographer.autosave.v1';

/** The last autosaved map as parsed JSON, or null if none / unreadable */
export function loadAutosave(): Partial<MapData> | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.rooms === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable or full */
export function saveAutosave(map: MapData): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(map));
    return true;
  } catch {
    return false;
  }
}
