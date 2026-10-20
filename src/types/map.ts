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
  | 'eraser';

export type DoorType = 'standard' | 'double' | 'secret' | 'portcullis' | 'archway';

export type PropType = 'pillar' | 'chest' | 'table' | 'altar' | 'torch' | 'barrel' | 'sarcophagus';

export type FoliageType = 'tree' | 'bush' | 'rock';

export type ThemeType = 'parchment' | 'blueprint' | 'slate' | 'monochrome';

export type SelectableKind = 'door' | 'stairs' | 'prop';

export interface Selection {
  kind: SelectableKind;
  id: string;
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

export interface MapData {
  version: number;
  title: string;
  gridSize: number; // pixels per grid cell (e.g. 40)
  theme: ThemeType;
  showGrid: boolean;
  gridOpacity: number;
  hatchDensity: number; // 1 to 5
  hatchLength: number; // pixels
  rooms: { [key: string]: boolean }; // "x,y" => true for carved floor cells
  water: { [key: string]: boolean }; // "x,y" => true for water cells
  foliage: { [key: string]: { type: FoliageType; seed: number } }; // "x,y"
  doors: PlacedDoor[];
  stairs: PlacedStairs[];
  props: PlacedProp[];
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
