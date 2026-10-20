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
