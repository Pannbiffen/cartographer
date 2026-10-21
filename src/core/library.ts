// My Maps: the maps kept in this browser. The open map is autosaved into its
// own entry, so New, Open or a share link no longer push the previous one out.
import type { MapData } from '../types/map';
import { readStored, removeStored, writeStored, writeStoredJson } from './storage';
import { isMapLike } from './layers';

export interface LibraryEntry {
  id: string;
  title: string;
  // Last stored (opened or changed), in ms since the epoch
  updatedAt: number;
  // Matches the .dndmap file (or share link) it was last saved to or opened from
  saved: boolean;
  // Size of the stored JSON, in characters
  size: number;
}

const INDEX_KEY = 'maps';
const CURRENT_KEY = 'maps.current';
const mapKey = (id: string) => `map.${id}`;
// Before My Maps the browser held only the open map, under this key
const LEGACY_AUTOSAVE_KEY = 'autosave.v1';

export function newMapId(): string {
  return crypto.randomUUID().slice(0, 12);
}

function isEntry(value: unknown): value is LibraryEntry {
  const v = value as Partial<LibraryEntry> | null;
  return !!v && typeof v.id === 'string' && typeof v.updatedAt === 'number';
}

/** The stored maps, most recently used first */
export function listMaps(): LibraryEntry[] {
  const index = readStored(INDEX_KEY);
  return Array.isArray(index) ? index.filter(isEntry).sort((a, b) => b.updatedAt - a.updatedAt) : [];
}

function writeIndex(entries: LibraryEntry[]): boolean {
  return writeStored(INDEX_KEY, entries);
}

/** A stored map as parsed JSON, or null if missing or unreadable */
export function loadMap(id: string): Partial<MapData> | null {
  const parsed = readStored(mapKey(id));
  return isMapLike(parsed) ? parsed : null;
}

/** Stores a map under its entry and makes it the one reopened on the next visit.
 * Returns false when storage is unavailable or full. */
export function storeMap(id: string, map: MapData, saved: boolean): boolean {
  const json = JSON.stringify(map);
  if (!writeStoredJson(mapKey(id), json)) return false;
  const entry: LibraryEntry = { id, title: map.title, updatedAt: Date.now(), saved, size: json.length };
  if (!writeIndex([entry, ...listMaps().filter((e) => e.id !== id)])) return false;
  return writeStored(CURRENT_KEY, id);
}

/** The entry to reopen on the next visit, or null to start with the starter map */
export function currentMapId(): string | null {
  const id = readStored(CURRENT_KEY);
  return typeof id === 'string' ? id : null;
}

/** Reopens a stored map on the next visit */
export function rememberCurrentMap(id: string) {
  writeStored(CURRENT_KEY, id);
}

/** Stops reopening the open map on the next visit; its entry stays in My Maps */
export function forgetCurrentMap() {
  removeStored(CURRENT_KEY);
}

function updateEntry(id: string, change: (map: Partial<MapData>) => void): boolean {
  const map = loadMap(id);
  const entry = listMaps().find((e) => e.id === id);
  if (!map || !entry) return false;
  change(map);
  const json = JSON.stringify(map);
  if (!writeStoredJson(mapKey(id), json)) return false;
  const changed = { ...entry, title: map.title ?? entry.title, saved: false, size: json.length };
  return writeIndex(listMaps().map((e) => (e.id === id ? changed : e)));
}

export function renameMap(id: string, title: string): boolean {
  return updateEntry(id, (map) => {
    map.title = title;
  });
}

/** Stores a copy of an entry as a new, most recent entry; returns its id */
export function duplicateMap(id: string, title: string): string | null {
  const map = loadMap(id);
  if (!map) return null;
  const copyId = newMapId();
  const json = JSON.stringify({ ...map, title });
  if (!writeStoredJson(mapKey(copyId), json)) return null;
  const entry: LibraryEntry = { id: copyId, title, updatedAt: Date.now(), saved: false, size: json.length };
  if (!writeIndex([entry, ...listMaps()])) {
    removeStored(mapKey(copyId));
    return null;
  }
  return copyId;
}

export function deleteMap(id: string) {
  writeIndex(listMaps().filter((e) => e.id !== id));
  removeStored(mapKey(id));
  if (currentMapId() === id) forgetCurrentMap();
}

/** Moves a map autosaved before My Maps existed into its own entry */
export function migrateLegacyAutosave() {
  const legacy = readStored(LEGACY_AUTOSAVE_KEY);
  if (isMapLike(legacy) && storeMap(newMapId(), legacy as MapData, false)) removeStored(LEGACY_AUTOSAVE_KEY);
}
