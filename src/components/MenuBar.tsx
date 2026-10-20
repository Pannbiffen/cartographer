import React, { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';

export type MenuItem =
  | {
      label: string;
      onSelect: () => void;
      shortcut?: string;
      disabled?: boolean;
      // Shown with a check mark when true, an empty slot when false
      checked?: boolean;
    }
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
                {menu.items.map((item, j) =>
                  item === 'separator' ? (
                    <div key={j} role="separator" className="my-1 border-t border-ui-border" />
                  ) : (
                    <button
                      key={item.label}
                      role={item.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={item.checked}
                      disabled={item.disabled}
                      onClick={() => {
                        setOpenIndex(null);
                        item.onSelect();
                      }}
                      className="group flex w-full items-center gap-2 px-2 py-1 text-left text-ui-text enabled:hover:bg-ui-accent enabled:hover:text-white disabled:text-ui-muted/60"
                    >
                      <span className="w-4 flex justify-center">
                        {item.checked && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="flex-1 whitespace-nowrap">{item.label}</span>
                      {item.shortcut && (
                        <span className="pl-6 text-ui-muted group-enabled:group-hover:text-white/85 whitespace-nowrap">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
};
