import React, { useRef, useState } from 'react';
import { Download, Trash2, Upload } from 'lucide-react';
import type { MapData } from '../types/map';
import type { ModifyMap } from '../App';
import { mapLook } from '../core/newMap';
import {
  MAX_PRESET_NAME,
  applyLook,
  loadPresets,
  mergePresets,
  presetsFromJson,
  presetsToJson,
  savePresets,
  upsertPreset,
  type StylePreset,
} from '../core/presets';
import { triggerDownload } from '../core/export/imageExporter';
import { BUTTON_CLASS, FIELD_CLASS } from './options';

interface StylePresetsProps {
  mapData: MapData;
  onModifyMap: ModifyMap;
}

/** Saves the map's look under a name, applies saved looks, and shares them as files */
export const StylePresets: React.FC<StylePresetsProps> = ({ mapData, onModifyMap }) => {
  const [presets, setPresets] = useState<StylePreset[]>(loadPresets);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (next: StylePreset[], done: string) => {
    setPresets(next);
    setMessage(savePresets(next) ? done : 'Could not keep presets in this browser (storage is full)');
  };

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const replaced = presets.some((p) => p.name.toLowerCase() === trimmed.toLowerCase());
    update(upsertPreset(presets, trimmed, mapLook(mapData)), replaced ? `Updated “${trimmed}”` : `Saved “${trimmed}”`);
    setName('');
  };

  const handleImport = async (file: File) => {
    const imported = presetsFromJson(await file.text());
    if (!imported || imported.length === 0) {
      setMessage('That file has no style presets');
      return;
    }
    update(mergePresets(presets, imported), `Imported ${imported.length} preset${imported.length === 1 ? '' : 's'}`);
  };

  return (
    <>
      {presets.length === 0 ? (
        <p className="text-ui-muted">Save the current look, then apply it to any map.</p>
      ) : (
        <ul aria-label="Saved style presets" className="flex flex-col gap-1">
          {presets.map((preset) => (
            <li key={preset.id} className="flex gap-1">
              <button
                type="button"
                title="Apply this look to the map"
                onClick={() => onModifyMap((draft) => applyLook(draft, preset.look))}
                className={`${BUTTON_CLASS} flex-1 truncate text-left`}
              >
                {preset.name}
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${preset.name}`}
                title="Delete preset"
                onClick={() => update(presets.filter((p) => p.id !== preset.id), `Deleted “${preset.name}”`)}
                className={BUTTON_CLASS}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        <input
          type="text"
          aria-label="Preset name"
          placeholder="Name this look"
          maxLength={MAX_PRESET_NAME}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${FIELD_CLASS} min-w-0 flex-1`}
        />
        <button type="submit" disabled={!name.trim()} className={BUTTON_CLASS}>
          Save
        </button>
      </form>
      <div className="flex gap-1">
        <button
          type="button"
          aria-label="Download presets file"
          title="Download all presets as a file to share"
          disabled={presets.length === 0}
          onClick={() => triggerDownload(new Blob([presetsToJson(presets)], { type: 'application/json' }), 'style-presets.json')}
          className={`${BUTTON_CLASS} flex flex-1 items-center justify-center gap-1`}
        >
          <Download size={14} /> Download
        </button>
        <button
          type="button"
          aria-label="Upload presets file"
          title="Add presets from a shared file"
          onClick={() => fileInput.current?.click()}
          className={`${BUTTON_CLASS} flex flex-1 items-center justify-center gap-1`}
        >
          <Upload size={14} /> Upload
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".json"
          aria-label="Import style presets"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void handleImport(file);
          }}
        />
      </div>
      {message && (
        <p role="status" className="text-ui-muted">
          {message}
        </p>
      )}
    </>
  );
};
