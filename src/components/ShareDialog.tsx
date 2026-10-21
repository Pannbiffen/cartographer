import React, { useEffect, useState } from 'react';
import type { MapData } from '../types/map';
import { LONG_LINK_CHARS, createShareLink } from '../core/share';
import { Dialog } from './Dialog';
import { BUTTON_CLASS, FIELD_CLASS } from './options';

interface ShareDialogProps {
  mapData: MapData;
  onClose: () => void;
}

// A link that carries a copy of the map, ready to paste into a chat
export const ShareDialog: React.FC<ShareDialogProps> = ({ mapData, onClose }) => {
  const [link, setLink] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let current = true;
    createShareLink(mapData).then(
      (url) => current && setLink(url),
      () => current && setFailed(true)
    );
    return () => {
      current = false;
    };
  }, [mapData]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      // Clipboard blocked: leave the link selected to copy by hand
      (document.getElementById('share-link') as HTMLInputElement | null)?.select();
    }
  };

  return (
    <Dialog title="Share Link" onClose={onClose}>
      <p className="leading-snug">
        Anyone with this link can open a copy of “{mapData.title || 'Untitled map'}”, including hidden
        layers. Their changes don’t affect yours, and the map is stored in the link itself, not on a
        server.
      </p>
      {failed ? (
        <p role="alert" className="text-ui-danger">
          This browser can’t create share links. Save a .dndmap file and send that instead.
        </p>
      ) : (
        <div className="flex gap-2">
          <input
            id="share-link"
            aria-label="Share link"
            readOnly
            value={link ?? 'Creating link…'}
            onFocus={(e) => e.target.select()}
            className={`${FIELD_CLASS} flex-1 min-w-0`}
          />
          <button onClick={copy} disabled={!link} className={`${BUTTON_CLASS} shrink-0`}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
      )}
      {link && link.length > LONG_LINK_CHARS && (
        <p className="text-ui-muted leading-snug">
          This link is {link.length.toLocaleString()} characters long, which some chat apps cut off. If
          it doesn’t open, send a .dndmap file instead.
        </p>
      )}
      <div className="flex justify-end">
        <button onClick={onClose} className={BUTTON_CLASS}>
          Close
        </button>
      </div>
    </Dialog>
  );
};
