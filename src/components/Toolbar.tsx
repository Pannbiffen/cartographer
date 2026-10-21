import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Download,
  FilePlus,
  FolderOpen,
  Maximize,
  Redo2,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { formatShortcut } from '../core/keyboard';

interface ToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  zoom: number;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onActualSize: () => void;
  onZoomToFit: () => void;
}

interface ToolbarButtonProps {
  icon: LucideIcon;
  label: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  showLabel?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({
  icon: Icon,
  label,
  title,
  onClick,
  disabled,
  showLabel,
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    aria-label={label}
    className="flex items-center gap-1.5 h-7 px-1.5 rounded-sm border border-transparent text-ui-text enabled:hover:border-ui-border enabled:hover:bg-ui-raised enabled:active:bg-ui-sunken disabled:opacity-40"
  >
    <Icon className="w-4 h-4" strokeWidth={1.75} />
    {showLabel && <span>{label}</span>}
  </button>
);

const Separator = () => <div className="mx-1 h-5 w-px bg-ui-border" />;

// Main toolbar with the most used File, Edit and View actions
export const Toolbar: React.FC<ToolbarProps> = (props) => (
  <div role="toolbar" aria-label="Main toolbar" className="flex h-9 items-center gap-0.5 bg-ui border-b border-ui-border px-1.5">
    <ToolbarButton icon={FilePlus} label="New" title={`New map (${formatShortcut('Ctrl+Alt+N')})`} onClick={props.onNew} />
    <ToolbarButton icon={FolderOpen} label="Open" title={`Open project (${formatShortcut('Ctrl+O')})`} onClick={props.onOpen} showLabel />
    <ToolbarButton icon={Save} label="Save" title={`Save project (${formatShortcut('Ctrl+S')})`} onClick={props.onSave} showLabel />
    <ToolbarButton icon={Download} label="Export" title={`Export image, PDF or VTT (${formatShortcut('Ctrl+E')})`} onClick={props.onExport} showLabel />
    <Separator />
    <ToolbarButton icon={Undo2} label="Undo" title={`Undo (${formatShortcut('Ctrl+Z')})`} onClick={props.onUndo} disabled={!props.canUndo} />
    <ToolbarButton icon={Redo2} label="Redo" title={`Redo (${formatShortcut('Ctrl+Y')})`} onClick={props.onRedo} disabled={!props.canRedo} />
    <Separator />
    <ToolbarButton icon={ZoomOut} label="Zoom out" title="Zoom out (-)" onClick={props.onZoomOut} />
    <button
      onClick={props.onActualSize}
      title={`Actual size (${formatShortcut('Ctrl+1')})`}
      className="h-7 min-w-12 px-1 rounded-sm border border-transparent text-ui-text tabular-nums hover:border-ui-border hover:bg-ui-raised"
    >
      {Math.round(props.zoom * 100)}%
    </button>
    <ToolbarButton icon={ZoomIn} label="Zoom in" title="Zoom in (+)" onClick={props.onZoomIn} />
    <ToolbarButton icon={Maximize} label="Zoom to fit" title={`Zoom to fit (${formatShortcut('Ctrl+0')})`} onClick={props.onZoomToFit} />
  </div>
);
