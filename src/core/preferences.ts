// Per-user settings, kept in this browser and separate from any map
import { readStored, writeStored } from './storage';
import type { ZoomSpeed } from './viewport';
import { DEFAULT_NEW_MAP, type NewMapDefaults } from './newMap';

export type UiTheme = 'dark' | 'light' | 'system';
export type AccentColor = 'blue' | 'green' | 'orange' | 'purple';
export type UiSize = 'small' | 'normal' | 'large';
// What replacing a map with changes not saved to a file does: ask, rely on
// the copy in My Maps, or download the file first
export type UnsavedChoice = 'ask' | 'browser' | 'download';

export interface Preferences {
  uiTheme: UiTheme;
  accent: AccentColor;
  uiSize: UiSize;
  autosave: boolean;
  unsavedChanges: UnsavedChoice;
  showPanel: boolean;
  showMapSettings: boolean;
  // Draw the level before the active one faintly underneath it
  showLevelBelow: boolean;
  // How strongly it shows through, 0 to 1
  levelBelowOpacity: number;
  // Show further levels down too, each this much fainter than the one above
  showLevelsFurtherBelow: boolean;
  levelBelowFade: number;
  zoomSpeed: ZoomSpeed;
  // The look File > New starts a map with
  newMap: NewMapDefaults;
}

// index.html reads the same key and defaults to avoid a flash of the wrong theme
const PREFERENCES_KEY = 'preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = {
  uiTheme: 'dark',
  accent: 'blue',
  uiSize: 'normal',
  autosave: true,
  unsavedChanges: 'ask',
  showPanel: true,
  showMapSettings: false,
  showLevelBelow: false,
  levelBelowOpacity: 0.3,
  showLevelsFurtherBelow: false,
  levelBelowFade: 0.1,
  zoomSpeed: 'normal',
  newMap: DEFAULT_NEW_MAP,
};

export function loadPreferences(): Preferences {
  const raw = readStored(PREFERENCES_KEY);
  const stored: Partial<Preferences> = raw && typeof raw === 'object' ? raw : {};
  // Settings added later fall back to their defaults
  return {
    ...DEFAULT_PREFERENCES,
    ...stored,
    newMap: { ...DEFAULT_NEW_MAP, ...stored.newMap },
  };
}

export function savePreferences(prefs: Preferences) {
  writeStored(PREFERENCES_KEY, prefs);
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

/** Applies theme, accent and size to the page; follows the OS for 'system' */
export function applyPreferences(prefs: Preferences): () => void {
  const root = document.documentElement;
  const applyTheme = () => {
    const dark = prefs.uiTheme === 'system' ? darkQuery().matches : prefs.uiTheme === 'dark';
    root.dataset.uiTheme = dark ? 'dark' : 'light';
  };
  applyTheme();
  root.dataset.accent = prefs.accent;
  root.dataset.uiSize = prefs.uiSize;

  if (prefs.uiTheme !== 'system') return () => {};
  const query = darkQuery();
  query.addEventListener('change', applyTheme);
  return () => query.removeEventListener('change', applyTheme);
}
