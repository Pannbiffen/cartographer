import React from 'react';
import type {
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  LabelStyle,
  LevelMap,
  MapLevel,
  Selection,
  ShapeMode,
} from '../types/map';
import { SelectionInspector } from './SelectionInspector';
import { Slider } from './Slider';
import { ArrowDown, ArrowUp, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import {
  DOOR_TYPES,
  BUTTON_CLASS,
  FIELD_CLASS,
  FLOOR_TEXTURES,
  LABEL_STYLES,
  PROP_TYPES,
  TOOLS,
  keepsSelection,
  laysFloor,
  optionButtonClass,
} from './options';
import type { ModifyMap } from '../App';
import { findLayer, withLayer } from '../core/layers';
import { withLevel } from '../core/levels';
import { isHexGrid } from '../core/geometry/hex';

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
  shapeMode: ShapeMode;
  onShapeModeChange: (mode: ShapeMode) => void;
  selection: Selection[];
  onClearSelection: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  // The active level, as drawn
  mapData: LevelMap;
  levels: MapLevel[];
  activeLevelId: string;
  onSelectLevel: (id: string) => void;
  onAddLevel: () => void;
  onDeleteLevel: () => void;
  onMoveLevel: (delta: 1 | -1) => void;
  onTakeStairs: (stairs: Selection) => void;
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

const ICON_BUTTON_CLASS = `${BUTTON_CLASS} flex items-center justify-center`;

// Level list (first level first), plus the active level's name
const LevelsSection: React.FC<
  Pick<
    DockPanelProps,
    'levels' | 'activeLevelId' | 'onSelectLevel' | 'onAddLevel' | 'onDeleteLevel' | 'onMoveLevel' | 'onModifyMap'
  >
> = ({ levels, activeLevelId, onSelectLevel, onAddLevel, onDeleteLevel, onMoveLevel, onModifyMap }) => {
  const index = levels.findIndex((l) => l.id === activeLevelId);
  const active = levels[index];

  return (
    <Section title="Levels">
      <ul aria-label="Levels" className="border border-ui-border rounded-sm bg-ui-field">
        {levels.map((level) => {
          const isActive = level.id === activeLevelId;
          return (
            <li key={level.id} className={isActive ? 'bg-ui-accent text-white' : ''}>
              <button
                aria-pressed={isActive}
                onClick={() => onSelectLevel(level.id)}
                className="w-full min-w-0 truncate text-left px-1.5 py-1"
              >
                {level.name || 'Untitled level'}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-4 gap-1">
        <button aria-label="New level" title="New level" onClick={onAddLevel} className={ICON_BUTTON_CLASS}>
          <Plus className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Move level up"
          title="Move level up"
          disabled={index <= 0}
          onClick={() => onMoveLevel(-1)}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Move level down"
          title="Move level down"
          disabled={index >= levels.length - 1}
          onClick={() => onMoveLevel(1)}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Delete level"
          title="Delete level"
          disabled={levels.length <= 1}
          onClick={onDeleteLevel}
          className={`${ICON_BUTTON_CLASS} text-ui-danger`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {active && (
        <label className="flex flex-col gap-0.5">
          <span>Name</span>
          <input
            type="text"
            aria-label="Level name"
            value={active.name}
            onChange={(e) =>
              onModifyMap(
                (draft) => withLevel(draft, active.id, (l) => { l.name = e.target.value; }),
                { coalesce: `level-name-${active.id}` }
              )
            }
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
            }}
            className={FIELD_CLASS}
          />
        </label>
      )}
    </Section>
  );
};

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

// Properties panel docked to the right of the canvas: tool and selection options, levels and layers
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
  shapeMode,
  onShapeModeChange,
  selection,
  onClearSelection,
  onDuplicate,
  onCopy,
  mapData,
  levels,
  activeLevelId,
  onSelectLevel,
  onAddLevel,
  onDeleteLevel,
  onMoveLevel,
  onTakeStairs,
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
    activeTool === 'path' ||
    activeTool === 'water' ||
    activeTool === 'foliage' ||
    activeTool === 'eraser';

  // On a hex grid the room brush and eraser work in whole hexes
  const hexBrush = isHexGrid(mapData.gridType) && (activeTool === 'room-brush' || activeTool === 'eraser');
  const brushWidth = 2 * brushSize - 1;
  const shapeHint: Partial<Record<ToolType, string>> = {
    polygon:
      'Click to place corners. Click the first corner, double-click or press Enter to finish. Backspace takes back a corner, Esc cancels.',
    circle: 'Drag from the centre out to the edge.',
    path: 'Click points along the way; double-click or press Enter to finish. Backspace takes back a point, Esc cancels.',
  };

  return (
    <aside aria-label="Properties" className="w-64 shrink-0 bg-ui border-l border-ui-border overflow-y-auto text-ui-text">
      <Section title={toolLabel}>
        {shapeHint[activeTool] && (
          <>
            <Choices label="Mode" options={['add', 'cut'] as ShapeMode[]} value={shapeMode} columns={2} onChange={onShapeModeChange} />
            <p className="text-ui-muted leading-snug">
              {shapeHint[activeTool]} Points snap to the grid; hold Shift to place them freely.
            </p>
          </>
        )}
        {activeTool === 'label' && (
          <Choices label="New labels" options={LABEL_STYLES} value={labelStyle} columns={3} onChange={onLabelStyleChange} />
        )}
        {keepsSelection(activeTool) && (
          <SelectionInspector
            mapData={mapData}
            levels={levels}
            activeLevelId={activeLevelId}
            onTakeStairs={onTakeStairs}
            selection={selection}
            // Room numbers fill themselves in, so keep clicking instead of typing
            focusLabelText={activeTool === 'label' && labelStyle === 'text'}
            hint={
              activeTool === 'label'
                ? labelStyle === 'text'
                  ? 'Click the map to place a label, or click a label to edit or drag it.'
                  : 'Click the map to place the next room number (1, 2, 3...).'
                : activeTool === 'light'
                  ? 'Click the map to place a light, or click a light to edit or drag it. Torch props shine too.'
                  : undefined
            }
            onModifyMap={onModifyMap}
            onClearSelection={onClearSelection}
            onDuplicate={onDuplicate}
            onCopy={onCopy}
          />
        )}

        {usesBrushSize && (
          <Slider
            label={activeTool === 'path' ? 'Path width' : 'Brush size'}
            value={brushSize}
            display={
              activeTool === 'path'
                ? `${brushSize} ${brushSize === 1 ? 'cell' : 'cells'}`
                : hexBrush
                  ? `${brushWidth} ${brushWidth === 1 ? 'hex' : 'hexes'} across`
                  : `${brushSize}×${brushSize}`
            }
            min={1}
            max={5}
            onChange={onBrushSizeChange}
          />
        )}

        {hexBrush && (
          <p className="text-ui-muted leading-snug">
            {activeTool === 'eraser' ? 'Erases' : 'Paints floor in'} whole hexes on the hex grid.
          </p>
        )}
        {laysFloor(activeTool, shapeMode) && (
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

      <LevelsSection
        levels={levels}
        activeLevelId={activeLevelId}
        onSelectLevel={onSelectLevel}
        onAddLevel={onAddLevel}
        onDeleteLevel={onDeleteLevel}
        onMoveLevel={onMoveLevel}
        onModifyMap={onModifyMap}
      />

      <LayersSection
        mapData={mapData}
        onModifyMap={onModifyMap}
        activeLayerId={activeLayerId}
        onSelectLayer={onSelectLayer}
        onAddLayer={onAddLayer}
        onDeleteLayer={onDeleteLayer}
        onMoveLayer={onMoveLayer}
      />
    </aside>
  );
};
