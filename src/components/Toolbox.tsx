import React from 'react';
import type { ToolType } from '../types/map';
import { TOOLS } from './options';

interface ToolboxProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
}

// Vertical strip of drawing tools docked to the left of the canvas
export const Toolbox: React.FC<ToolboxProps> = ({ activeTool, onSelectTool }) => (
  <aside
    role="toolbar"
    aria-label="Tools"
    aria-orientation="vertical"
    className="flex flex-col gap-0.5 p-1 bg-ui border-r border-ui-border"
  >
    {TOOLS.map(({ id, label, icon: Icon, shortcut }) => {
      const isActive = activeTool === id;
      return (
        <button
          key={id}
          onClick={() => onSelectTool(id)}
          title={`${label} (${shortcut})`}
          aria-label={label}
          aria-pressed={isActive}
          className={`w-8 h-8 flex items-center justify-center rounded-sm border ${
            isActive
              ? 'bg-ui-accent border-ui-accent-dark text-white'
              : 'border-transparent text-ui-text hover:border-ui-border hover:bg-ui-raised'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.75} />
        </button>
      );
    })}
  </aside>
);
