// Shared option lists and styles for sidebar pickers
import type { DoorType, PlacedStairs, PropType } from '../types/map';

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
export const STAIR_DIRECTIONS: PlacedStairs['direction'][] = ['up', 'down', 'left', 'right'];

export function optionButtonClass(active: boolean): string {
  return `py-1.5 px-2 rounded capitalize border transition ${
    active
      ? 'bg-[#8b3a2b] border-[#c2513d] text-white font-medium'
      : 'bg-[#181310] border-[#3d3129] text-[#bdae9c] hover:bg-[#281f1a]'
  }`;
}
