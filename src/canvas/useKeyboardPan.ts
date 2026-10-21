import { useEffect, useRef } from 'react';
import type React from 'react';
import type { ViewportTransform } from '../types/map';
import { ARROW_DIRECTIONS, focusUsesArrows } from '../core/keyboard';

// Screen pixels per second while an arrow key is held, faster with Shift
const PAN_SPEED = 700;
const FAST_PAN_SPEED = 2100;

/**
 * Arrow keys pan the map smoothly for as long as they are held; the view
 * moves the way the arrow points. Several arrows at once pan diagonally.
 * While `paused` (a selection is being edited) arrows are left to the app,
 * which nudges the selected object instead.
 */
export function useKeyboardPan(
  onViewportChange: React.Dispatch<React.SetStateAction<ViewportTransform>>,
  paused: boolean
) {
  const pausedRef = useRef(paused);
  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

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
        dx += ARROW_DIRECTIONS[key][0];
        dy += ARROW_DIRECTIONS[key][1];
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
      if (!(e.key in ARROW_DIRECTIONS) || e.ctrlKey || e.metaKey || e.altKey || focusUsesArrows()) return;
      if (pausedRef.current) return;
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
