import React from 'react';
import { Dialog } from './Dialog';
import { BUTTON_CLASS } from './options';

export interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  // The button that goes ahead, e.g. "Replace layer"
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Asked before an edit that wipes content; it can still be undone, so the
// button that goes ahead starts focused
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ title, message, confirmLabel, onConfirm, onCancel }) => (
  <Dialog title={title} onClose={onCancel}>
    <p className="leading-snug">{message}</p>
    <div className="flex items-center justify-end gap-2">
      <button onClick={onCancel} className={BUTTON_CLASS}>
        Cancel
      </button>
      <button autoFocus onClick={onConfirm} className={`${BUTTON_CLASS} text-ui-danger`}>
        {confirmLabel}
      </button>
    </div>
  </Dialog>
);
