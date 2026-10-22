import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

// Close callbacks of the open dialogs, the most recently opened last
const openDialogs: React.RefObject<() => void>[] = [];

// Escape closes the top dialog before anything else on the page sees the key
function handleEscape(e: KeyboardEvent) {
  const top = openDialogs[openDialogs.length - 1];
  if (e.key !== 'Escape' || !top) return;
  e.preventDefault();
  e.stopPropagation();
  top.current();
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Tab and Shift+Tab wrap around inside the dialog instead of leaving it
function keepTabInside(e: React.KeyboardEvent, panel: HTMLElement) {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const wrapTo = !first
    ? panel
    : e.shiftKey
      ? (active === first || active === panel) && last
      : (active === last || !panel.contains(active)) && first;
  if (!wrapTo) return;
  e.preventDefault();
  wrapTo.focus();
}

interface DialogProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // Room for two columns of content
  wide?: boolean;
}

// A modal window with a title bar; clicking outside it or Escape closes it
export const Dialog: React.FC<DialogProps> = ({ title, onClose, children, wide }) => {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  // Focus moves into the dialog (unless a field in it took it with
  // autoFocus) and goes back where it was when the dialog closes. The element
  // to return to is read while rendering, before autoFocus moves focus.
  const panelRef = useRef<HTMLDivElement>(null);
  const [previous] = useState(() => document.activeElement as HTMLElement | null);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      // StrictMode's trial unmount leaves the dialog in the page
      if (!panel?.isConnected && previous?.isConnected) previous.focus();
    };
  }, [previous]);
  useEffect(() => {
    openDialogs.push(closeRef);
    if (openDialogs.length === 1) window.addEventListener('keydown', handleEscape, true);
    return () => {
      openDialogs.splice(openDialogs.indexOf(closeRef), 1);
      if (openDialogs.length === 0) window.removeEventListener('keydown', handleEscape, true);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
      onKeyDown={(e) => panelRef.current && keepTabInside(e, panelRef.current)}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`w-full outline-none ${wide ? 'max-w-[48rem]' : 'max-w-[34rem]'} max-h-full overflow-y-auto bg-ui border border-ui-border shadow-xl text-ui-text`}
      >
        <div className="flex items-center justify-between h-7 pl-3 pr-1 bg-ui-sunken border-b border-ui-border">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-sm hover:bg-ui-hover">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
};

// A titled group of controls inside a dialog
export const DialogGroup: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <fieldset className="border border-ui-border px-3 pb-3 pt-1 flex flex-col gap-2">
    <legend className="px-1 font-semibold">{title}</legend>
    {children}
  </fieldset>
);
