import React from 'react';
import type { ToolType } from '../types/map';
import {
  Paintbrush,
  Square,
  Milestone,
  Waves,
  Trees,
  DoorOpen,
  Footprints,
  Sparkles,
  Eraser,
  MousePointer2,
} from 'lucide-react';

interface ToolbarProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
}

interface ToolItem {
  id: ToolType;
  label: string;
  icon: React.ReactNode;
  shortcut: string;
}

export const Toolbar: React.FC<ToolbarProps> = ({ activeTool, onSelectTool }) => {
  const tools: ToolItem[] = [
    {
      id: 'select',
      label: 'Select / Move',
      icon: <MousePointer2 className="w-5 h-5" />,
      shortcut: 'V',
    },
    {
      id: 'room-brush',
      label: 'Room Brush',
      icon: <Paintbrush className="w-5 h-5" />,
      shortcut: 'B',
    },
    {
      id: 'room-rect',
      label: 'Rectangle Room',
      icon: <Square className="w-5 h-5" />,
      shortcut: 'R',
    },
    {
      id: 'tunnel',
      label: 'Corridor / Tunnel',
      icon: <Milestone className="w-5 h-5" />,
      shortcut: 'T',
    },
    {
      id: 'water',
      label: 'Water',
      icon: <Waves className="w-5 h-5 text-sky-400" />,
      shortcut: 'W',
    },
    {
      id: 'foliage',
      label: 'Foliage & Terrain',
      icon: <Trees className="w-5 h-5 text-emerald-400" />,
      shortcut: 'F',
    },
    {
      id: 'door',
      label: 'Door / Portal',
      icon: <DoorOpen className="w-5 h-5" />,
      shortcut: 'D',
    },
    {
      id: 'stairs',
      label: 'Stairs',
      icon: <Footprints className="w-5 h-5" />,
      shortcut: 'S',
    },
    {
      id: 'prop',
      label: 'Dungeon Props',
      icon: <Sparkles className="w-5 h-5 text-amber-400" />,
      shortcut: 'P',
    },
    {
      id: 'eraser',
      label: 'Eraser',
      icon: <Eraser className="w-5 h-5 text-red-400" />,
      shortcut: 'E',
    },
  ];

  return (
    <aside className="absolute left-4 top-20 z-10 flex flex-col gap-1.5 bg-[#231b17]/95 backdrop-blur-md p-2 rounded-xl border border-[#3d3129] shadow-xl text-[#e8dfcf]">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            onClick={() => onSelectTool(tool.id)}
            title={`${tool.label} (${tool.shortcut})`}
            className={`group relative p-2.5 rounded-lg transition flex items-center justify-center ${
              isActive
                ? 'bg-[#8b3a2b] text-white shadow-inner ring-1 ring-[#c2513d]'
                : 'hover:bg-[#342923] text-[#bdae9c] hover:text-white'
            }`}
          >
            {tool.icon}
            {/* Tooltip */}
            <span className="absolute left-full ml-3 px-2 py-1 bg-[#1a1411] text-[#f2ebd9] text-xs font-sans rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150 border border-[#3d3129] flex items-center gap-1.5">
              <span>{tool.label}</span>
              <kbd className="px-1 py-0.5 bg-[#2c221e] text-[10px] text-[#d4af37] font-mono rounded">
                {tool.shortcut}
              </kbd>
            </span>
          </button>
        );
      })}
    </aside>
  );
};
