// Shared option lists and styles for the toolbox, menus and panels
import type { LucideIcon } from 'lucide-react';
import {
  DoorOpen,
  Eraser,
  Footprints,
  Lightbulb,
  Milestone,
  MousePointer2,
  Paintbrush,
  Sparkles,
  Square,
  Trees,
  Type,
  Waves,
} from 'lucide-react';
import type {
  DoorType,
  FloorTexture,
  HatchStyle,
  LabelStyle,
  PlacedStairs,
  PropType,
  ThemeType,
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
  { id: 'water', label: 'Water', icon: Waves, shortcut: 'W' },
  { id: 'foliage', label: 'Foliage & Terrain', icon: Trees, shortcut: 'F' },
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

export const THEME_NAMES: [ThemeType, string][] = [
  ['parchment', 'Parchment'],
  ['blueprint', 'Blueprint'],
  ['slate', 'Dark Slate'],
  ['monochrome', 'Monochrome Ink'],
];

export const FLOOR_TEXTURES: FloorTexture[] = ['plain', 'flagstones', 'planks', 'cobbles', 'tiles', 'dirt'];
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
