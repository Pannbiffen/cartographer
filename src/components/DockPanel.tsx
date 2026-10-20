import React from 'react';
import type { ToolType, DoorType, PropType, FoliageType, MapData, Selection, ThemeType } from '../types/map';
import { SelectionInspector } from './SelectionInspector';
import { DOOR_TYPES, FIELD_CLASS, PROP_TYPES, THEME_NAMES, TOOLS, optionButtonClass } from './options';
import type { ModifyMap } from '../App';

interface DockPanelProps {
  activeTool: ToolType;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
  selectedDoorType: DoorType;
  onDoorTypeChange: (type: DoorType) => void;
  selectedPropType: PropType;
  onPropTypeChange: (type: PropType) => void;
  selectedFoliageType: FoliageType;
  onFoliageTypeChange: (type: FoliageType) => void;
  selection: Selection | null;
  onClearSelection: () => void;
  mapData: MapData;
  onModifyMap: ModifyMap;
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="border-b border-ui-border">
    <h2 className="px-2.5 py-1 bg-ui-sunken font-semibold text-ui-text border-b border-ui-border">{title}</h2>
    <div className="p-2.5 flex flex-col gap-2.5">{children}</div>
  </section>
);

const Slider: React.FC<{
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}> = ({ label, value, display, min, max, step = 1, onChange }) => (
  <label className="flex flex-col gap-0.5">
    <span className="flex justify-between">
      <span>{label}</span>
      <span className="tabular-nums text-ui-muted">{display}</span>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full accent-ui-accent"
    />
  </label>
);

const Choices = <T extends string>({
  label,
  options,
  value,
  columns,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  columns: number;
  onChange: (value: T) => void;
}) => (
  <div>
    <div className="mb-1">{label}</div>
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button key={option} onClick={() => onChange(option)} className={optionButtonClass(value === option)}>
          {option}
        </button>
      ))}
    </div>
  </div>
);

// Properties panel docked to the right of the canvas
export const DockPanel: React.FC<DockPanelProps> = ({
  activeTool,
  brushSize,
  onBrushSizeChange,
  selectedDoorType,
  onDoorTypeChange,
  selectedPropType,
  onPropTypeChange,
  selectedFoliageType,
  onFoliageTypeChange,
  selection,
  onClearSelection,
  mapData,
  onModifyMap,
}) => {
  const toolLabel = TOOLS.find((t) => t.id === activeTool)?.label ?? 'Tool';
  const usesBrushSize =
    activeTool === 'room-brush' ||
    activeTool === 'tunnel' ||
    activeTool === 'water' ||
    activeTool === 'foliage' ||
    activeTool === 'eraser';

  return (
    <aside aria-label="Properties" className="w-64 shrink-0 bg-ui border-l border-ui-border overflow-y-auto text-ui-text">
      <Section title={toolLabel}>
        {(activeTool === 'select' || activeTool === 'label') && (
          <SelectionInspector
            mapData={mapData}
            selection={selection}
            focusLabelText={activeTool === 'label'}
            hint={
              activeTool === 'label'
                ? 'Click the map to place a label, or click a label to edit or drag it.'
                : undefined
            }
            onModifyMap={onModifyMap}
            onClearSelection={onClearSelection}
          />
        )}

        {usesBrushSize && (
          <Slider
            label="Brush size"
            value={brushSize}
            display={`${brushSize}×${brushSize}`}
            min={1}
            max={5}
            onChange={onBrushSizeChange}
          />
        )}

        {activeTool === 'door' && (
          <Choices label="Door type" options={DOOR_TYPES} value={selectedDoorType} columns={2} onChange={onDoorTypeChange} />
        )}
        {activeTool === 'foliage' && (
          <Choices
            label="Plant / terrain"
            options={['tree', 'bush', 'rock'] as FoliageType[]}
            value={selectedFoliageType}
            columns={3}
            onChange={onFoliageTypeChange}
          />
        )}
        {activeTool === 'prop' && (
          <Choices label="Prop" options={PROP_TYPES} value={selectedPropType} columns={2} onChange={onPropTypeChange} />
        )}
        {(activeTool === 'room-rect' || activeTool === 'stairs') && (
          <p className="text-ui-muted leading-snug">
            {activeTool === 'stairs' ? 'Click a cell to place stairs.' : 'Drag to draw a rectangular room.'}
          </p>
        )}
      </Section>

      <Section title="Map">
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
      </Section>

      <Section title="Hatching">
        <Slider
          label="Length"
          value={mapData.hatchLength}
          display={`${mapData.hatchLength}px`}
          min={6}
          max={24}
          onChange={(v) => onModifyMap((draft) => { draft.hatchLength = v; }, { coalesce: 'hatchLength' })}
        />
        <Slider
          label="Density"
          value={mapData.hatchDensity}
          display={String(mapData.hatchDensity)}
          min={1}
          max={5}
          onChange={(v) => onModifyMap((draft) => { draft.hatchDensity = v; }, { coalesce: 'hatchDensity' })}
        />
      </Section>

      <Section title="Grid">
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
          label="Opacity"
          value={mapData.gridOpacity}
          display={`${Math.round(mapData.gridOpacity * 100)}%`}
          min={0.05}
          max={0.8}
          step={0.05}
          onChange={(v) => onModifyMap((draft) => { draft.gridOpacity = v; }, { coalesce: 'gridOpacity' })}
        />
      </Section>
    </aside>
  );
};
