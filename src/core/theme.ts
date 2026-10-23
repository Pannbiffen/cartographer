// Theme palette definitions for Cartographer
import type { FloorTexture, PropType, ThemeType } from '../types/map';

// Colour is a property of the style for now: a style may colour floors by
// texture and props by type (#69). A later choice per map, texture or room
// would override `textureColors` and `propColor`, so floors are saved as
// textures either way and the file format stays as it is.
export interface TextureColors {
  fill: string; // laid under the pattern
  ink: string; // the pattern's lines
}

export interface ThemeColors {
  bg: string;
  floor: string;
  grid: string;
  ink: string;
  hatch: string;
  waterTint: string;
  waterRipples: string;
  lava: string; // solid, like solid water
  lavaCrust: string; // its edge lines
  foliageFill: string;
  foliageInk: string;
  propFill: string; // doors
  // Missing: floors are `floor` with patterns in `ink`, props paper-white
  textures?: Partial<Record<FloorTexture, TextureColors>>;
  props?: Partial<Record<PropType, string>>;
}

export const THEMES: Record<ThemeType, ThemeColors> = {
  parchment: {
    bg: '#f2e8d3',
    floor: '#fcf8ec',
    grid: 'rgb(92, 70, 52)',
    ink: '#1e1611',
    hatch: '#2a1f18',
    waterTint: 'rgba(88, 148, 162, 0.38)',
    waterRipples: '#225360',
    lava: '#d9572b',
    lavaCrust: '#7a1f0c',
    foliageFill: 'rgba(92, 128, 80, 0.32)',
    foliageInk: '#1e1611',
    propFill: '#fcf8ec',
  },
  blueprint: {
    bg: '#143862',
    floor: '#1b4a7d',
    grid: '#ffffff',
    ink: '#f0f6ff',
    hatch: '#d8e8fc',
    waterTint: 'rgba(10, 60, 110, 0.55)',
    waterRipples: '#99cbff',
    lava: '#c4502e',
    lavaCrust: '#ffd08a',
    foliageFill: 'rgba(30, 95, 80, 0.45)',
    foliageInk: '#f0f6ff',
    propFill: '#1b4a7d',
  },
  slate: {
    bg: '#1b1d22',
    floor: '#262930',
    grid: '#ffffff',
    ink: '#e2e5eb',
    hatch: '#8f96a3',
    waterTint: 'rgba(40, 85, 105, 0.42)',
    waterRipples: '#6db8d6',
    lava: '#c2421c',
    lavaCrust: '#ffb347',
    foliageFill: 'rgba(52, 85, 62, 0.4)',
    foliageInk: '#e2e5eb',
    propFill: '#262930',
  },
  monochrome: {
    bg: '#ffffff',
    floor: '#ffffff',
    grid: '#000000',
    ink: '#000000',
    hatch: '#000000',
    waterTint: 'rgba(0, 0, 0, 0.08)',
    waterRipples: '#000000',
    lava: '#4a4a4a',
    lavaCrust: '#ffffff',
    foliageFill: 'rgba(0, 0, 0, 0.05)',
    foliageInk: '#000000',
    propFill: '#ffffff',
  },
  colour: {
    bg: '#d8cfbb',
    floor: '#efe7d4',
    grid: 'rgb(70, 56, 44)',
    ink: '#2a221b',
    hatch: '#3d342a',
    waterTint: 'rgba(52, 120, 168, 0.6)',
    waterRipples: '#d6eef8',
    lava: '#e0521f',
    lavaCrust: '#ffcc4d',
    foliageFill: 'rgba(76, 128, 62, 0.85)',
    foliageInk: '#24301c',
    propFill: '#9c6b3e',
    textures: {
      tiles: { fill: '#c98e6a', ink: '#6e3d24' },
      planks: { fill: '#b4824f', ink: '#5a3a1c' },
      flagstones: { fill: '#a8a399', ink: '#4a463f' },
      cobbles: { fill: '#9a958c', ink: '#45413a' },
      dirt: { fill: '#9c7a52', ink: '#4e3a22' },
      grass: { fill: '#86a95a', ink: '#3c5a24' },
      sand: { fill: '#e2cc92', ink: '#8a7040' },
      carpet: { fill: '#9e3f3c', ink: '#e2b46a' },
      slabs: { fill: '#b5aea2', ink: '#4f4a42' },
      marble: { fill: '#e6e2da', ink: '#7d7870' },
    },
    props: {
      pillar: '#bdb7ab',
      chest: '#a8743f',
      table: '#b4824f',
      altar: '#c9c3b6',
      barrel: '#9c6b3e',
      sarcophagus: '#a9a398',
    },
  },
};

/** A floor texture's fill (none: the floor shows through) and line colour in a style */
export const textureColors = (theme: ThemeColors, texture: FloorTexture): Partial<TextureColors> & { ink: string } =>
  theme.textures?.[texture] ?? { ink: theme.ink };

/** A prop's fill in a style */
export const propColor = (theme: ThemeColors, type: PropType) => theme.props?.[type] ?? '#f8f4e6';
