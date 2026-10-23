import React from 'react';
import type {
  ToolType,
  DoorType,
  PropType,
  FoliageType,
  FloorTexture,
  HatchStyle,
  LabelStyle,
  LevelMap,
  MapLayer,
  MapLevel,
  Selection,
  ShapeMode,
  WaterStyle,
} from '../types/map';
import { SelectionInspector } from './SelectionInspector';
import { Slider } from './Slider';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Dices, Eye, EyeOff, Lock, LockOpen, Plus, Trash2 } from 'lucide-react';
import {
  DOOR_TYPES,
  BUTTON_CLASS,
  FIELD_CLASS,
  FLOOR_TEXTURES,
  HATCH_STYLES,
  LABEL_STYLES,
  PROP_TYPES,
  TOOLS,
  WATER_STYLES,
  keepsSelection,
  laysFloor,
  optionButtonClass,
} from './options';
import type { ModifyMap } from '../App';
import { findLayer, layerHatching, withLayer } from '../core/layers';
import { withLevel } from '../core/levels';
import type { Preferences } from '../core/preferences';
import { isHexGrid } from '../core/geometry/hex';
import type { RiverSettings } from '../core/geometry/river';

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
  paintTexture: FloorTexture;
  onPaintTextureChange: (texture: FloorTexture) => void;
  labelStyle: LabelStyle;
  onLabelStyleChange: (style: LabelStyle) => void;
  shapeMode: ShapeMode;
  onShapeModeChange: (mode: ShapeMode) => void;
  river: RiverSettings;
  onRiverChange: (river: RiverSettings) => void;
  waterStyle: WaterStyle;
  onWaterStyleChange: (style: WaterStyle) => void;
  selection: Selection[];
  onClearSelection: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  // The active level, as drawn
  mapData: LevelMap;
  levels: MapLevel[];
  activeLevelId: string;
  onSelectLevel: (id: string) => void;
  onAddLevel: (where: 'above' | 'below') => void;
  onDeleteLevel: () => void;
  onMoveLevel: (delta: 1 | -1) => void;
  // Which sections show, and the levels below drawn faintly under the active one
  preferences: Pick<Preferences, PanelSetting>;
  onPreferencesChange: (change: Partial<Pick<Preferences, PanelSetting>>) => void;
  onTakeStairs: (stairs: Selection) => void;
  onModifyMap: ModifyMap;
  activeLayerId: string;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onDeleteLayer: () => void;
  onMoveLayer: (delta: 1 | -1) => void;
}

// A titled part of the panel; given `onToggle`, its header folds it away and back
const Section: React.FC<{ title: string; open?: boolean; onToggle?: () => void; children: React.ReactNode }> = ({
  title,
  open = true,
  onToggle,
  children,
}) => (
  <section className="border-b border-ui-border">
    <h2 className={`bg-ui-sunken font-semibold text-ui-text ${open ? 'border-b border-ui-border' : ''}`}>
      {onToggle ? (
        <button
          type="button"
          aria-expanded={open}
          title={`${open ? 'Fold' : 'Unfold'} ${title.toLowerCase()}`}
          onClick={onToggle}
          className="w-full flex items-center gap-1 px-2.5 py-1 text-left hover:bg-ui-hover"
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          {title}
        </button>
      ) : (
        <div className="px-2.5 py-1">{title}</div>
      )}
    </h2>
    {open && <div className="p-2.5 flex flex-col gap-2.5">{children}</div>}
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
        <button key={option} aria-pressed={value === option} onClick={() => onChange(option)} className={optionButtonClass(value === option)}>
          {option}
        </button>
      ))}
    </div>
  </div>
);

type PanelSetting =
  | 'showLevelsSection'
  | 'showLayersSection'
  | 'levelsOpen'
  | 'layersOpen'
  | 'showLevelBelow'
  | 'levelBelowOpacity'
  | 'showLevelsFurtherBelow'
  | 'levelBelowFade';

const ICON_BUTTON_CLASS = `${BUTTON_CLASS} flex items-center justify-center`;

// Level list (top level first, like floors seen from above), the active
// level's name, and the faint level below
const LevelsSection: React.FC<
  Pick<
    DockPanelProps,
    | 'levels'
    | 'activeLevelId'
    | 'onSelectLevel'
    | 'onAddLevel'
    | 'onDeleteLevel'
    | 'onMoveLevel'
    | 'onModifyMap'
    | 'preferences'
    | 'onPreferencesChange'
  >
> = ({
  levels,
  activeLevelId,
  onSelectLevel,
  onAddLevel,
  onDeleteLevel,
  onMoveLevel,
  onModifyMap,
  preferences,
  onPreferencesChange,
}) => {
  const { showLevelBelow, levelBelowOpacity, showLevelsFurtherBelow, levelBelowFade, levelsOpen } = preferences;
  const index = levels.findIndex((l) => l.id === activeLevelId);
  const active = levels[index];

  return (
    <Section title="Levels" open={levelsOpen} onToggle={() => onPreferencesChange({ levelsOpen: !levelsOpen })}>
      <ul aria-label="Levels" className="border border-ui-border rounded-sm bg-ui-field">
        {[...levels].reverse().map((level) => {
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

      <div className="grid grid-cols-2 gap-1">
        <button onClick={() => onAddLevel('above')} className={BUTTON_CLASS}>
          New above
        </button>
        <button onClick={() => onAddLevel('below')} className={BUTTON_CLASS}>
          New below
        </button>
      </div>
      <div className="grid grid-cols-3 gap-1">
        <button
          aria-label="Move level up"
          title="Move level up"
          disabled={index >= levels.length - 1}
          onClick={() => onMoveLevel(1)}
          className={ICON_BUTTON_CLASS}
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          aria-label="Move level down"
          title="Move level down"
          disabled={index <= 0}
          onClick={() => onMoveLevel(-1)}
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

      <label className={`flex items-center gap-2 ${levels.length < 2 ? 'text-ui-muted' : ''}`}>
        <input
          type="checkbox"
          checked={showLevelBelow}
          disabled={levels.length < 2}
          onChange={(e) => onPreferencesChange({ showLevelBelow: e.target.checked })}
          className="accent-ui-accent"
        />
        <span>Show level below</span>
      </label>
      {showLevelBelow && levels.length > 1 && (
        <Slider
          label="Level below opacity"
          value={levelBelowOpacity}
          display={`${Math.round(levelBelowOpacity * 100)}%`}
          min={0.1}
          max={0.8}
          step={0.05}
          onChange={(v) => onPreferencesChange({ levelBelowOpacity: v })}
        />
      )}
      {showLevelBelow && levels.length > 2 && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={showLevelsFurtherBelow}
            onChange={(e) => onPreferencesChange({ showLevelsFurtherBelow: e.target.checked })}
            className="accent-ui-accent"
          />
          <span>Show multiple levels below</span>
        </label>
      )}
      {showLevelBelow && showLevelsFurtherBelow && levels.length > 2 && (
        <Slider
          label="Fade per level"
          value={levelBelowFade}
          display={`-${Math.round(levelBelowFade * 100)}%`}
          min={0.05}
          max={0.5}
          step={0.05}
          onChange={(v) => onPreferencesChange({ levelBelowFade: v })}
        />
      )}
    </Section>
  );
};

// The active layer's hatching: the map's, or its own style, width and density
const LayerHatchingControls: React.FC<{
  mapData: LevelMap;
  layer: MapLayer;
  editLayer: (id: string, edit: (layer: MapLayer) => void, coalesce?: string) => void;
}> = ({ mapData, layer, editLayer }) => {
  const hatch = layerHatching(layer, mapData);
  const setStyle = (style: HatchStyle | 'map') =>
    editLayer(layer.id, (l) => {
      if (style === 'map') delete l.hatching;
      else l.hatching = { ...layerHatching(l, mapData), style };
    });
  return (
    <>
      <label className="flex flex-col gap-0.5">
        <span>Layer hatching</span>
        <select
          aria-label="Layer hatching"
          value={layer.hatching ? layer.hatching.style : 'map'}
          onChange={(e) => setStyle(e.target.value as HatchStyle | 'map')}
          className={FIELD_CLASS}
        >
          <option value="map">Map default</option>
          {HATCH_STYLES.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </label>
      {layer.hatching && hatch.style !== 'none' && (
        <>
          <Slider
            label="Layer hatching width"
            value={hatch.length}
            display={`${hatch.length}px`}
            min={6}
            max={24}
            onChange={(v) => editLayer(layer.id, (l) => { l.hatching = { ...layerHatching(l, mapData), length: v }; }, `layer-hatch-length-${layer.id}`)}
          />
          <Slider
            label="Layer hatching density"
            value={hatch.density}
            display={String(hatch.density)}
            min={1}
            max={5}
            onChange={(v) => editLayer(layer.id, (l) => { l.hatching = { ...layerHatching(l, mapData), density: v }; }, `layer-hatch-density-${layer.id}`)}
          />
        </>
      )}
    </>
  );
};

// Layer list (top layer first) with show/lock toggles, plus the active layer's settings
const LayersSection: React.FC<
  Pick<
    DockPanelProps,
    | 'mapData'
    | 'onModifyMap'
    | 'activeLayerId'
    | 'onSelectLayer'
    | 'onAddLayer'
    | 'onDeleteLayer'
    | 'onMoveLayer'
    | 'preferences'
    | 'onPreferencesChange'
  >
> = ({
  mapData,
  onModifyMap,
  activeLayerId,
  onSelectLayer,
  onAddLayer,
  onDeleteLayer,
  onMoveLayer,
  preferences: { layersOpen },
  onPreferencesChange,
}) => {
  const active = findLayer(mapData, activeLayerId);
  const index = active ? mapData.layers.indexOf(active) : -1;
  const editLayer = (id: string, edit: Parameters<typeof withLayer>[2], coalesce?: string) =>
    onModifyMap((draft) => withLayer(draft, id, edit), coalesce ? { coalesce } : undefined);

  return (
    <Section title="Layers" open={layersOpen} onToggle={() => onPreferencesChange({ layersOpen: !layersOpen })}>
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
          <LayerHatchingControls mapData={mapData} layer={active} editLayer={editLayer} />
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
  paintTexture,
  onPaintTextureChange,
  labelStyle,
  onLabelStyleChange,
  shapeMode,
  onShapeModeChange,
  river,
  onRiverChange,
  waterStyle,
  onWaterStyleChange,
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
  preferences,
  onPreferencesChange,
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
    activeTool === 'paint' ||
    activeTool === 'foliage' ||
    activeTool === 'eraser';

  // On a hex grid the room brush, paint and eraser work in whole hexes
  const hexBrush =
    isHexGrid(mapData.gridType) && (activeTool === 'room-brush' || activeTool === 'paint' || activeTool === 'eraser');
  const brushWidth = 2 * brushSize - 1;
  const shapeHint: Partial<Record<ToolType, string>> = {
    polygon:
      'Click to place corners. Click the first corner, double-click or press Enter to finish. Backspace takes back a corner, Esc cancels.',
    circle: 'Drag from the centre out to the edge.',
    path: 'Click points along the way; double-click or press Enter to finish. Backspace takes back a point, Esc cancels.',
    river:
      'Click points along the way; the river winds between them. Double-click or press Enter to finish, or click the first point to close a loop (a moat). Backspace takes back a point, Esc cancels.',
  };
  const cells = (n: number) => `${n} ${n === 1 ? 'cell' : 'cells'}`;

  return (
    <aside aria-label="Properties" className="w-64 shrink-0 bg-ui border-l border-ui-border overflow-y-auto text-ui-text">
      <Section title={toolLabel}>
        {shapeHint[activeTool] && (
          <>
            {activeTool !== 'river' && (
              <Choices label="Mode" options={['add', 'cut'] as ShapeMode[]} value={shapeMode} columns={2} onChange={onShapeModeChange} />
            )}
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

        {(activeTool === 'water' || activeTool === 'river') && (
          <>
            <Choices label="Water" options={WATER_STYLES} value={waterStyle} columns={2} onChange={onWaterStyleChange} />
            <p className="text-ui-muted leading-snug">
              Solid water hides the ground beneath; see-through water shows the floor through it. Right-click
              water to change it.
            </p>
          </>
        )}
        {activeTool === 'river' && (
          <>
            <Slider
              label="Narrowest"
              value={river.minWidth}
              display={cells(river.minWidth)}
              min={0.5}
              max={6}
              step={0.5}
              onChange={(minWidth) => onRiverChange({ ...river, minWidth, maxWidth: Math.max(minWidth, river.maxWidth) })}
            />
            <Slider
              label="Widest"
              value={river.maxWidth}
              display={cells(river.maxWidth)}
              min={0.5}
              max={6}
              step={0.5}
              onChange={(maxWidth) => onRiverChange({ ...river, maxWidth, minWidth: Math.min(maxWidth, river.minWidth) })}
            />
            <Slider
              label="Wander"
              value={river.wander}
              display={river.wander === 0 ? 'none' : cells(river.wander)}
              min={0}
              max={4}
              step={0.5}
              onChange={(wander) => onRiverChange({ ...river, wander })}
            />
            <label className="flex items-center gap-2">
              <span>Seed</span>
              <input
                type="number"
                min={1}
                value={river.seed}
                onChange={(e) => {
                  const seed = Math.round(Number(e.target.value));
                  if (Number.isFinite(seed)) onRiverChange({ ...river, seed });
                }}
                className={`${FIELD_CLASS} min-w-0 flex-1`}
              />
              <button
                aria-label="New seed"
                title="New seed: another river along the same points"
                onClick={() => onRiverChange({ ...river, seed: 1 + Math.floor(Math.random() * 9999) })}
                className={ICON_BUTTON_CLASS}
              >
                <Dices className="w-3.5 h-3.5" />
              </button>
            </label>
          </>
        )}

        {hexBrush && (
          <p className="text-ui-muted leading-snug">
            {activeTool === 'eraser' ? 'Erases' : activeTool === 'paint' ? 'Paints' : 'Paints floor in'} whole hexes on the hex grid.
          </p>
        )}
        {laysFloor(activeTool, shapeMode) && (
          <Choices label="Floor" options={FLOOR_TEXTURES} value={floorTexture} columns={2} onChange={onFloorTextureChange} />
        )}
        {activeTool === 'paint' && (
          <>
            <Choices label="Texture" options={FLOOR_TEXTURES} value={paintTexture} columns={2} onChange={onPaintTextureChange} />
            <p className="text-ui-muted leading-snug">
              Paints the ground without making a room: no walls, hatching or shadows. For a clearing, a muddy patch
              or a cobbled square. The eraser takes it away.
            </p>
          </>
        )}
        {activeTool === 'fill' && (
          <p className="text-ui-muted leading-snug">
            Click a room to lay this floor across it, up to its walls and doors (archways let it through).
          </p>
        )}

        {activeTool === 'wall' && (
          <p className="text-ui-muted leading-snug">
            Drag along the grid lines to draw walls; Shift+drag erases them. Walls that close off an area make
            it a room with this floor. A door placed on a wall opens it.
          </p>
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

      {preferences.showLevelsSection && (
        <LevelsSection
          levels={levels}
          activeLevelId={activeLevelId}
          onSelectLevel={onSelectLevel}
          onAddLevel={onAddLevel}
          onDeleteLevel={onDeleteLevel}
          onMoveLevel={onMoveLevel}
          onModifyMap={onModifyMap}
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
        />
      )}

      {preferences.showLayersSection && (
        <LayersSection
          mapData={mapData}
          onModifyMap={onModifyMap}
          activeLayerId={activeLayerId}
          onSelectLayer={onSelectLayer}
          onAddLayer={onAddLayer}
          onDeleteLayer={onDeleteLayer}
          onMoveLayer={onMoveLayer}
          preferences={preferences}
          onPreferencesChange={onPreferencesChange}
        />
      )}
    </aside>
  );
};
