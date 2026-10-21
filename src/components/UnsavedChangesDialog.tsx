import React from 'react';
import { Dialog } from './Dialog';
import { BUTTON_CLASS } from './options';

interface UnsavedChangesDialogProps {
  // What is about to replace the map, e.g. "Start a new map"
  action: string;
  mapTitle: string;
  onSaveFirst: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

// Asked before something replaces a map that has changes not saved to a file
export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  action,
  mapTitle,
  onSaveFirst,
  onDiscard,
  onCancel,
}) => (
  <Dialog title={`${action}?`} onClose={onCancel}>
    <p className="leading-snug">
      <strong>“{mapTitle || 'Untitled map'}” has changes that are not saved to a file.</strong> Save a
      .dndmap file first to keep them; the autosave only holds the map that is open.
    </p>
    <div className="flex justify-end gap-2">
      <button onClick={onCancel} className={BUTTON_CLASS}>
        Cancel
      </button>
      <button onClick={onDiscard} className={`${BUTTON_CLASS} text-ui-danger`}>
        Don’t save
      </button>
      <button autoFocus onClick={onSaveFirst} className={BUTTON_CLASS}>
        Save first
      </button>
    </div>
  </Dialog>
);
