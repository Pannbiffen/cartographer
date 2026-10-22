import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MenuItems, type MenuItem } from './MenuBar';

interface ContextMenuProps {
  // Screen position of the top-left corner; the menu is kept on screen
  x: number;
  y: number;
  label: string;
  items: MenuItem[];
  // Focus the first item, when opened from the keyboard
  autoFocus?: boolean;
  onClose: () => void;
}

// A pop-up menu at a point, e.g. on right-click. Clicking elsewhere, Escape,
// resizing or leaving the window closes it. Up/Down move between items.
export const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, label, items, autoFocus = false, onClose }) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPosition({
      left: Math.max(0, Math.min(x, window.innerWidth - width)),
      top: Math.max(0, Math.min(y, window.innerHeight - height)),
    });
    if (autoFocus) menu.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)')?.focus();
  }, [x, y, autoFocus]);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      // A click on the map only closes the menu, rather than also drawing there
      if (e.target instanceof HTMLCanvasElement) e.stopPropagation();
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close the menu without also clearing the map selection
        e.stopImmediatePropagation();
        onClose();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        // Move between this menu's items rather than nudging or panning the map
        e.preventDefault();
        e.stopImmediatePropagation();
        const menu = document.activeElement?.closest('[role="menu"]') ?? menuRef.current;
        if (!menu) return;
        const enabled = [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)')].filter(
          (item) => item.closest('[role="menu"]') === menu
        );
        if (!enabled.length) return;
        const i = enabled.indexOf(document.activeElement as HTMLElement);
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        enabled[(next + enabled.length) % enabled.length].focus();
      }
    };
    window.addEventListener('pointerdown', handlePointerDown, { capture: true });
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('resize', onClose);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true });
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('resize', onClose);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      style={position}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-48 py-1 bg-ui-raised border border-ui-border shadow-md text-ui-text"
    >
      <MenuItems items={items} onDone={onClose} />
    </div>
  );
};
