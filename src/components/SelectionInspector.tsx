import React, { useEffect, useRef } from 'react';
import type { LevelMap, LightSettings, MapLevel, PlacedLabel, PlacedStairs, Selection } from '../types/map';
import {
  DOOR_TYPES,
  LABEL_SIZES,
  LABEL_STYLES,
  PROP_TYPES,
  STAIR_DIRECTIONS,
  BUTTON_CLASS,
  FIELD_CLASS,
  optionButtonClass,
} from './options';
import type { ModifyMap } from '../App';
import { findLayer, withLayer } from '../core/layers';
import {
  deleteObjects,
  findDoor,
  findLabel,
  findLight,
  findProp,
  findStairs,
  findWall,
  replaceDoor,
  replaceLabel,
  replaceLight,
  replaceProp,
  replaceStairs,
  rotateObjects,
} from '../core/objects';
import { Copy, CopyPlus, RotateCw, Trash2 } from 'lucide-react';
import { Slider } from './Slider';
import { LIGHT_RADIUS_RANGE, TORCH_LIGHT } from '../core/lighting';

const LightControls: React.FC<{
  light: LightSettings;
  onChange: (changes: Partial<LightSettings>) => void;
}> = ({ light, onChange }) => (
  <>
    <label className="flex items-center justify-between">
      <span>Colour</span>
      <input
        type="color"
        aria-label="Light colour"
        value={light.color}
        onChange={(e) => onChange({ color: e.target.value })}
        className="h-6 w-12 bg-ui-field border border-ui-border rounded-sm"
      />
    </label>
    <Slider
      label="Radius"
      value={light.radius}
      display={`${light.radius} cells`}
      min={LIGHT_RADIUS_RANGE.min}
      max={LIGHT_RADIUS_RANGE.max}
      onChange={(radius) => onChange({ radius })}
    />
    <Slider
      label="Intensity"
      value={light.intensity}
      display={`${Math.round(light.intensity * 100)}%`}
      min={0.1}
      max={1}
      step={0.05}
      onChange={(intensity) => onChange({ intensity })}
    />
  </>
);

// The level a staircase leads to, and a button to go there
const StairsLink: React.FC<{
  stairs: PlacedStairs;
  levels: MapLevel[];
  onChange: (toLevel: string | undefined) => void;
  onTake: () => void;
}> = ({ stairs, levels, onChange, onTake }) => {
  const target = levels.find((l) => l.id === stairs.toLevel);
  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span>Go to level</span>
        <select
          aria-label="Stairs go to level"
          value={target?.id ?? ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={FIELD_CLASS}
        >
          <option value="">None</option>
          {levels.map((level) => (
            <option key={level.id} value={level.id}>
              {level.name || 'Untitled level'}
            </option>
          ))}
        </select>
      </label>
      {target && (
        <button onClick={onTake} title="Or double-click the stairs" className={BUTTON_CLASS}>
          Take stairs to {target.name || 'Untitled level'}
        </button>
      )}
    </>
  );
};

interface SelectionInspectorProps {
  // The active level, as drawn
  mapData: LevelMap;
  // All the map's levels, for the level a staircase leads to
  levels: MapLevel[];
  activeLevelId: string;
  onTakeStairs: (stairs: Selection) => void;
  selection: Selection[];
  hint?: string;
  // Focus the label text box when a label is selected (label tool only)
  focusLabelText?: boolean;
  onModifyMap: ModifyMap;
  onClearSelection: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
}

export const SelectionInspector: React.FC<SelectionInspectorProps> = ({
  mapData,
  levels,
  activeLevelId,
  onTakeStairs,
  selection: selected,
  hint,
  focusLabelText = false,
  onModifyMap,
  onClearSelection,
  onDuplicate,
  onCopy,
}) => {
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const selection = selected.length === 1 ? selected[0] : null;
  const labelId = selection?.kind === 'label' ? selection.id : null;
  useEffect(() => {
    if (!labelId || !focusLabelText) return;
    // Defer past the click that created the label, whose default action
    // would otherwise move focus straight back to the page
    const timer = window.setTimeout(() => labelInputRef.current?.select(), 0);
    return () => window.clearTimeout(timer);
  }, [labelId, focusLabelText]);

  // Rotate, Duplicate, Copy and Delete, for one object or several
  const actions = (rotatable: boolean) => (
    <div className="grid grid-cols-2 gap-1">
      {rotatable && (
        <button
          onClick={() => onModifyMap((draft) => rotateObjects(draft, selected))}
          className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5`}
        >
          <RotateCw className="w-3.5 h-3.5" />
          Rotate (R)
        </button>
      )}
      <button onClick={onDuplicate} className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5`}>
        <CopyPlus className="w-3.5 h-3.5" />
        Duplicate
      </button>
      <button onClick={onCopy} className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5`}>
        <Copy className="w-3.5 h-3.5" />
        Copy
      </button>
      <button
        onClick={() => {
          onModifyMap((draft) => deleteObjects(draft, selected));
          onClearSelection();
        }}
        className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5 text-ui-danger`}
      >
        <Trash2 className="w-3.5 h-3.5" />
        Delete
      </button>
    </div>
  );

  if (selected.length > 1) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="font-medium">Selected: {selected.length} objects</div>
        <p className="text-ui-muted leading-snug">Drag or nudge them together. Shift+click one to leave it out.</p>
        {actions(selected.some((sel) => sel.kind !== 'label' && sel.kind !== 'light'))}
      </div>
    );
  }

  if (!selection) {
    return (
      <p className="text-ui-muted leading-snug">
        {hint ?? (
          <>
            Click a door, wall, staircase, prop, label or light to select it; Shift+click or drag a box to select
            several. Drag to move, <kbd>R</kbd> to rotate, <kbd>Delete</kbd> to remove.
          </>
        )}
      </p>
    );
  }

  const layer = findLayer(mapData, selection.layerId);
  if (!layer) return null;
  const door = selection.kind === 'door' ? findDoor(layer, selection.id) : undefined;
  const wall = selection.kind === 'wall' ? findWall(layer, selection.id) : undefined;
  const stairs = selection.kind === 'stairs' ? findStairs(layer, selection.id) : undefined;
  const prop = selection.kind === 'prop' ? findProp(layer, selection.id) : undefined;
  const label = selection.kind === 'label' ? findLabel(layer, selection.id) : undefined;
  const light = selection.kind === 'light' ? findLight(layer, selection.id) : undefined;
  // Edits apply to the selected object's own layer
  const editLayer = (edit: Parameters<typeof withLayer>[2], options?: Parameters<ModifyMap>[1]) =>
    onModifyMap((draft) => withLayer(draft, layer.id, edit), options);

  const setLabel = (changes: Partial<PlacedLabel>) => {
    if (!label) return;
    editLayer((draft) => replaceLabel(draft, { ...label, ...changes }), {
      coalesce: `label-${label.id}-${Object.keys(changes).join()}`,
    });
  };

  const setStairs = (changes: Partial<PlacedStairs>) => {
    if (!stairs) return;
    editLayer((draft) => replaceStairs(draft, { ...stairs, ...changes }), {
      coalesce: `stairs-${stairs.id}-${Object.keys(changes).join()}`,
    });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="font-medium capitalize">
        Selected: {door ? `${door.type} door` : wall ? 'wall' : stairs ? 'stairs' : label ? 'label' : light ? 'light' : prop?.type}
      </div>

      {door && (
        <div className="grid grid-cols-2 gap-1">
          {DOOR_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => editLayer((draft) => replaceDoor(draft, { ...door, type }))}
              className={optionButtonClass(door.type === type)}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {stairs && (
        <>
          <div>
            <div className="mb-1">Leads</div>
            <div className="grid grid-cols-4 gap-1">
              {STAIR_DIRECTIONS.map((direction) => (
                <button
                  key={direction}
                  onClick={() => setStairs({ direction })}
                  className={optionButtonClass(stairs.direction === direction)}
                >
                  {direction}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['width', 'Width', 1, 8],
                ['height', 'Height', 1, 8],
                ['steps', 'Steps', 3, 12],
              ] as const
            ).map(([field, label, min, max]) => (
              <label key={field}>
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  value={stairs[field]}
                  onChange={(e) => {
                    const value = Math.min(max, Math.max(min, parseInt(e.target.value, 10) || min));
                    setStairs({ [field]: value });
                  }}
                  className={`mt-0.5 w-full ${FIELD_CLASS}`}
                />
              </label>
            ))}
          </div>
          {levels.length > 1 ? (
            <StairsLink
              stairs={stairs}
              levels={levels.filter((l) => l.id !== activeLevelId)}
              onChange={(toLevel) => setStairs({ toLevel })}
              onTake={() => onTakeStairs(selection)}
            />
          ) : (
            <p className="text-ui-muted leading-snug">Add a level (Level &gt; New Level Above) to link these stairs to it.</p>
          )}
        </>
      )}

      {prop && (
        <div className="grid grid-cols-2 gap-1">
          {PROP_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => editLayer((draft) => replaceProp(draft, { ...prop, type }))}
              className={optionButtonClass(prop.type === type)}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {prop?.type === 'torch' && (
        <LightControls
          light={prop.light ?? TORCH_LIGHT}
          onChange={(changes) =>
            editLayer((draft) => replaceProp(draft, { ...prop, light: { ...(prop.light ?? TORCH_LIGHT), ...changes } }), {
              coalesce: `torch-${prop.id}-${Object.keys(changes).join()}`,
            })
          }
        />
      )}

      {light && (
        <LightControls
          light={light}
          onChange={(changes) =>
            editLayer((draft) => replaceLight(draft, { ...light, ...changes }), {
              coalesce: `light-${light.id}-${Object.keys(changes).join()}`,
            })
          }
        />
      )}

      {label && (
        <>
          <input
            ref={labelInputRef}
            value={label.text}
            onChange={(e) => setLabel({ text: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            placeholder="Label text"
            className={`w-full ${FIELD_CLASS}`}
          />
          <div className="grid grid-cols-3 gap-1">
            {LABEL_SIZES.map(([name, size]) => (
              <button
                key={name}
                onClick={() => setLabel({ size })}
                className={optionButtonClass(label.size === size)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {LABEL_STYLES.map((style) => (
              <button
                key={style}
                aria-label={`${style} style`}
                onClick={() => setLabel({ style })}
                className={optionButtonClass((label.style ?? 'text') === style)}
              >
                {style}
              </button>
            ))}
          </div>
        </>
      )}

      {actions(!label && !light)}
    </div>
  );
};
