import React, { useMemo } from 'react';
import { FilePlus } from 'lucide-react';
import { Dialog } from './Dialog';
import { EXAMPLES, type ExampleMap } from '../core/examples';
import { levelView } from '../core/levels';
import { computeMapBounds, renderOffscreenMap } from '../core/export/imageExporter';

interface WelcomeDialogProps {
  showOnStart: boolean;
  onShowOnStartChange: (show: boolean) => void;
  onEmpty: () => void;
  onExample: (example: ExampleMap) => void;
  onClose: () => void;
}

const THUMB_WIDTH = 320; // pixels, twice the card width for sharp screens

/** A small picture of an example's first level, as a data URL */
function thumbnail(example: ExampleMap): string {
  const map = example.load();
  const view = levelView(map, map.levels[0]);
  const bounds = computeMapBounds(view, 1);
  const scale = THUMB_WIDTH / (bounds.width * view.gridSize);
  return renderOffscreenMap(view, bounds, scale).toDataURL();
}

const CARD_CLASS =
  'flex flex-col text-left rounded-sm border border-ui-border bg-ui-raised hover:border-ui-accent focus-visible:border-ui-accent overflow-hidden';

// Shown on a first visit and by File > New: start an empty map or open an example
export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ showOnStart, onShowOnStartChange, onEmpty, onExample, onClose }) => {
  // Drawn once when the dialog opens, so no images ship with the app
  const thumbnails = useMemo(() => EXAMPLES.map(thumbnail), []);

  return (
    <Dialog title="New map" onClose={onClose} wide>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button autoFocus onClick={onEmpty} className={CARD_CLASS}>
          <span className="aspect-[4/3] flex items-center justify-center text-ui-muted bg-ui-sunken">
            <FilePlus className="w-10 h-10" aria-hidden />
          </span>
          <span className="p-2">
            <span className="block font-medium">Empty map</span>
            <span className="block text-ui-muted">Your look from Preferences</span>
          </span>
        </button>
        {EXAMPLES.map((example, i) => (
          <button key={example.id} onClick={() => onExample(example)} className={CARD_CLASS}>
            <img src={thumbnails[i]} alt="" className="aspect-[4/3] w-full object-cover bg-ui-sunken" />
            <span className="p-2">
              <span className="block font-medium">{example.title}</span>
              <span className="block text-ui-muted">{example.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-ui-muted">Examples stay in File &gt; Examples.</p>
      <label className="mt-3 flex items-center gap-2">
        <input
          type="checkbox"
          checked={showOnStart}
          onChange={(e) => onShowOnStartChange(e.target.checked)}
          className="accent-ui-accent"
        />
        Show this when I start
      </label>
    </Dialog>
  );
};
