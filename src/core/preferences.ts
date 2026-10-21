// Per-user settings, kept in this browser and separate from any map
import { readStored, writeStored } from './storage';
import type { ZoomSpeed } from './viewport';

export type UiTheme = 'dark' | 'light' | 'system';
export type AccentColor = 'blue' | 'green' | 'orange' | 'purple';
export type UiSize = 'small' | 'normal' | 'large';

export interface Preferences {
  uiTheme: UiTheme;
  accent: AccentColor;
  uiSize: UiSize;
  autosave: boolean;
  showPanel: boolean;
  zoomSpeed: ZoomSpeed;
}

// index.html reads the same key and defaults to avoid a flash of the wrong theme
const PREFERENCES_KEY = 'preferences.v1';

export const DEFAULT_PREFERENCES: Preferences = {
  uiTheme: 'dark',
  accent: 'blue',
  uiSize: 'normal',
  autosave: true,
  showPanel: true,
  zoomSpeed: 'normal',
};

export function loadPreferences(): Preferences {
  const stored = readStored(PREFERENCES_KEY);
  return { ...DEFAULT_PREFERENCES, ...(stored && typeof stored === 'object' ? stored : {}) };
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
