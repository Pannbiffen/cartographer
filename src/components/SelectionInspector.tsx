import React, { useEffect, useRef } from 'react';
import type { MapData, PlacedLabel, PlacedStairs, Selection } from '../types/map';
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
  deleteObject,
  findDoor,
  findLabel,
  findProp,
  findStairs,
  replaceDoor,
  replaceLabel,
  replaceProp,
  replaceStairs,
  rotateObject,
} from '../core/objects';
import { RotateCw, Trash2 } from 'lucide-react';

interface SelectionInspectorProps {
  mapData: MapData;
  selection: Selection | null;
  hint?: string;
  // Focus the label text box when a label is selected (label tool only)
  focusLabelText?: boolean;
  onModifyMap: ModifyMap;
  onClearSelection: () => void;
}

export const SelectionInspector: React.FC<SelectionInspectorProps> = ({
  mapData,
  selection,
  hint,
  focusLabelText = false,
  onModifyMap,
  onClearSelection,
}) => {
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const labelId = selection?.kind === 'label' ? selection.id : null;
  useEffect(() => {
    if (!labelId || !focusLabelText) return;
    // Defer past the click that created the label, whose default action
    // would otherwise move focus straight back to the page
    const timer = window.setTimeout(() => labelInputRef.current?.select(), 0);
    return () => window.clearTimeout(timer);
  }, [labelId, focusLabelText]);

  if (!selection) {
    return (
      <p className="text-ui-muted leading-snug">
        {hint ?? (
          <>
            Click a door, staircase, prop or label to select it. Drag to move,{' '}
            <kbd>R</kbd> to rotate,{' '}
            <kbd>Delete</kbd> to remove.
          </>
        )}
      </p>
    );
  }

  const layer = findLayer(mapData, selection.layerId);
  if (!layer) return null;
  const door = selection.kind === 'door' ? findDoor(layer, selection.id) : undefined;
  const stairs = selection.kind === 'stairs' ? findStairs(layer, selection.id) : undefined;
  const prop = selection.kind === 'prop' ? findProp(layer, selection.id) : undefined;
  const label = selection.kind === 'label' ? findLabel(layer, selection.id) : undefined;
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
        Selected: {door ? `${door.type} door` : stairs ? 'stairs' : label ? 'label' : prop?.type}
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

      <div className="grid grid-cols-2 gap-1">
        {!label && (
          <button
            onClick={() => onModifyMap((draft) => rotateObject(draft, selection))}
            className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5`}
          >
            <RotateCw className="w-3.5 h-3.5" />
            Rotate (R)
          </button>
        )}
        <button
          onClick={() => {
            onModifyMap((draft) => deleteObject(draft, selection));
            onClearSelection();
          }}
          className={`${BUTTON_CLASS} flex items-center justify-center gap-1.5 text-ui-danger`}
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
};
