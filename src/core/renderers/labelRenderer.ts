// Text labels: room names, numbers and notes drawn on the map
import type { PlacedLabel } from '../../types/map';

const LABEL_FONT_FAMILY = '"Crimson Pro", Georgia, serif';

function labelFont(label: PlacedLabel): string {
  return `600 ${label.size}px ${LABEL_FONT_FAMILY}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;

function measureText(label: PlacedLabel): { width: number; height: number } {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return { width: label.text.length * label.size * 0.5, height: label.size };
  measureCtx.font = labelFont(label);
  return { width: measureCtx.measureText(label.text).width, height: label.size * 1.1 };
}

/** Half-size of a room-number marker's circle or box, in map pixels */
function markerHalfSize(label: PlacedLabel, textWidth: number): { w: number; h: number } {
  const pad = label.size * 0.3;
  if (label.style === 'circle') {
    const r = Math.max(textWidth / 2, label.size * 0.45) + pad;
    return { w: r, h: r };
  }
  return { w: Math.max(textWidth / 2, label.size * 0.4) + pad, h: label.size * 0.5 + pad };
}

/** Label size in map pixels, for hit testing and selection outlines */
export function measureLabel(label: PlacedLabel): { width: number; height: number } {
  const text = measureText(label);
  if (label.style !== 'circle' && label.style !== 'box') return text;
  const half = markerHalfSize(label, text.width);
  return { width: half.w * 2, height: half.h * 2 };
}

/** The number for the next room marker: one more than the highest so far */
export function nextRoomNumber(labels: PlacedLabel[]): number {
  let highest = 0;
  for (const label of labels) {
    if (label.style !== 'circle' && label.style !== 'box') continue;
    const n = parseInt(label.text, 10);
    if (Number.isFinite(n)) highest = Math.max(highest, n);
  }
  return highest + 1;
}

export function renderLabel(
  ctx: CanvasRenderingContext2D,
  label: PlacedLabel,
  gridSize: number,
  inkColor: string,
  haloColor: string
) {
  const marker = label.style === 'circle' || label.style === 'box';
  if (!label.text && !marker) return;
  ctx.save();
  ctx.font = labelFont(label);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const x = label.x * gridSize;
  const y = label.y * gridSize;

  if (marker) {
    // Room numbers sit in a filled circle or box outlined in ink
    const half = markerHalfSize(label, ctx.measureText(label.text).width);
    ctx.beginPath();
    if (label.style === 'circle') ctx.arc(x, y, half.w, 0, Math.PI * 2);
    else ctx.rect(x - half.w, y - half.h, half.w * 2, half.h * 2);
    ctx.fillStyle = haloColor;
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, label.size * 0.08);
    ctx.strokeStyle = inkColor;
    ctx.stroke();
  } else {
    // Halo in the background colour keeps text legible over hatching and grid
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, label.size * 0.22);
    ctx.strokeStyle = haloColor;
    ctx.strokeText(label.text, x, y);
  }
  ctx.fillStyle = inkColor;
  // Serif digits sit slightly high in their em box
  ctx.fillText(label.text, x, marker ? y + label.size * 0.05 : y);
  ctx.restore();
}
