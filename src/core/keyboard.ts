// Keyboard helpers shared by the app-level shortcuts and the canvas

const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button', 'color', 'file']);

/**
 * True while focus is in a field that consumes typed characters. Sliders and
 * checkboxes don't count, so shortcuts keep working after using them.
 */
export function isTypingInField(): boolean {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(el.type);
  return el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

/** Form controls handle arrow keys themselves (sliders, selects, radios) */
export function focusUsesArrows(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Unit steps for the arrow keys, with y pointing down the screen */
export const ARROW_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Macs label shortcuts with Cmd and Option, and the app accepts Cmd for Ctrl */
export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

// Mac modifier symbols, in the order macOS lists them
const MAC_MODIFIERS: [string, string][] = [
  ['Alt', '⌥'],
  ['Shift', '⇧'],
  ['Ctrl', '⌘'],
];

/** The label to show for a menu item: its Mac-specific one on a Mac, when it has one */
export function menuShortcut(shortcut: string, macShortcut: string | undefined, mac = IS_MAC): string {
  return formatShortcut(mac && macShortcut ? macShortcut : shortcut, mac);
}

/**
 * A shortcut label as written in the menus ("Ctrl+Alt+N", "Shift + arrows")
 * for this platform: unchanged elsewhere, "⌥⌘N" and "⇧ + arrows" on a Mac.
 */
export function formatShortcut(shortcut: string, mac = IS_MAC): string {
  if (!mac) return shortcut;
  // Chords without spaces become a run of symbols, like macOS menus
  if (!shortcut.includes(' ') && shortcut.length > 1 && shortcut.includes('+')) {
    const parts = shortcut.split('+');
    const key = parts.pop() || '+';
    const symbols = MAC_MODIFIERS.filter(([name]) => parts.includes(name)).map(([, symbol]) => symbol);
    return symbols.join('') + key;
  }
  return MAC_MODIFIERS.reduce((s, [name, symbol]) => s.replace(new RegExp(`\\b${name}\\b`), symbol), shortcut);
}
