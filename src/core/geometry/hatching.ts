// Procedural Dyson-style pen hatching, wall contouring, and water ripples

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  normalX: number;
  normalY: number;
  gx: number;
  gy: number;
  side: 'top' | 'right' | 'bottom' | 'left';
}

export function extractWallSegments(
  rooms: { [key: string]: boolean },
  gridSize: number
): WallSegment[] {
  const segments: WallSegment[] = [];

  for (const key of Object.keys(rooms)) {
    if (!rooms[key]) continue;
    const [gxStr, gyStr] = key.split(',');
    const gx = parseInt(gxStr, 10);
    const gy = parseInt(gyStr, 10);

    const x = gx * gridSize;
    const y = gy * gridSize;

    // Check 4 neighbors
    // Top
    if (!rooms[`${gx},${gy - 1}`]) {
      segments.push({
        x1: x,
        y1: y,
        x2: x + gridSize,
        y2: y,
        normalX: 0,
        normalY: -1,
        gx,
        gy,
        side: 'top',
      });
    }
    // Bottom
    if (!rooms[`${gx},${gy + 1}`]) {
      segments.push({
        x1: x,
        y1: y + gridSize,
        x2: x + gridSize,
        y2: y + gridSize,
        normalX: 0,
        normalY: 1,
        gx,
        gy,
        side: 'bottom',
      });
    }
    // Left
    if (!rooms[`${gx - 1},${gy}`]) {
      segments.push({
        x1: x,
        y1: y,
        x2: x,
        y2: y + gridSize,
        normalX: -1,
        normalY: 0,
        gx,
        gy,
        side: 'left',
      });
    }
    // Right
    if (!rooms[`${gx + 1},${gy}`]) {
      segments.push({
        x1: x + gridSize,
        y1: y,
        x2: x + gridSize,
        y2: y + gridSize,
        normalX: 1,
        normalY: 0,
        gx,
        gy,
        side: 'right',
      });
    }
  }

  return segments;
}

// Pseudo-random deterministic hash for organic jitter
function pseudoRandom(x: number, y: number, seed: number = 42): number {
  const sinVal = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return sinVal - Math.floor(sinVal);
}

/**
 * Draws classic pen-and-paper Dyson Logos exterior hatching along outer walls
 */
export function renderDysonHatching(
  ctx: CanvasRenderingContext2D,
  segments: WallSegment[],
  _gridSize: number,
  hatchLength: number = 14,
  hatchDensity: number = 3,
  inkColor: string = '#2c221e'
) {
  ctx.save();
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';

  const step = Math.max(4, 10 - hatchDensity * 1.5);

  ctx.beginPath();
  for (const seg of segments) {
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.floor(len / step);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = seg.x1 + dx * t;
      const py = seg.y1 + dy * t;

      const jitter = (pseudoRandom(px, py, 11) - 0.5) * 2;
      const lenJitter = hatchLength + (pseudoRandom(px, py, 99) - 0.5) * 4;

      // 45 degree outward diagonal hatching angle based on normal
      let angle = Math.atan2(seg.normalY, seg.normalX) + Math.PI / 4;
      if (seg.side === 'top' || seg.side === 'bottom') {
        angle = Math.atan2(seg.normalY, seg.normalX) + (seg.normalY < 0 ? 0.65 : -0.65);
      } else {
        angle = Math.atan2(seg.normalY, seg.normalX) + (seg.normalX < 0 ? -0.65 : 0.65);
      }

      const endX = px + Math.cos(angle) * lenJitter + jitter;
      const endY = py + Math.sin(angle) * lenJitter + jitter;

      ctx.moveTo(px, py);
      ctx.lineTo(endX, endY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Renders thick hand-drawn wall boundary outlines
 */
export function renderWallOutlines(
  ctx: CanvasRenderingContext2D,
  segments: WallSegment[],
  strokeWidth: number = 3,
  inkColor: string = '#1e1713'
) {
  ctx.save();
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  ctx.beginPath();
  for (const seg of segments) {
    ctx.moveTo(seg.x1, seg.y1);
    ctx.lineTo(seg.x2, seg.y2);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * Extracts water boundary segments facing non-water
 */
export function extractWaterSegments(
  water: { [key: string]: boolean },
  gridSize: number
): WallSegment[] {
  const segments: WallSegment[] = [];

  for (const key of Object.keys(water)) {
    if (!water[key]) continue;
    const [gxStr, gyStr] = key.split(',');
    const gx = parseInt(gxStr, 10);
    const gy = parseInt(gyStr, 10);

    const x = gx * gridSize;
    const y = gy * gridSize;

    if (!water[`${gx},${gy - 1}`]) {
      segments.push({ x1: x, y1: y, x2: x + gridSize, y2: y, normalX: 0, normalY: -1, gx, gy, side: 'top' });
    }
    if (!water[`${gx},${gy + 1}`]) {
      segments.push({ x1: x, y1: y + gridSize, x2: x + gridSize, y2: y + gridSize, normalX: 0, normalY: 1, gx, gy, side: 'bottom' });
    }
    if (!water[`${gx - 1},${gy}`]) {
      segments.push({ x1: x, y1: y, x2: x, y2: y + gridSize, normalX: -1, normalY: 0, gx, gy, side: 'left' });
    }
    if (!water[`${gx + 1},${gy}`]) {
      segments.push({ x1: x + gridSize, y1: y, x2: x + gridSize, y2: y + gridSize, normalX: 1, normalY: 0, gx, gy, side: 'right' });
    }
  }

  return segments;
}

/**
 * Renders concentric shoreline ripples and water surface textures
 */
export function renderWaterRipples(
  ctx: CanvasRenderingContext2D,
  segments: WallSegment[],
  waterTint: string = '#2d5a68'
) {
  ctx.save();
  ctx.lineCap = 'round';

  // Draw 3 concentric shoreline ripples (offsetting inward into the water)
  const rippleOffsets = [3, 7, 12];
  const opacities = [0.85, 0.55, 0.3];
  const widths = [1.5, 1.1, 0.8];

  for (let r = 0; r < rippleOffsets.length; r++) {
    const offset = rippleOffsets[r];
    ctx.strokeStyle = waterTint;
    ctx.globalAlpha = opacities[r];
    ctx.lineWidth = widths[r];

    ctx.beginPath();
    for (const seg of segments) {
      // Inward offset is opposite of normal
      const offX = -seg.normalX * offset;
      const offY = -seg.normalY * offset;

      // Draw dashed/segmented water ripple lines
      const x1 = seg.x1 + offX;
      const y1 = seg.y1 + offY;
      const x2 = seg.x2 + offX;
      const y2 = seg.y2 + offY;

      // Small inward margins so corners look crisp
      const margin = 2;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len > margin * 2) {
        const startX = x1 + (dx / len) * margin;
        const startY = y1 + (dy / len) * margin;
        const endX = x2 - (dx / len) * margin;
        const endY = y2 - (dy / len) * margin;

        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
      }
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Renders organic procedural foliage tree canopy clusters and bushes
 */
export function renderFoliageCluster(
  ctx: CanvasRenderingContext2D,
  gx: number,
  gy: number,
  gridSize: number,
  type: 'tree' | 'bush' | 'rock',
  seed: number,
  inkColor: string = '#1e1713',
  foliageFill: string = 'rgba(82, 110, 72, 0.25)'
) {
  ctx.save();
  const centerX = (gx + 0.5) * gridSize;
  const centerY = (gy + 0.5) * gridSize;
  const radius = (gridSize * 0.48);

  if (type === 'tree') {
    // Scalloped cloud canopy
    const lobes = 7 + (seed % 4);
    ctx.fillStyle = foliageFill;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.8;
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i <= lobes; i++) {
      const angle = (i / lobes) * Math.PI * 2;
      const lobeRadius = radius * (0.85 + (pseudoRandom(seed, i, 5) * 0.3));
      const px = centerX + Math.cos(angle) * lobeRadius;
      const py = centerY + Math.sin(angle) * lobeRadius;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        const prevAngle = ((i - 0.5) / lobes) * Math.PI * 2;
        const bulgeRadius = radius * 1.08;
        const cpX = centerX + Math.cos(prevAngle) * bulgeRadius;
        const cpY = centerY + Math.sin(prevAngle) * bulgeRadius;
        ctx.quadraticCurveTo(cpX, cpY, px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Central trunk ring & small branch ink ticks
    ctx.fillStyle = inkColor;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Inner contour stipples
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let b = 0; b < 3; b++) {
      const bAngle = ((b + (seed % 3)) / 3) * Math.PI * 2;
      ctx.moveTo(centerX + Math.cos(bAngle) * 4, centerY + Math.sin(bAngle) * 4);
      ctx.lineTo(centerX + Math.cos(bAngle) * (radius * 0.5), centerY + Math.sin(bAngle) * (radius * 0.5));
    }
    ctx.stroke();

  } else if (type === 'bush') {
    // Smaller shrub cluster
    const bushRadius = radius * 0.65;
    ctx.fillStyle = foliageFill;
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.4;

    ctx.beginPath();
    ctx.arc(centerX, centerY, bushRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Leaf ticks
    ctx.beginPath();
    ctx.moveTo(centerX - 3, centerY);
    ctx.lineTo(centerX + 3, centerY);
    ctx.moveTo(centerX, centerY - 3);
    ctx.lineTo(centerX, centerY + 3);
    ctx.stroke();

  } else if (type === 'rock') {
    // Angular boulder
    const rockRadius = radius * 0.65;
    ctx.fillStyle = 'rgba(120, 115, 105, 0.28)';
    ctx.strokeStyle = inkColor;
    ctx.lineWidth = 1.6;

    ctx.beginPath();
    const vertices = 5;
    for (let v = 0; v < vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2;
      const vRadius = rockRadius * (0.7 + pseudoRandom(gx, gy, v) * 0.5);
      const px = centerX + Math.cos(angle) * vRadius;
      const py = centerY + Math.sin(angle) * vRadius;
      if (v === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Internal crack / bevel
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 4, centerY - 2);
    ctx.lineTo(centerX + 2, centerY + 1);
    ctx.lineTo(centerX + 5, centerY - 3);
    ctx.stroke();
  }

  ctx.restore();
}
