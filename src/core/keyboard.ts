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
