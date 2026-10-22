import React, { useState } from 'react';
import { Dialog } from './Dialog';
import { BUTTON_CLASS } from './options';

interface UnsavedChangesDialogProps {
  // What is about to replace the map, e.g. "Start a new map"
  action: string;
  mapTitle: string;
  // Autosave is on, so the map stays in My Maps either way
  keptInBrowser: boolean;
  // remember: skip this dialog from now on with the same answer
  onSaveFirst: (remember: boolean) => void;
  onDiscard: (remember: boolean) => void;
  onCancel: () => void;
}

// Asked before something replaces a map that has changes not saved to a file
export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  action,
  mapTitle,
  keptInBrowser,
  onSaveFirst,
  onDiscard,
  onCancel,
}) => {
  const [remember, setRemember] = useState(false);
  return (
    <Dialog title={`${action}?`} onClose={onCancel}>
      <p className="leading-snug">
        <strong>“{mapTitle || 'Untitled map'}” has changes that are not saved to a file.</strong>{' '}
        {keptInBrowser
          ? 'It stays in File > My Maps in this browser, but only a .dndmap file is safe from clearing browser data.'
          : 'Autosave is off, so save a .dndmap file first to keep them.'}
      </p>
      <div className="flex items-center justify-end gap-2">
        <label className="mr-auto flex items-center gap-2">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="accent-ui-accent"
          />
          Remember my choice
        </label>
        <button onClick={onCancel} className={BUTTON_CLASS}>
          Cancel
        </button>
        <button
          onClick={() => onDiscard(remember)}
          className={`${BUTTON_CLASS} ${keptInBrowser ? '' : 'text-ui-danger'}`}
        >
          Don’t save
        </button>
        <button autoFocus onClick={() => onSaveFirst(remember)} className={BUTTON_CLASS}>
          Save first
        </button>
      </div>
      {remember && <p className="text-ui-muted">Change it later in Edit &gt; Preferences.</p>}
    </Dialog>
  );
};
