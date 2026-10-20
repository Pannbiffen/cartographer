import React from 'react';
import type { MapData, PlacedStairs, Selection } from '../types/map';
import { DOOR_TYPES, PROP_TYPES, STAIR_DIRECTIONS, optionButtonClass } from './options';
import type { ModifyMap } from '../App';
import {
  deleteObject,
  findDoor,
  findProp,
  findStairs,
  replaceDoor,
  replaceProp,
  replaceStairs,
  rotateObject,
} from '../core/objects';
import { RotateCw, Trash2 } from 'lucide-react';

interface SelectionInspectorProps {
  mapData: MapData;
  selection: Selection | null;
  onModifyMap: ModifyMap;
  onClearSelection: () => void;
}

export const SelectionInspector: React.FC<SelectionInspectorProps> = ({
  mapData,
  selection,
  onModifyMap,
  onClearSelection,
}) => {
  if (!selection) {
    return (
      <p className="text-xs text-[#bdae9c] leading-relaxed mb-3">
        Click a door, staircase or prop to select it. Drag to move,{' '}
        <span className="text-[#f2ebd9]">R</span> to rotate,{' '}
        <span className="text-[#f2ebd9]">Delete</span> to remove.
      </p>
    );
  }

  const door = selection.kind === 'door' ? findDoor(mapData, selection.id) : undefined;
  const stairs = selection.kind === 'stairs' ? findStairs(mapData, selection.id) : undefined;
  const prop = selection.kind === 'prop' ? findProp(mapData, selection.id) : undefined;

  const setStairs = (changes: Partial<PlacedStairs>) => {
    if (!stairs) return;
    onModifyMap((draft) => replaceStairs(draft, { ...stairs, ...changes }), {
      coalesce: `stairs-${stairs.id}-${Object.keys(changes).join()}`,
    });
  };

  return (
    <div className="mb-3 flex flex-col gap-3 text-xs">
      <div className="text-[#f2ebd9] font-medium capitalize">
        Selected: {door ? `${door.type} door` : stairs ? 'stairs' : prop?.type}
      </div>

      {door && (
        <div className="grid grid-cols-2 gap-1.5">
          {DOOR_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onModifyMap((draft) => replaceDoor(draft, { ...door, type }))}
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
            <label className="text-[#bdae9c] block mb-1">Leads</label>
            <div className="grid grid-cols-4 gap-1.5">
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
              <label key={field} className="text-[#bdae9c]">
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
                  className="mt-1 w-full bg-[#181310] border border-[#3d3129] text-[#e8dfcf] px-2 py-1 rounded outline-none"
                />
              </label>
            ))}
          </div>
        </>
      )}

      {prop && (
        <div className="grid grid-cols-2 gap-1.5">
          {PROP_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => onModifyMap((draft) => replaceProp(draft, { ...prop, type }))}
              className={optionButtonClass(prop.type === type)}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <button
          onClick={() => onModifyMap((draft) => rotateObject(draft, selection))}
          className="py-1.5 px-2 rounded border bg-[#181310] border-[#3d3129] text-[#e8dfcf] hover:bg-[#281f1a] flex items-center justify-center gap-1.5 transition"
        >
          <RotateCw className="w-3.5 h-3.5" />
          Rotate (R)
        </button>
        <button
          onClick={() => {
            onModifyMap((draft) => deleteObject(draft, selection));
            onClearSelection();
          }}
          className="py-1.5 px-2 rounded border bg-red-950/40 border-red-800/40 text-red-200 hover:bg-red-900/60 flex items-center justify-center gap-1.5 transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
};
