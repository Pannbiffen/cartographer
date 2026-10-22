import React from 'react';
import { Dialog, DialogGroup } from './Dialog';
import type { Menu } from './MenuBar';
import { IS_MAC, formatShortcut } from '../core/keyboard';

// Keys that only work on the map, so no menu item lists them
const CANVAS_SHORTCUTS: [string, string][] = [
  ['Pan', 'Space + drag'],
  ['Pan', 'Alt + drag'],
  ['Pan', 'Middle drag'],
  ['Pan', 'Arrows'],
  ['Pan faster', 'Shift + arrows'],
  ['Zoom', 'Wheel'],
  ['Take linked stairs to their level', 'Double-click'],
  ['Menu for the object or spot', 'Right-click'],
  ['Menu for the selection', 'Shift + F10'],
  ['Nudge selection', 'Arrows'],
  ['Nudge a label a whole cell', 'Shift + arrows'],
  ['Clear selection, close dialog', 'Esc'],
  ['Finish polygon or path', 'Enter'],
  ['Remove last point', 'Backspace'],
  ['Cancel polygon or path', 'Esc'],
];

interface ShortcutsDialogProps {
  menus: Menu[];
  onClose: () => void;
}

const ShortcutList: React.FC<{ rows: [string, string][] }> = ({ rows }) => (
  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5">
    {rows.map(([action, keys], i) => (
      <React.Fragment key={i}>
        <dt>{action}</dt>
        <dd className="text-ui-muted text-right whitespace-nowrap">{formatShortcut(keys)}</dd>
      </React.Fragment>
    ))}
  </dl>
);

// Every shortcut, read from the menus so the list can't drift from them
export const ShortcutsDialog: React.FC<ShortcutsDialogProps> = ({ menus, onClose }) => {
  const groups = menus
    .map((menu) => ({
      title: menu.label,
      rows: menu.items.flatMap((item): [string, string][] =>
        item !== 'separator' && 'shortcut' in item && item.shortcut
          ? [[item.label.replace(/…$/, ''), IS_MAC && item.macShortcut ? item.macShortcut : item.shortcut]]
          : []
      ),
    }))
    .filter((g) => g.rows.length > 0);

  return (
    <Dialog title="Keyboard Shortcuts" onClose={onClose} wide>
      <div className="sm:columns-2 gap-3">
        {[{ title: 'Map', rows: CANVAS_SHORTCUTS }, ...groups].map((g) => (
          <div key={g.title} className="break-inside-avoid mb-3 last:mb-0">
            <DialogGroup title={g.title}>
              <ShortcutList rows={g.rows} />
            </DialogGroup>
          </div>
        ))}
      </div>
    </Dialog>
  );
};
