import React from 'react';
import type { ToolType } from '../types/map';
import type { ToolboxPosition } from '../core/preferences';
import { TOOLS } from './options';

interface ToolboxProps {
  activeTool: ToolType;
  onSelectTool: (tool: ToolType) => void;
  position: ToolboxPosition;
}

// Strip of drawing tools docked to the left of the canvas, or in a row above it
export const Toolbox: React.FC<ToolboxProps> = ({ activeTool, onSelectTool, position }) => (
  <aside
    role="toolbar"
    aria-label="Tools"
    aria-orientation={position === 'top' ? 'horizontal' : 'vertical'}
    className={`flex gap-0.5 p-1 bg-ui border-ui-border ${
      position === 'top' ? 'flex-row flex-wrap border-b' : 'flex-col border-r'
    }`}
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
          <Icon className="w-[1.4rem] h-[1.4rem]" strokeWidth={1.75} />
        </button>
      );
    })}
  </aside>
);
