// Theme palette definitions for Cartographer
import type { ThemeType } from '../types/map';

export interface ThemeColors {
  bg: string;
  floor: string;
  grid: string;
  ink: string;
  hatch: string;
  waterTint: string;
  waterRipples: string;
  foliageFill: string;
  foliageInk: string;
  propFill: string;
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
    foliageFill: 'rgba(0, 0, 0, 0.05)',
    foliageInk: '#000000',
    propFill: '#ffffff',
  },
};
