// Renderer for doors, windows, stairs, and dungeon props
import type { PlacedDoor, PlacedStairs, PlacedProp, PlacedWindow } from '../../types/map';
import { doorLine } from '../tools/toolGeometry';

// How much of its cell edge a window's glass spans, centred on it; light passes only there
export const WINDOW_PANE_LENGTH = 0.7;

/** A pane along the wall line in its tint, with a line along the glass */
export function renderWindow(ctx: CanvasRenderingContext2D, pane: PlacedWindow, gridSize: number, inkColor: string) {
  // Drawn along the x axis of the window's own frame, turned with its wall
  const { cx, cy, ux, uy, length } = doorLine(pane);
  const w = gridSize * length * WINDOW_PANE_LENGTH;
  const h = 6;
  ctx.save();
  ctx.transform(ux, uy, -uy, ux, cx * gridSize, cy * gridSize);
  ctx.fillStyle = pane.tint;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 2;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-w / 2, 0);
  ctx.lineTo(w / 2, 0);
  ctx.stroke();
  ctx.restore();
}

export function renderDoor(
  ctx: CanvasRenderingContext2D,
  door: PlacedDoor,
  gridSize: number,
  inkColor: string = '#1e1713',
  fillColor: string = '#fcf8ec'
) {
  ctx.save();
  // Drawn along the x axis of the door's own frame: centred, one cell (or a hex side) long
  const { cx, cy, ux, uy, length } = doorLine(door);
  ctx.transform(ux, uy, -uy, ux, cx * gridSize, cy * gridSize);
  const half = (gridSize * length) / 2;

  ctx.fillStyle = fillColor;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 2;

  if (door.type === 'archway') {
    // Open passage: solid stone jambs at both ends, no door leaf
    const jamb = gridSize * length * 0.14;
    const depth = 10;
    ctx.fillStyle = inkColor;
    ctx.fillRect(-half, -depth / 2, jamb, depth);
    ctx.fillRect(half - jamb, -depth / 2, jamb, depth);
    ctx.restore();
    return;
  }

  const doorWidth = gridSize * length * 0.8;
  const doorHeight = 6;
  const startX = -doorWidth / 2;
  const startY = -doorHeight / 2;

  ctx.fillRect(startX, startY, doorWidth, doorHeight);
  ctx.strokeRect(startX, startY, doorWidth, doorHeight);

  if (door.type === 'secret') {
    // The letter stays upright however the door turns
    ctx.rotate(-Math.atan2(uy, ux));
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = inkColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', 0, 0);
  } else if (door.type === 'double') {
    ctx.beginPath();
    ctx.moveTo(0, startY);
    ctx.lineTo(0, startY + doorHeight);
    ctx.stroke();
  } else if (door.type === 'portcullis') {
    ctx.beginPath();
    for (let i = 1; i <= 4; i++) {
      const px = startX + (doorWidth / 5) * i;
      ctx.moveTo(px, startY);
      ctx.lineTo(px, startY + doorHeight);
    }
    ctx.stroke();
  }

  ctx.restore();
}

export function renderStairs(
  ctx: CanvasRenderingContext2D,
  stairs: PlacedStairs,
  gridSize: number,
  inkColor: string = '#1e1713',
  fillColor: string = '#fcf8ec'
) {
  ctx.save();
  const x = stairs.x * gridSize;
  const y = stairs.y * gridSize;
  const w = stairs.width * gridSize;
  const h = stairs.height * gridSize;

  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, w, h);

  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, w, h);

  const numSteps = Math.max(3, stairs.steps);

  ctx.beginPath();
  if (stairs.direction === 'up' || stairs.direction === 'down') {
    const stepH = h / numSteps;
    for (let i = 1; i < numSteps; i++) {
      ctx.moveTo(x, y + i * stepH);
      ctx.lineTo(x + w, y + i * stepH);
    }
  } else {
    const stepW = w / numSteps;
    for (let i = 1; i < numSteps; i++) {
      ctx.moveTo(x + i * stepW, y);
      ctx.lineTo(x + i * stepW, y + h);
    }
  }
  ctx.stroke();

  // Draw arrow indicating direction
  ctx.fillStyle = inkColor;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const arrowSize = 6;

  ctx.beginPath();
  if (stairs.direction === 'up') {
    ctx.moveTo(cx, cy - arrowSize);
    ctx.lineTo(cx - arrowSize, cy + arrowSize);
    ctx.lineTo(cx + arrowSize, cy + arrowSize);
  } else if (stairs.direction === 'down') {
    ctx.moveTo(cx, cy + arrowSize);
    ctx.lineTo(cx - arrowSize, cy - arrowSize);
    ctx.lineTo(cx + arrowSize, cy - arrowSize);
  } else if (stairs.direction === 'left') {
    ctx.moveTo(cx - arrowSize, cy);
    ctx.lineTo(cx + arrowSize, cy - arrowSize);
    ctx.lineTo(cx + arrowSize, cy + arrowSize);
  } else {
    ctx.moveTo(cx + arrowSize, cy);
    ctx.lineTo(cx - arrowSize, cy - arrowSize);
    ctx.lineTo(cx - arrowSize, cy + arrowSize);
  }
  ctx.fill();

  ctx.restore();
}

export function renderProp(
  ctx: CanvasRenderingContext2D,
  prop: PlacedProp,
  gridSize: number,
  inkColor: string = '#1e1713',
  fillColor: string = '#f8f4e6'
) {
  ctx.save();
  const cx = (prop.x + 0.5) * gridSize;
  const cy = (prop.y + 0.5) * gridSize;

  ctx.translate(cx, cy);
  ctx.rotate((prop.rotation * Math.PI) / 180);

  ctx.strokeStyle = inkColor;
  ctx.fillStyle = fillColor;
  ctx.lineWidth = 1.8;

  if (prop.type === 'pillar') {
    const r = gridSize * 0.32;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop.type === 'chest') {
    const w = gridSize * 0.6;
    const h = gridSize * 0.4;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Latch
    ctx.strokeRect(-2, -h / 2, 4, 3);
  } else if (prop.type === 'table') {
    const w = gridSize * 0.75;
    const h = gridSize * 0.45;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Wood grain lines
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -1);
    ctx.lineTo(w / 2 - 3, -1);
    ctx.stroke();
  } else if (prop.type === 'altar') {
    const w = gridSize * 0.7;
    const h = gridSize * 0.5;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Rune cross
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(0, 5);
    ctx.moveTo(-5, 0);
    ctx.lineTo(5, 0);
    ctx.stroke();
  } else if (prop.type === 'torch') {
    // Sconce & flame glow
    ctx.fillStyle = '#ffaa33';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = inkColor;
    ctx.fillRect(-1.5, 2, 3, 5);
  } else if (prop.type === 'barrel') {
    const r = gridSize * 0.28;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
    ctx.stroke();
  } else if (prop.type === 'sarcophagus') {
    const w = gridSize * 0.45;
    const h = gridSize * 0.85;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    // Tapered foot
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 4);
    ctx.lineTo(w / 2, -h / 4);
    ctx.stroke();
  }

  ctx.restore();
}
