export type ToolType =
  | 'select'
  | 'room-brush' 
  | 'room-rect' 
  | 'tunnel' 
  | 'water' 
  | 'foliage' 
  | 'door' 
  | 'stairs' 
  | 'prop' 
  | 'label'
  | 'eraser';

export type DoorType = 'standard' | 'double' | 'secret' | 'portcullis' | 'archway';

export type PropType = 'pillar' | 'chest' | 'table' | 'altar' | 'torch' | 'barrel' | 'sarcophagus';

export type FoliageType = 'tree' | 'bush' | 'rock';

export type ThemeType = 'parchment' | 'blueprint' | 'slate' | 'monochrome';

export type FloorTexture = 'plain' | 'flagstones' | 'planks' | 'cobbles' | 'tiles' | 'dirt';

// How the rock outside the walls is shaded
export type HatchStyle = 'dyson' | 'crosshatch' | 'stipple' | 'shadow' | 'none';

export type WallStyle = 'bold' | 'fine' | 'rough';

// Plain text, or a room number keyed in a circle or box
export type LabelStyle = 'text' | 'circle' | 'box';

export type SelectableKind = 'door' | 'stairs' | 'prop' | 'label';

export interface Selection {
  kind: SelectableKind;
  id: string;
  layerId: string;
}

export interface GridCoord {
  x: number;
  y: number;
}

export interface PlacedDoor {
  id: string;
  x: number; // grid x
  y: number; // grid y
  orientation: 'horizontal' | 'vertical';
  type: DoorType;
}

export interface PlacedStairs {
  id: string;
  x: number; // grid x
  y: number; // grid y
  width: number;
  height: number;
  direction: 'up' | 'down' | 'left' | 'right';
  steps: number;
}

export interface PlacedProp {
  id: string;
  x: number; // grid x
  y: number; // grid y
  type: PropType;
  rotation: number; // 0, 90, 180, 270
}

export interface PlacedLabel {
  id: string;
  x: number; // centre in grid units (fractional, free placement)
  y: number;
  text: string;
  size: number; // font size in map pixels
  style?: LabelStyle; // missing in older maps: 'text'
}

/** Everything drawn on one layer */
export interface LayerContent {
  rooms: { [key: string]: boolean }; // "x,y" => true for carved floor cells
  floors: { [key: string]: FloorTexture }; // "x,y" => pattern on a floor cell; missing = plain
  water: { [key: string]: boolean }; // "x,y" => true for water cells
  foliage: { [key: string]: { type: FoliageType; seed: number } }; // "x,y"
  doors: PlacedDoor[];
  stairs: PlacedStairs[];
  props: PlacedProp[];
  labels: PlacedLabel[];
}

export interface MapLayer extends LayerContent {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean; // locked layers can't be drawn on or selected from
  opacity: number; // 0 to 1
}

export interface MapData {
  version: number; // 2 since layers; version 1 kept one layer's content at the top level
  title: string;
  gridSize: number; // pixels per grid cell (e.g. 40)
  theme: ThemeType;
  showGrid: boolean;
  gridOpacity: number;
  hatchDensity: number; // 1 to 5
  hatchLength: number; // pixels
  hatchStyle: HatchStyle;
  wallStyle: WallStyle;
  layers: MapLayer[]; // bottom to top; never empty
}

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface MapHistoryState {
  past: MapData[];
  present: MapData;
  future: MapData[];
}
