import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { GridType, MapData, ThemeType } from '../types/map';
import type { ModifyMap } from '../App';
import { StylePresets } from './StylePresets';
import { Slider } from './Slider';
import { FIELD_CLASS, GRID_TYPES, GROUND_CHOICES, groundChoice, groundSettings, HATCH_STYLES, THEME_NAMES, WALL_STYLES } from './options';

interface MapSettingsDrawerProps {
  open: boolean;
  onToggle: () => void;
  mapData: MapData;
  onModifyMap: ModifyMap;
}

// One column of the drawer; `wide` columns lay their controls out in two columns
const Column: React.FC<{ title: string; wide?: boolean; minWidth?: string; children: React.ReactNode }> = ({
  title,
  wide,
  minWidth = wide ? 'min-w-96' : 'min-w-48',
  children,
}) => (
  <div
    role="group"
    aria-label={title}
    className={`${minWidth} ${wide ? 'flex-[2]' : 'flex-1'} p-2.5 border-r border-ui-border last:border-r-0`}
  >
    <h2 className="mb-1.5 font-semibold">{title}</h2>
    <div className={wide ? 'grid grid-cols-2 gap-x-4 gap-y-2.5' : 'flex flex-col gap-2.5'}>{children}</div>
  </div>
);

// A labelled drop-down of [value, name] pairs
const Picker = <T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) => (
  <label className="flex flex-col gap-0.5">
    <span>{label}</span>
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className={FIELD_CLASS}>
      {options.map(([id, name]) => (
        <option key={id} value={id}>{name}</option>
      ))}
    </select>
  </label>
);

// Map-wide settings in a drawer under the canvas; its title bar stays visible to open it
export const MapSettingsDrawer: React.FC<MapSettingsDrawerProps> = ({ open, onToggle, mapData, onModifyMap }) => (
  <section aria-label="Map settings" className="shrink-0 bg-ui border-t border-ui-border text-ui-text">
    <button
      type="button"
      aria-expanded={open}
      title={`${open ? 'Hide' : 'Show'} map settings (M)`}
      onClick={onToggle}
      className="w-full flex items-center gap-1 px-2 py-0.5 bg-ui-sunken font-semibold hover:bg-ui-hover"
    >
      {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      Map settings
    </button>

    {open && (
      <div className="flex overflow-x-auto border-t border-ui-border">
        <Column title="Map">
          <label className="flex flex-col gap-0.5">
            <span>Title</span>
            <input
              type="text"
              aria-label="Map title"
              value={mapData.title}
              onChange={(e) => onModifyMap((draft) => { draft.title = e.target.value; }, { coalesce: 'title' })}
              placeholder="Untitled map"
              className={FIELD_CLASS}
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Style</span>
            <select
              aria-label="Map style"
              value={mapData.theme}
              onChange={(e) => onModifyMap((draft) => { draft.theme = e.target.value as ThemeType; })}
              className={FIELD_CLASS}
            >
              {THEME_NAMES.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </label>
          <Picker
            label="Ground"
            options={GROUND_CHOICES}
            value={groundChoice(mapData)}
            onChange={(v) => onModifyMap((draft) => { Object.assign(draft, groundSettings(v)); })}
          />
        </Column>

        <Column title="Style presets" minWidth="min-w-56">
          <StylePresets mapData={mapData} onModifyMap={onModifyMap} />
        </Column>

        <Column title="Walls" wide>
          <Picker
            label="Wall style"
            options={WALL_STYLES}
            value={mapData.wallStyle}
            onChange={(v) => onModifyMap((draft) => { draft.wallStyle = v; })}
          />
          <Picker
            label="Hatching"
            options={HATCH_STYLES}
            value={mapData.hatchStyle}
            onChange={(v) => onModifyMap((draft) => { draft.hatchStyle = v; })}
          />
          <Slider
            label="Hatching width"
            value={mapData.hatchLength}
            display={`${mapData.hatchLength}px`}
            min={6}
            max={24}
            onChange={(v) => onModifyMap((draft) => { draft.hatchLength = v; }, { coalesce: 'hatchLength' })}
          />
          <Slider
            label="Hatching density"
            value={mapData.hatchDensity}
            display={String(mapData.hatchDensity)}
            min={1}
            max={5}
            onChange={(v) => onModifyMap((draft) => { draft.hatchDensity = v; }, { coalesce: 'hatchDensity' })}
          />
        </Column>

        <Column title="Lighting">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapData.lighting}
              onChange={(e) => onModifyMap((draft) => { draft.lighting = e.target.checked; })}
              className="accent-ui-accent"
            />
            <span>Darken map and show lights</span>
          </label>
          <Slider
            label="Darkness"
            value={mapData.darkness}
            display={`${Math.round(mapData.darkness * 100)}%`}
            min={0.2}
            max={1}
            step={0.05}
            onChange={(v) => onModifyMap((draft) => { draft.darkness = v; }, { coalesce: 'darkness' })}
          />
        </Column>

        <Column title="Grid">
          <Picker
            label="Grid shape"
            options={GRID_TYPES}
            value={mapData.gridType}
            onChange={(v: GridType) => onModifyMap((draft) => { draft.gridType = v; })}
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={mapData.showGrid}
              onChange={(e) => onModifyMap((draft) => { draft.showGrid = e.target.checked; })}
              className="accent-ui-accent"
            />
            <span>Show battle grid</span>
          </label>
          <Slider
            label="Grid opacity"
            value={mapData.gridOpacity}
            display={`${Math.round(mapData.gridOpacity * 100)}%`}
            min={0.05}
            max={0.8}
            step={0.05}
            onChange={(v) => onModifyMap((draft) => { draft.gridOpacity = v; }, { coalesce: 'gridOpacity' })}
          />
        </Column>
      </div>
    )}
  </section>
);
