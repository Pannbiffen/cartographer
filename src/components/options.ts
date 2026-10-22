// Shared option lists and styles for the toolbox, menus and panels
import type { LucideIcon } from 'lucide-react';
import {
  BrickWall,
  DoorOpen,
  Eraser,
  Footprints,
  Circle,
  Lightbulb,
  Milestone,
  MousePointer2,
  Paintbrush,
  Pentagon,
  PaintBucket,
  Spline,
  Sparkles,
  Square,
  Trees,
  Type,
  Waves,
} from 'lucide-react';
import type {
  DoorType,
  FloorTexture,
  GridType,
  HatchStyle,
  LabelStyle,
  PlacedStairs,
  PropType,
  ThemeType,
  ShapeMode,
  ToolType,
  WallStyle,
} from '../types/map';

export interface ToolInfo {
  id: ToolType;
  label: string;
  icon: LucideIcon;
  shortcut: string;
}

export const TOOLS: ToolInfo[] = [
  { id: 'select', label: 'Select / Move', icon: MousePointer2, shortcut: 'V' },
  { id: 'room-brush', label: 'Room Brush', icon: Paintbrush, shortcut: 'B' },
  { id: 'room-rect', label: 'Rectangle Room', icon: Square, shortcut: 'R' },
  { id: 'tunnel', label: 'Corridor / Tunnel', icon: Milestone, shortcut: 'T' },
  { id: 'polygon', label: 'Polygon Room', icon: Pentagon, shortcut: 'N' },
  { id: 'circle', label: 'Circle Room', icon: Circle, shortcut: 'C' },
  { id: 'path', label: 'Free Path', icon: Spline, shortcut: 'H' },
  { id: 'fill', label: 'Fill Room', icon: PaintBucket, shortcut: 'K' },
  { id: 'water', label: 'Water', icon: Waves, shortcut: 'W' },
  { id: 'foliage', label: 'Foliage & Terrain', icon: Trees, shortcut: 'F' },
  { id: 'wall', label: 'Wall', icon: BrickWall, shortcut: 'A' },
  { id: 'door', label: 'Door / Portal', icon: DoorOpen, shortcut: 'D' },
  { id: 'stairs', label: 'Stairs', icon: Footprints, shortcut: 'S' },
  { id: 'prop', label: 'Dungeon Props', icon: Sparkles, shortcut: 'P' },
  { id: 'label', label: 'Text Label', icon: Type, shortcut: 'L' },
  { id: 'light', label: 'Light', icon: Lightbulb, shortcut: 'I' },
  { id: 'eraser', label: 'Eraser', icon: Eraser, shortcut: 'E' },
];

/** Tools that keep, and edit, the current selection */
export function keepsSelection(tool: ToolType): boolean {
  return tool === 'select' || tool === 'label' || tool === 'light';
}

/** Tools that lay floor (or re-texture it), in the floor texture picked in the panel */
export function laysFloor(tool: ToolType, shapeMode: ShapeMode): boolean {
  if (tool === 'polygon' || tool === 'circle' || tool === 'path') return shapeMode === 'add';
  // Walls that close off an area make it a room
  return tool === 'room-brush' || tool === 'room-rect' || tool === 'tunnel' || tool === 'fill' || tool === 'wall';
}

export const THEME_NAMES: [ThemeType, string][] = [
  ['parchment', 'Parchment'],
  ['blueprint', 'Blueprint'],
  ['slate', 'Dark Slate'],
  ['monochrome', 'Monochrome Ink'],
];

export const FLOOR_TEXTURES: FloorTexture[] = [
  'plain',
  'flagstones',
  'slabs',
  'planks',
  'cobbles',
  'tiles',
  'marble',
  'carpet',
  'dirt',
  'sand',
  'grass',
];
// An outdoor map's ground texture, or 'indoor' for blank paper
export type GroundChoice = FloorTexture | 'indoor';
export const GROUND_CHOICES: [GroundChoice, string][] = [
  ['indoor', 'None (indoor map)'],
  ...FLOOR_TEXTURES.filter((t) => t !== 'plain').map((t): [GroundChoice, string] => [t, `${t.charAt(0).toUpperCase() + t.slice(1)} (outdoor)`]),
];
export function groundChoice(look: { outdoor: boolean; ground: FloorTexture }): GroundChoice {
  return look.outdoor ? look.ground : 'indoor';
}
/** The `outdoor` and `ground` settings for a ground choice (indoor keeps the last ground) */
export function groundSettings(choice: GroundChoice): { outdoor: boolean; ground?: FloorTexture } {
  return choice === 'indoor' ? { outdoor: false } : { outdoor: true, ground: choice };
}
export const HATCH_STYLES: [HatchStyle, string][] = [
  ['dyson', 'Pen strokes'],
  ['crosshatch', 'Crosshatch'],
  ['stipple', 'Stipple'],
  ['shadow', 'Soft shadow'],
  ['none', 'None'],
];
export const WALL_STYLES: [WallStyle, string][] = [
  ['bold', 'Bold ink'],
  ['fine', 'Fine ink'],
  ['rough', 'Rough pen'],
];

export const GRID_TYPES: [GridType, string][] = [
  ['square', 'Square'],
  ['hex-pointy', 'Hex, pointy top'],
  ['hex-flat', 'Hex, flat top'],
];

export const DOOR_TYPES: DoorType[] = ['standard', 'double', 'secret', 'portcullis', 'archway'];
export const PROP_TYPES: PropType[] = [
  'pillar',
  'chest',
  'table',
  'altar',
  'torch',
  'barrel',
  'sarcophagus',
];
export const LABEL_SIZES: [string, number][] = [
  ['small', 14],
  ['medium', 20],
  ['large', 30],
];
export const LABEL_STYLES: LabelStyle[] = ['text', 'circle', 'box'];
export const STAIR_DIRECTIONS: PlacedStairs['direction'][] = ['up', 'down', 'left', 'right'];

// A plain push button
export const BUTTON_CLASS =
  'px-2 py-1 rounded-sm border border-ui-border bg-ui-raised text-ui-text hover:bg-ui-hover active:bg-ui-sunken disabled:opacity-50 disabled:hover:bg-ui-raised';

// A text field, number field or drop-down
export const FIELD_CLASS =
  'bg-ui-field border border-ui-border rounded-sm px-1.5 py-0.5 text-ui-text outline-none focus:border-ui-accent';

// A toggle button in a group of mutually exclusive choices
export function optionButtonClass(active: boolean): string {
  return `px-2 py-1 rounded-sm capitalize border ${
    active
      ? 'bg-ui-accent border-ui-accent-dark text-white'
      : 'bg-ui-raised border-ui-border text-ui-text hover:bg-ui-hover'
  }`;
}
