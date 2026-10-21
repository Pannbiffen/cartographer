import { useEffect } from 'react';
import type React from 'react';
import type { ViewportTransform } from '../types/map';

// Screen pixels per second while an arrow key is held, faster with Shift
const PAN_SPEED = 700;
const FAST_PAN_SPEED = 2100;

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** Form controls handle arrow keys themselves (sliders, selects, radios) */
function focusUsesArrows(): boolean {
  const el = document.activeElement;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/**
 * Arrow keys pan the map smoothly for as long as they are held; the view
 * moves the way the arrow points. Several arrows at once pan diagonally.
 */
export function useKeyboardPan(
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportTransform>>
) {
  useEffect(() => {
    const held = new Set<string>();
    let fast = false;
    let frame = 0;
    let lastTime = 0;

    const step = (time: number) => {
      const dt = Math.min(0.05, (time - lastTime) / 1000);
      lastTime = time;
      let dx = 0;
      let dy = 0;
      for (const key of held) {
        dx += DIRECTIONS[key][0];
        dy += DIRECTIONS[key][1];
      }
      const length = Math.hypot(dx, dy);
      if (length > 0) {
        const distance = ((fast ? FAST_PAN_SPEED : PAN_SPEED) * dt) / length;
        onViewportChange((v) => ({ ...v, x: v.x - dx * distance, y: v.y - dy * distance }));
      }
      frame = held.size > 0 ? requestAnimationFrame(step) : 0;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      if (!(e.key in DIRECTIONS) || e.ctrlKey || e.metaKey || e.altKey || focusUsesArrows()) return;
      // Stop the page or a scrollable panel scrolling too
      e.preventDefault();
      held.add(e.key);
      if (!frame) {
        lastTime = performance.now();
        frame = requestAnimationFrame(step);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      fast = e.shiftKey;
      held.delete(e.key);
    };
    const stopAll = () => held.clear();

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', stopAll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', stopAll);
      cancelAnimationFrame(frame);
    };
  }, [onViewportChange]);
}
