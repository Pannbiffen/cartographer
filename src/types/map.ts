export type ToolType =
  | 'select'
  | 'room-brush' 
  | 'room-rect' 
  | 'tunnel' 
  | 'polygon'
  | 'circle'
  | 'path'
  | 'fill'
  | 'water' 
  | 'river'
  | 'paint'
  | 'road'
  | 'foliage' 
  | 'wall'
  | 'door' 
  | 'window'
  | 'stairs' 
  | 'prop' 
  | 'label'
  | 'light'
  | 'eraser';

export type DoorType = 'standard' | 'double' | 'secret' | 'portcullis' | 'archway';

export type PropType = 'pillar' | 'chest' | 'table' | 'altar' | 'torch' | 'barrel' | 'sarcophagus';

export type FoliageType = 'tree' | 'bush' | 'rock';

// The liquids the water tools lay: solid water hides the ground and floor
// beneath, see-through water tints them, and lava hides them like solid water
export type WaterStyle = 'solid' | 'see-through' | 'lava';

export type ThemeType = 'parchment' | 'blueprint' | 'slate' | 'monochrome' | 'colour';

export type FloorTexture =
  | 'plain'
  | 'flagstones'
  | 'planks'
  | 'cobbles'
  | 'tiles'
  | 'dirt'
  | 'grass'
  | 'sand'
  | 'carpet'
  | 'slabs'
  | 'marble';

// What fills the map behind and around the rooms: blank paper, black, or a
// dungeon or outdoor texture laid everywhere, with rooms drawn on it
export type Background = 'paper' | 'black' | 'rough-stone' | 'fitted-stone' | 'paving' | 'brick' | 'packed-earth' | 'dirt' | 'grass' | 'sand';
export type BackgroundTexture = Exclude<Background, 'paper' | 'black'>;

// How the rock outside the walls is shaded
export type HatchStyle = 'dyson' | 'crosshatch' | 'stipple' | 'shadow' | 'none';

// A layer's own hatching, in place of the map's `hatchStyle`, `hatchLength` and `hatchDensity`
export interface LayerHatching {
  style: HatchStyle;
  length: number; // pixels
  density: number; // 1 to 5
}

export type WallStyle = 'bold' | 'fine' | 'rough';

export type GridType = 'square' | 'hex-pointy' | 'hex-flat';

// Whether a free-form shape adds floor or carves it away
export type ShapeMode = 'add' | 'cut';

// What the fill tool floods a room with: a floor texture or a liquid
export type FillWith = 'floor' | 'liquid';

// Plain text, or a room number keyed in a circle or box
export type LabelStyle = 'text' | 'circle' | 'box';

export type SelectableKind = 'door' | 'window' | 'wall' | 'stairs' | 'prop' | 'label' | 'light';

export interface Selection {
  kind: SelectableKind;
  id: string;
  layerId: string;
}

/** A point in grid units */
export type Pair = [number, number];
/** A closed outline in grid units; the last point joins back to the first */
export type Ring = Pair[];
/** An outline followed by any holes in it */
export type Polygon = Ring[];

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
  /**
   * Set on a door along a wall off the grid lines (diagonal, curved or hex):
   * (x, y) is then its centre in grid units and `angle` the wall's direction
   * in degrees, 0 up to 180; `orientation` is unused
   */
  angle?: number;
  /** Its span along the wall in cells, when shorter than one (a hex edge) */
  length?: number;
}

/**
 * A pane on a cell edge, placed like a door. Light shines through it,
 * dimmed by `clarity` (0 lets none through, like a wall) and tinted by `tint`.
 */
export interface PlacedWindow {
  id: string;
  x: number; // grid x
  y: number; // grid y
  orientation: 'horizontal' | 'vertical';
  /** As on a door: set along a wall off the grid lines, with (x, y) its centre */
  angle?: number;
  /** As on a door: its span along the wall, when shorter than a cell */
  length?: number;
  tint: string; // #rrggbb
  clarity: number; // 0 to 1: how much of a light's strength passes
}

/**
 * A thin wall along one grid or hex edge, from corner (x, y) to corner
 * (x + dx, y + dy), in grid units. A door on the same edge opens it.
 */
export interface PlacedWall {
  id: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export interface PlacedStairs {
  id: string;
  x: number; // grid x
  y: number; // grid y
  width: number;
  height: number;
  direction: 'up' | 'down' | 'left' | 'right';
  steps: number;
  toLevel?: string; // id of the level these stairs lead to; missing (or a deleted level) means none
}

export interface PlacedProp {
  id: string;
  x: number; // grid x
  y: number; // grid y
  type: PropType;
  rotation: number; // 0, 90, 180, 270
  light?: LightSettings; // torches only; missing means the default torch light
}

export interface LightSettings {
  color: string; // #rrggbb
  radius: number; // in cells
  intensity: number; // 0 to 1: how much of the darkness it lifts at its centre
}

/** A light source on its own, shining from the centre of a cell */
export interface PlacedLight extends LightSettings {
  id: string;
  x: number; // grid x
  y: number; // grid y
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
  // Free-form floor (polygons, circles, paths, hexes) merged with the cells,
  // and areas carved back out of both. Replaced on edit, never mutated.
  shapes: Polygon[];
  cuts: Polygon[];
  floors: { [key: string]: FloorTexture }; // "x,y" => pattern on a floor cell; missing = plain
  // Free-form floor laid with a texture, by texture. These never overlap one
  // another and win over the cell textures beneath them ('plain' areas hide
  // those). Replaced on edit, never mutated.
  floorAreas: Partial<Record<FloorTexture, Polygon[]>>;
  water: { [key: string]: boolean }; // "x,y" => true for water cells
  // Free-form water (rivers) merged with the water cells. Replaced on edit, never mutated.
  waterAreas: Polygon[];
  // See-through water (a fountain showing the floor beneath), kept like the
  // solid water above and never overlapping it
  clearWater: { [key: string]: boolean };
  clearWaterAreas: Polygon[];
  // Lava, a third liquid kept the same way and never overlapping either water
  lava: { [key: string]: boolean };
  lavaAreas: Polygon[];
  // Texture laid on the ground without making floor: no walls, hatching or
  // effect on light. Cells by texture, and free-form areas by texture that
  // never overlap one another and win over the cells beneath them (the
  // areas are replaced on edit, never mutated)
  paint: { [key: string]: FloorTexture }; // "x,y"
  paintAreas: Partial<Record<FloorTexture, Polygon[]>>;
  foliage: { [key: string]: { type: FoliageType; seed: number } }; // "x,y"
  doors: PlacedDoor[];
  windows: PlacedWindow[];
  walls: PlacedWall[];
  stairs: PlacedStairs[];
  props: PlacedProp[];
  labels: PlacedLabel[];
  lights: PlacedLight[];
}

export interface MapLayer extends LayerContent {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean; // locked layers can't be drawn on or selected from
  opacity: number; // 0 to 1
  hatching?: LayerHatching; // missing: the map's hatching
}

/** Settings shared by every level of a map */
export interface MapSettings {
  version: number; // 4 since see-through water (older water loads see-through); 3 since levels; 2 kept one level's layers at the top level, 1 one layer's content
  title: string;
  gridSize: number; // pixels per grid cell (e.g. 40)
  theme: ThemeType;
  showGrid: boolean;
  gridType: GridType; // the hex grids span `gridSize` from flat side to flat side
  gridOpacity: number;
  hatchDensity: number; // 1 to 5
  hatchLength: number; // pixels
  hatchStyle: HatchStyle;
  wallStyle: WallStyle;
  background: Background;
  lighting: boolean; // darken the map so lights and torches show
  darkness: number; // 0 to 1, away from any light
}

/** One floor or area of a map: a dungeon level, a storey, a building's interior */
export interface MapLevel {
  id: string;
  name: string;
  layers: MapLayer[]; // bottom to top; never empty
}

/** A map as saved: its settings and its levels */
export interface MapData extends MapSettings {
  levels: MapLevel[]; // in the order listed; never empty
}

/** One level with the map's settings: what the canvas, tools and exports draw */
export interface LevelMap extends MapSettings {
  layers: MapLayer[];
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
