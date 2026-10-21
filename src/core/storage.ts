// Everything Cartographer keeps in this browser lives under this prefix
const KEY_PREFIX = 'cartographer.';

// Set once local data is wiped, so nothing is written back before the reload
let cleared = false;

/** Reads a stored JSON value, or null if missing, unreadable or unavailable */
export function readStored(key: string): unknown {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable or full */
export function writeStored(key: string, value: unknown): boolean {
  return writeStoredJson(key, JSON.stringify(value));
}

/** Stores text that is already JSON; returns false when storage is unavailable or full */
export function writeStoredJson(key: string, json: string): boolean {
  if (cleared) return false;
  try {
    localStorage.setItem(KEY_PREFIX + key, json);
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key: string) {
  try {
    localStorage.removeItem(KEY_PREFIX + key);
  } catch {
    // Storage unavailable: nothing to remove
  }
}

/** Deletes preferences, the maps kept in this browser and anything else stored locally */
export function clearLocalData() {
  cleared = true;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(KEY_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable: nothing to clear
  }
}
