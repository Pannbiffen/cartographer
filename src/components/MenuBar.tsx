import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { menuShortcut } from '../core/keyboard';

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      shortcut?: string;
      // Shown instead of `shortcut` on a Mac, where the convention differs
      macShortcut?: string;
      disabled?: boolean;
      // Shown with a check mark when true, an empty slot when false
      checked?: boolean;
    }
  // Opens to the side on hover or click
  | { label: string; submenu: MenuItem[]; disabled?: boolean }
  | 'separator';

export interface Menu {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  menus: Menu[];
}

// Classic desktop menu bar: click a title to open its menu, then hover
// along the bar to switch menus. Clicking elsewhere or Escape closes it.
export const MenuBar: React.FC<MenuBarProps> = ({ menus }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (openIndex === null) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (!barRef.current?.contains(e.target as Node)) setOpenIndex(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Close the menu without also clearing the map selection
        e.stopImmediatePropagation();
        setOpenIndex(null);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [openIndex]);

  return (
    <nav ref={barRef} role="menubar" className="flex h-6 items-stretch bg-ui border-b border-ui-border px-1">
      {menus.map((menu, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={menu.label} className="relative flex">
            <button
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={isOpen}
              onClick={() => setOpenIndex(isOpen ? null : i)}
              onPointerEnter={() => openIndex !== null && setOpenIndex(i)}
              className={`px-2.5 ${isOpen ? 'bg-ui-accent text-white' : 'text-ui-text hover:bg-ui-sunken'}`}
            >
              {menu.label}
            </button>
            {isOpen && (
              <div
                role="menu"
                aria-label={menu.label}
                className="absolute left-0 top-full z-50 min-w-56 py-1 bg-ui-raised border border-ui-border shadow-md"
              >
                <MenuItems items={menu.items} onDone={() => setOpenIndex(null)} />
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};

const ITEM_CLASS =
  'group flex w-full items-center gap-2 px-2 py-1 text-left text-ui-text enabled:hover:bg-ui-accent enabled:hover:text-white disabled:text-ui-muted/60';

// The items of one open menu or submenu; onDone closes the whole menu
export const MenuItems: React.FC<{ items: MenuItem[]; onDone: () => void }> = ({ items, onDone }) => {
  const [openSubmenu, setOpenSubmenu] = useState<number | null>(null);
  return items.map((item, j) => {
    if (item === 'separator') return <div key={j} role="separator" className="my-1 border-t border-ui-border" />;
    if ('submenu' in item) {
      const isOpen = openSubmenu === j && !item.disabled;
      return (
        <div key={j} className="relative" onPointerEnter={() => setOpenSubmenu(j)}>
          <button
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            disabled={item.disabled}
            onClick={() => setOpenSubmenu(isOpen ? null : j)}
            className={`${ITEM_CLASS} ${isOpen ? 'bg-ui-accent text-white' : ''}`}
          >
            <span className="w-4" />
            <span className="flex-1 whitespace-nowrap">{item.label}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          {isOpen && (
            <div
              role="menu"
              aria-label={item.label}
              className="absolute left-full -top-1 z-50 min-w-48 max-w-80 py-1 bg-ui-raised border border-ui-border shadow-md"
            >
              <MenuItems items={item.submenu} onDone={onDone} />
            </div>
          )}
        </div>
      );
    }
    return (
      <button
        key={j}
        role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
        aria-checked={item.checked}
        disabled={item.disabled}
        onPointerEnter={() => setOpenSubmenu(null)}
        onClick={() => {
          onDone();
          item.onSelect();
        }}
        className={ITEM_CLASS}
      >
        <span className="w-4 flex justify-center">{item.checked && <Check className="w-3.5 h-3.5" />}</span>
        <span className="flex-1 truncate whitespace-nowrap">{item.label}</span>
        {item.shortcut && (
          <span className="pl-6 text-ui-muted group-enabled:group-hover:text-white/85 whitespace-nowrap">
            {menuShortcut(item.shortcut, item.macShortcut)}
          </span>
        )}
      </button>
    );
  });
};
