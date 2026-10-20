// Text labels: room names, numbers and notes drawn on the map
import type { PlacedLabel } from '../../types/map';

const LABEL_FONT_FAMILY = '"Crimson Pro", Georgia, serif';

function labelFont(label: PlacedLabel): string {
  return `600 ${label.size}px ${LABEL_FONT_FAMILY}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;

/** Label size in map pixels, for hit testing and selection outlines */
export function measureLabel(label: PlacedLabel): { width: number; height: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return { width: label.text.length * label.size * 0.5, height: label.size };
  measureCtx.font = labelFont(label);
  return { width: measureCtx.measureText(label.text).width, height: label.size * 1.1 };
}

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  label: PlacedLabel,
  gridSize: number,
  inkColor: string,
  haloColor: string
) {
  if (!label.text) return;
  ctx.save();
  ctx.font = labelFont(label);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = label.x * gridSize;
  const y = label.y * gridSize;

  // Halo in the background colour keeps text legible over hatching and grid
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, label.size * 0.22);
  ctx.strokeStyle = haloColor;
  ctx.strokeText(label.text, x, y);
  ctx.fillStyle = inkColor;
  ctx.fillText(label.text, x, y);
  ctx.restore();
}
