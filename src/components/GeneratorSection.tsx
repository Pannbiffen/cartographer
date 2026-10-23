import React from 'react';
import { Dices, X } from 'lucide-react';
import { Slider } from './Slider';
import { BUTTON_CLASS, FIELD_CLASS } from './options';
import type { CaveSettings, DungeonSettings, GeneratorKind } from '../core/generators/dungeonGenerator';

export interface GeneratorSectionProps {
  kind: GeneratorKind;
  dungeon: DungeonSettings;
  onDungeonChange: (settings: DungeonSettings) => void;
  cave: CaveSettings;
  onCaveChange: (settings: CaveSettings) => void;
  // Generate with the current settings, or with a new seed
  onGenerate: () => void;
  onReroll: () => void;
  onClose: () => void;
  disabled: boolean;
}

const Toggle: React.FC<{ label: string; checked: boolean; onChange: (checked: boolean) => void }> = ({
  label,
  checked,
  onChange,
}) => (
  <label className="flex items-center gap-2">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-ui-accent" />
    <span>{label}</span>
  </label>
);

const cells = (n: number) => `${n} ${n === 1 ? 'cell' : 'cells'}`;

// The settings of Tools > Generate Dungeon / Generate Cave, at the top of the
// panel: change them and generate again until the layout suits
export const GeneratorSection: React.FC<GeneratorSectionProps> = ({
  kind,
  dungeon,
  onDungeonChange,
  cave,
  onCaveChange,
  onGenerate,
  onReroll,
  onClose,
  disabled,
}) => {
  const title = kind === 'dungeon' ? 'Generate Dungeon' : 'Generate Cave';
  const settings = kind === 'dungeon' ? dungeon : cave;
  const setSize = (change: { width?: number; height?: number }) =>
    kind === 'dungeon' ? onDungeonChange({ ...dungeon, ...change }) : onCaveChange({ ...cave, ...change });
  const setSeed = (seed: number) =>
    kind === 'dungeon' ? onDungeonChange({ ...dungeon, seed }) : onCaveChange({ ...cave, seed });

  return (
    <section aria-label={title} className="border-b border-ui-border">
      <h2 className="bg-ui-sunken font-semibold text-ui-text border-b border-ui-border flex items-center px-2.5 py-1">
        <span className="flex-1">{title}</span>
        <button aria-label="Close generator" title="Close the generator" onClick={onClose} className="p-0.5 rounded-sm hover:bg-ui-hover">
          <X className="w-3.5 h-3.5" />
        </button>
      </h2>
      <div className="p-2.5 flex flex-col gap-2.5">
        <p className="text-ui-muted leading-snug">
          Replaces everything on the active layer. Generate again until you like it; one undo brings back what was
          there before.
        </p>
        <Slider label="Width" value={settings.width} display={cells(settings.width)} min={12} max={80} onChange={(width) => setSize({ width })} />
        <Slider label="Height" value={settings.height} display={cells(settings.height)} min={12} max={80} onChange={(height) => setSize({ height })} />

        {kind === 'dungeon' ? (
          <>
            <Slider label="Rooms" value={dungeon.rooms} display={`${dungeon.rooms}`} min={2} max={30} onChange={(rooms) => onDungeonChange({ ...dungeon, rooms })} />
            <Slider
              label="Smallest room"
              value={dungeon.minRoomSize}
              display={cells(dungeon.minRoomSize)}
              min={2}
              max={10}
              onChange={(minRoomSize) => onDungeonChange({ ...dungeon, minRoomSize, maxRoomSize: Math.max(minRoomSize, dungeon.maxRoomSize) })}
            />
            <Slider
              label="Largest room"
              value={dungeon.maxRoomSize}
              display={cells(dungeon.maxRoomSize)}
              min={2}
              max={16}
              onChange={(maxRoomSize) => onDungeonChange({ ...dungeon, maxRoomSize, minRoomSize: Math.min(maxRoomSize, dungeon.minRoomSize) })}
            />
            <Slider
              label="Corridor width"
              value={dungeon.corridorWidth}
              display={cells(dungeon.corridorWidth)}
              min={1}
              max={3}
              onChange={(corridorWidth) => onDungeonChange({ ...dungeon, corridorWidth })}
            />
            <Toggle label="Doors (in one-cell corridors)" checked={dungeon.doors} onChange={(doors) => onDungeonChange({ ...dungeon, doors })} />
            <Toggle label="Props" checked={dungeon.props} onChange={(props) => onDungeonChange({ ...dungeon, props })} />
            <Toggle label="Entrance stairs" checked={dungeon.stairs} onChange={(stairs) => onDungeonChange({ ...dungeon, stairs })} />
          </>
        ) : (
          <>
            <Slider
              label="Openness"
              value={cave.openness}
              display={`${Math.round(cave.openness * 100)}%`}
              min={0.4}
              max={0.7}
              step={0.01}
              onChange={(openness) => onCaveChange({ ...cave, openness })}
            />
            <Slider label="Smoothing" value={cave.smoothing} display={`${cave.smoothing}`} min={0} max={8} onChange={(smoothing) => onCaveChange({ ...cave, smoothing })} />
            <Slider
              label="Smallest cave"
              value={cave.minCaveSize}
              display={cells(cave.minCaveSize)}
              min={1}
              max={100}
              onChange={(minCaveSize) => onCaveChange({ ...cave, minCaveSize })}
            />
            <Toggle label="Pools" checked={cave.pools} onChange={(pools) => onCaveChange({ ...cave, pools })} />
            <Toggle label="Rocks" checked={cave.rocks} onChange={(rocks) => onCaveChange({ ...cave, rocks })} />
          </>
        )}

        <label className="flex items-center gap-2">
          <span>Seed</span>
          <input
            type="number"
            min={1}
            value={settings.seed}
            onChange={(e) => {
              const seed = Math.round(Number(e.target.value));
              if (Number.isFinite(seed)) setSeed(seed);
            }}
            className={`${FIELD_CLASS} min-w-0 flex-1`}
          />
        </label>
        <div className="grid grid-cols-2 gap-1">
          <button onClick={onGenerate} disabled={disabled} className={BUTTON_CLASS}>
            Generate
          </button>
          <button
            onClick={onReroll}
            disabled={disabled}
            title="Generate with a new seed"
            className={`${BUTTON_CLASS} flex items-center justify-center gap-1`}
          >
            <Dices className="w-3.5 h-3.5" />
            Reroll
          </button>
        </div>
        {disabled && <p className="text-ui-muted leading-snug">The active layer is hidden or locked.</p>}
      </div>
    </section>
  );
};
