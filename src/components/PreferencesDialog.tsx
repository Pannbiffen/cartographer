import React, { useState } from 'react';
import type { AccentColor, Preferences, UiSize, UiTheme } from '../core/preferences';
import type { ZoomSpeed } from '../core/viewport';
import { DEFAULT_NEW_MAP, type NewMapDefaults } from '../core/newMap';
import { Dialog, DialogGroup } from './Dialog';
import { Slider } from './Slider';
import {
  BUTTON_CLASS,
  FIELD_CLASS,
  GRID_TYPES,
  HATCH_STYLES,
  THEME_NAMES,
  WALL_STYLES,
  optionButtonClass,
} from './options';

interface PreferencesDialogProps {
  preferences: Preferences;
  onChange: (changes: Partial<Preferences>) => void;
  // The open map's look, offered as the new-map defaults
  currentLook: NewMapDefaults;
  onResetLocalData: () => void;
  onClose: () => void;
}

const THEMES: [UiTheme, string][] = [
  ['dark', 'Dark'],
  ['light', 'Light'],
  ['system', 'System'],
];
const SIZES: [UiSize, string][] = [
  ['small', 'Small'],
  ['normal', 'Normal'],
  ['large', 'Large'],
];
const ZOOM_SPEEDS: [ZoomSpeed, string][] = [
  ['slow', 'Slow'],
  ['normal', 'Normal'],
  ['fast', 'Fast'],
];
// Swatch colours; the theme colours themselves live in index.css
const ACCENTS: [AccentColor, string][] = [
  ['blue', '#3584e4'],
  ['green', '#2e9a57'],
  ['orange', '#e66100'],
  ['purple', '#9141ac'],
];

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <span>{label}</span>
      <div className="grid grid-cols-3 gap-1">
        {options.map(([id, name]) => (
          <button
            key={id}
            role="radio"
            aria-checked={value === id}
            onClick={() => onChange(id)}
            className={optionButtonClass(value === id)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Select<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <label className="grid grid-cols-[7rem_1fr] items-center gap-3">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className={FIELD_CLASS}>
        {options.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

const Check: React.FC<{ label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }> = ({
  label,
  hint,
  checked,
  onChange,
}) => (
  <label className="flex items-start gap-2">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-0.5 accent-ui-accent"
    />
    <span>
      {label}
      <span className="block text-ui-muted">{hint}</span>
    </span>
  </label>
);

export const PreferencesDialog: React.FC<PreferencesDialogProps> = ({
  preferences,
  onChange,
  currentLook,
  onResetLocalData,
  onClose,
}) => {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const newMap = preferences.newMap;
  const changeNewMap = (changes: Partial<NewMapDefaults>) => onChange({ newMap: { ...newMap, ...changes } });

  return (
    <Dialog title="Preferences" onClose={onClose}>
      <DialogGroup title="Appearance">
        <Choice label="Theme" options={THEMES} value={preferences.uiTheme} onChange={(uiTheme) => onChange({ uiTheme })} />
        <div role="radiogroup" aria-label="Accent colour" className="grid grid-cols-[7rem_1fr] items-center gap-3">
          <span>Accent colour</span>
          <div className="flex gap-1.5">
            {ACCENTS.map(([id, colour]) => (
              <button
                key={id}
                role="radio"
                aria-checked={preferences.accent === id}
                aria-label={id}
                title={id[0].toUpperCase() + id.slice(1)}
                onClick={() => onChange({ accent: id })}
                className={`w-6 h-6 rounded-sm border-2 ${
                  preferences.accent === id ? 'border-ui-text' : 'border-transparent'
                }`}
                style={{ background: colour }}
              />
            ))}
          </div>
        </div>
        <Choice label="Interface size" options={SIZES} value={preferences.uiSize} onChange={(uiSize) => onChange({ uiSize })} />
        <p className="text-ui-muted">Map styles are set per map in the Map panel.</p>
      </DialogGroup>

      <DialogGroup title="Behaviour">
        <Choice
          label="Wheel zoom"
          options={ZOOM_SPEEDS}
          value={preferences.zoomSpeed}
          onChange={(zoomSpeed) => onChange({ zoomSpeed })}
        />
        <Check
          label="Autosave the map in this browser"
          hint="Turning this off also deletes the autosaved copy."
          checked={preferences.autosave}
          onChange={(autosave) => onChange({ autosave })}
        />
        <Check
          label="Show the properties panel"
          hint="Also under View > Properties Panel."
          checked={preferences.showPanel}
          onChange={(showPanel) => onChange({ showPanel })}
        />
      </DialogGroup>

      <DialogGroup title="New maps">
        <p className="text-ui-muted">File &gt; New starts a blank map with this look.</p>
        <Select label="Map style" options={THEME_NAMES} value={newMap.theme} onChange={(theme) => changeNewMap({ theme })} />
        <Select
          label="Wall style"
          options={WALL_STYLES}
          value={newMap.wallStyle}
          onChange={(wallStyle) => changeNewMap({ wallStyle })}
        />
        <Select
          label="Hatching"
          options={HATCH_STYLES}
          value={newMap.hatchStyle}
          onChange={(hatchStyle) => changeNewMap({ hatchStyle })}
        />
        <Select
          label="Grid shape"
          options={GRID_TYPES}
          value={newMap.gridType}
          onChange={(gridType) => changeNewMap({ gridType })}
        />
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <Slider
            label="Hatching width"
            value={newMap.hatchLength}
            display={`${newMap.hatchLength}px`}
            min={6}
            max={24}
            onChange={(hatchLength) => changeNewMap({ hatchLength })}
          />
          <Slider
            label="Hatching density"
            value={newMap.hatchDensity}
            display={String(newMap.hatchDensity)}
            min={1}
            max={5}
            onChange={(hatchDensity) => changeNewMap({ hatchDensity })}
          />
          <Slider
            label="Grid opacity"
            value={newMap.gridOpacity}
            display={`${Math.round(newMap.gridOpacity * 100)}%`}
            min={0.05}
            max={0.8}
            step={0.05}
            onChange={(gridOpacity) => changeNewMap({ gridOpacity })}
          />
          <label className="flex items-center gap-2 self-end">
            <input
              type="checkbox"
              checked={newMap.showGrid}
              onChange={(e) => changeNewMap({ showGrid: e.target.checked })}
              className="accent-ui-accent"
            />
            <span>Show battle grid</span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button onClick={() => onChange({ newMap: DEFAULT_NEW_MAP })} className={BUTTON_CLASS}>
            Restore defaults
          </button>
          <button onClick={() => onChange({ newMap: currentLook })} className={BUTTON_CLASS}>
            Use the current map’s look
          </button>
        </div>
      </DialogGroup>

      <DialogGroup title="Local data">
        {confirmingReset ? (
          <div role="alert" className="flex flex-col gap-2 border border-ui-danger p-2">
            <p className="leading-snug">
              <strong>This deletes your preferences and the autosaved map from this browser</strong>, then
              reloads with the starter map. The current map is lost unless you saved it as a .dndmap file.
              Files you have saved or exported are not affected.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmingReset(false)} className={BUTTON_CLASS}>
                Cancel
              </button>
              <button
                onClick={onResetLocalData}
                className="px-2 py-1 rounded-sm border border-ui-danger bg-ui-danger text-ui-field hover:opacity-90"
              >
                Delete and reload
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-ui-muted leading-snug">
              Preferences and the autosaved map are stored only in this browser.
            </span>
            <button onClick={() => setConfirmingReset(true)} className={`${BUTTON_CLASS} shrink-0 text-ui-danger`}>
              Reset all local data…
            </button>
          </div>
        )}
      </DialogGroup>

      <div className="flex justify-end">
        <button onClick={onClose} className={BUTTON_CLASS}>
          Close
        </button>
      </div>
    </Dialog>
  );
};
