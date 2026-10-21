import React from 'react';
import type {
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  LabelStyle,
  MapData,
  Selection,
  ThemeType,
} from '../types/map';
import { SelectionInspector } from './SelectionInspector';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import {
  DOOR_TYPES,
  BUTTON_CLASS,
  FIELD_CLASS,
  FLOOR_TEXTURES,
  HATCH_STYLES,
  LABEL_STYLES,
  PROP_TYPES,
  THEME_NAMES,
  TOOLS,
  WALL_STYLES,
  optionButtonClass,
} from './options';
import type { ModifyMap } from '../App';
import { findLayer, withLayer } from '../core/layers';

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
  floorTexture: FloorTexture;
  onFloorTextureChange: (texture: FloorTexture) => void;
  labelStyle: LabelStyle;
  onLabelStyleChange: (style: LabelStyle) => void;
  selection: Selection | null;
  onClearSelection: () => void;
  mapData: MapData;
  onModifyMap: ModifyMap;
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: () => void;
  onMoveLayer: (delta: 1 | -1) => void;
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

const ICON_BUTTON_CLASS = `${BUTTON_CLASS} flex items-center justify-center`;

// Layer list (top layer first) with show/lock toggles, plus the active layer's settings
const LayersSection: React.FC<
  Pick<
    DockPanelProps,
    'mapData' | 'onModifyMap' | 'activeLayerId' | 'onSelectLayer' | 'onAddLayer' | 'onDeleteLayer' | 'onMoveLayer'
  >
> = ({ mapData, onModifyMap, activeLayerId, onSelectLayer, onAddLayer, onDeleteLayer, onMoveLayer }) => {
  const active = findLayer(mapData, activeLayerId);
  const index = active ? mapData.layers.indexOf(active) : -1;
  const editLayer = (id: string, edit: Parameters<typeof withLayer>[2], coalesce?: string) =>
    onModifyMap((draft) => withLayer(draft, id, edit), coalesce ? { coalesce } : undefined);

  return (
    <Section title="Layers">
      <ul aria-label="Layers" className="border border-ui-border rounded-sm bg-ui-field">
        {[...mapData.layers].reverse().map((layer) => {
          const isActive = layer.id === activeLayerId;
          const toggleClass = `p-1 rounded-sm ${isActive ? 'hover:bg-ui-accent-dark' : 'hover:bg-ui-hover'}`;
          return (
            <li
              key={layer.id}
              className={`flex items-center gap-0.5 px-0.5 ${isActive ? 'bg-ui-accent text-white' : ''}`}
            >
              <button
                aria-label={`${layer.visible ? 'Hide' : 'Show'} ${layer.name}`}
                title={layer.visible ? 'Hide layer' : 'Show layer'}
                onClick={() => editLayer(layer.id, (l) => { l.visible = !l.visible; })}
                className={toggleClass}
              >
                {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 opacity-60" />}
              </button>
              <button
                aria-label={`${layer.locked ? 'Unlock' : 'Lock'} ${layer.name}`}
                title={layer.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={() => editLayer(layer.id, (l) => { l.locked = !l.locked; })}
                className={toggleClass}
              >
                {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5 opacity-40" />}
              </button>
              <button
                aria-pressed={isActive}
                onClick={() => onSelectLayer(layer.id)}
                className={`flex-1 min-w-0 truncate text-left px-1 py-1 ${layer.visible ? '' : 'opacity-60'}`}
              >
                {layer.name || 'Untitled layer'}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-4 gap-1">
        <button aria-label="New layer" title="New layer" onClick={onAddLayer} className={ICON_BUTTON_CLASS}>
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Move layer up"
          title="Move layer up"
          disabled={index >= mapData.layers.length - 1}
          onClick={() => onMoveLayer(1)}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Move layer down"
          title="Move layer down"
          disabled={index <= 0}
          onClick={() => onMoveLayer(-1)}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Delete layer"
          title="Delete layer"
          disabled={mapData.layers.length <= 1}
          onClick={onDeleteLayer}
          className={`${ICON_BUTTON_CLASS} text-ui-danger`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {active && (
        <>
          <label className="flex flex-col gap-0.5">
            <span>Name</span>
            <input
              type="text"
              aria-label="Layer name"
              value={active.name}
              onChange={(e) => editLayer(active.id, (l) => { l.name = e.target.value; }, `layer-name-${active.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
              }}
              className={FIELD_CLASS}
            />
          </label>
          <Slider
            label="Layer opacity"
            value={active.opacity}
            display={`${Math.round(active.opacity * 100)}%`}
            min={0.1}
            max={1}
            step={0.05}
            onChange={(v) => editLayer(active.id, (l) => { l.opacity = v; }, `layer-opacity-${active.id}`)}
          />
        </>
      )}
    </Section>
  );
};

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
  floorTexture,
  onFloorTextureChange,
  labelStyle,
  onLabelStyleChange,
  selection,
  onClearSelection,
  mapData,
  onModifyMap,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onMoveLayer,
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
        {activeTool === 'label' && (
          <Choices label="New labels" options={LABEL_STYLES} value={labelStyle} columns={3} onChange={onLabelStyleChange} />
        )}
        {(activeTool === 'select' || activeTool === 'label') && (
          <SelectionInspector
            mapData={mapData}
            selection={selection}
            // Room numbers fill themselves in, so keep clicking instead of typing
            focusLabelText={activeTool === 'label' && labelStyle === 'text'}
            hint={
              activeTool === 'label'
                ? labelStyle === 'text'
                  ? 'Click the map to place a label, or click a label to edit or drag it.'
                  : 'Click the map to place the next room number (1, 2, 3...).'
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

        {(activeTool === 'room-brush' || activeTool === 'room-rect' || activeTool === 'tunnel') && (
          <Choices label="Floor" options={FLOOR_TEXTURES} value={floorTexture} columns={2} onChange={onFloorTextureChange} />
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

      <LayersSection
        mapData={mapData}
        onModifyMap={onModifyMap}
        activeLayerId={activeLayerId}
        onSelectLayer={onSelectLayer}
        onAddLayer={onAddLayer}
        onDeleteLayer={onDeleteLayer}
        onMoveLayer={onMoveLayer}
      />

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

      <Section title="Walls">
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
