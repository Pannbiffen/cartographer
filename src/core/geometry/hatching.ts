// Procedural Dyson-style pen hatching, wall contouring, and water ripples
import { tilePattern, viewRect, wrap } from '../renderers/patternTiles';
import type { Pair, Polygon } from '../../types/map';

export interface WallSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  // Unit vector pointing away from the floor
  normalX: number;
  normalY: number;
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
      });
    }
  }

  return segments;
}

// Pseudo-random deterministic hash for organic jitter
export function pseudoRandom(x: number, y: number, seed: number = 42): number {
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

      // Strokes lean off the outward normal, turned the same way all round
      const turn = seg.normalX - seg.normalY >= 0 ? 0.65 : -0.65;
      const angle = Math.atan2(seg.normalY, seg.normalX) + turn;

      const endX = px + Math.cos(angle) * lenJitter + jitter;
      const endY = py + Math.sin(angle) * lenJitter + jitter;

      ctx.moveTo(px, py);
      ctx.lineTo(endX, endY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// Hatching tiles span about this many world pixels, a whole number of
// dots or lines across, so they repeat seamlessly
const HATCH_TILE = 120;

/** Dots on a jittered lattice, so they look placed by hand */
function stipplePattern(ctx: CanvasRenderingContext2D, density: number, inkColor: string) {
  const spacing = Math.max(3, 9 - density * 1.2);
  const n = Math.ceil(HATCH_TILE / spacing);
  const draw = (tctx: CanvasRenderingContext2D) => {
    tctx.fillStyle = inkColor;
    tctx.beginPath();
    // A ring of dots around the tile too: jittered, they cross its edges
    for (let j = -1; j <= n; j++) {
      for (let i = -1; i <= n; i++) {
        const wi = wrap(i, n);
        const wj = wrap(j, n);
        const px = (i + pseudoRandom(wi, wj, 3) - 0.5) * spacing;
        const py = (j + pseudoRandom(wi, wj, 7) - 0.5) * spacing;
        const r = 0.5 + pseudoRandom(wi, wj, 13) * 0.7;
        tctx.moveTo(px + r, py);
        tctx.arc(px, py, r, 0, Math.PI * 2);
      }
    }
    tctx.fill();
  };
  return tilePattern(ctx, `stipple|${spacing}|${inkColor}`, n * spacing, draw, { fit: true });
}

/** Two sets of diagonals, tighter with more density */
function crosshatchPattern(ctx: CanvasRenderingContext2D, density: number, inkColor: string) {
  const spacing = Math.max(4, 14 - density * 1.8);
  const size = Math.ceil(HATCH_TILE / spacing) * spacing;
  const draw = (tctx: CanvasRenderingContext2D) => {
    tctx.strokeStyle = inkColor;
    tctx.lineWidth = 0.9;
    tctx.beginPath();
    // Every line through the tile, running a step past its edges
    for (let c = -size - spacing; c <= size + spacing; c += spacing) {
      tctx.moveTo(c - spacing, -spacing);
      tctx.lineTo(c + size + spacing, size + spacing);
      tctx.moveTo(c + size + spacing, -spacing);
      tctx.lineTo(c - spacing, size + spacing);
    }
    tctx.stroke();
  };
  return tilePattern(ctx, `crosshatch|${spacing}|${inkColor}`, size, draw, { fit: true });
}

/**
 * The walls as lines, with level and upright walls that continue each other
 * joined into one: a cell's worth of wall at a time, a long wall would be
 * stroked as dozens of round-capped pieces.
 */
function straightRuns(segments: WallSegment[]): [number, number, number, number][] {
  const runs: [number, number, number, number][] = [];
  // Level walls by their y, upright ones by their x, as [start, end] along them
  const level = new Map<number, [number, number][]>();
  const upright = new Map<number, [number, number][]>();
  const add = (lines: Map<number, [number, number][]>, at: number, a: number, b: number) => {
    const span: [number, number] = a < b ? [a, b] : [b, a];
    const list = lines.get(at);
    if (list) list.push(span);
    else lines.set(at, [span]);
  };
  for (const seg of segments) {
    if (seg.y1 === seg.y2) add(level, seg.y1, seg.x1, seg.x2);
    else if (seg.x1 === seg.x2) add(upright, seg.x1, seg.y1, seg.y2);
    else runs.push([seg.x1, seg.y1, seg.x2, seg.y2]);
  }
  for (const [lines, isLevel] of [[level, true], [upright, false]] as const) {
    for (const [at, spans] of lines) {
      spans.sort((p, q) => p[0] - q[0]);
      let [start, end] = spans[0];
      for (const [a, b] of spans) {
        if (a <= end) {
          end = Math.max(end, b);
          continue;
        }
        runs.push(isLevel ? [start, at, end, at] : [at, start, at, end]);
        [start, end] = [a, b];
      }
      runs.push(isLevel ? [start, at, end, at] : [at, start, at, end]);
    }
  }
  return runs;
}

/**
 * Shades a band of `width` pixels around the walls with crosshatching,
 * stippling or a soft shadow. Floors drawn afterwards cover its inner half.
 * The band is one wide round-capped stroke along the walls in view, painted
 * from a repeating tile: clipped to as a path, and dotted dot by dot, it took
 * up to a second a frame on large maps (#61).
 */
export function renderBandHatching(
  ctx: CanvasRenderingContext2D,
  segments: WallSegment[],
  style: 'crosshatch' | 'stipple' | 'shadow',
  width: number,
  density: number,
  inkColor: string
) {
  const view = viewRect(ctx);
  ctx.save();
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of straightRuns(segments)) {
    if (
      Math.max(x1, x2) + width < view.minX ||
      Math.min(x1, x2) - width > view.maxX ||
      Math.max(y1, y2) + width < view.minY ||
      Math.min(y1, y2) - width > view.maxY
    ) continue;
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.lineCap = 'round';
  if (style === 'shadow') {
    // A wide faint band under a narrow one, so it darkens towards the wall
    ctx.strokeStyle = inkColor;
    ctx.globalAlpha = 0.16;
    for (const w of [width, width * 0.5]) {
      ctx.lineWidth = w * 2;
      ctx.stroke();
    }
  } else {
    const pattern = style === 'crosshatch'
      ? crosshatchPattern(ctx, density, inkColor)
      : stipplePattern(ctx, density, inkColor);
    if (pattern) {
      ctx.imageSmoothingEnabled = false;
      ctx.strokeStyle = pattern;
      ctx.lineWidth = width * 2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Renders wall boundary outlines: bold or fine ink, or a rough
 * double-pass pen line
 */
export function renderWallOutlines(
  ctx: CanvasRenderingContext2D,
  segments: WallSegment[],
  style: 'bold' | 'fine' | 'rough' = 'bold',
  inkColor: string = '#1e1713'
) {
  ctx.save();
  ctx.strokeStyle = inkColor;
  ctx.lineCap = 'square';
  ctx.lineJoin = 'miter';

  ctx.beginPath();
  if (style === 'rough') {
    // Two wobbly strokes per wall, bending through a jittered midpoint.
    // Corner jitter depends only on the corner, so neighbouring walls meet.
    ctx.lineWidth = 1.6;
    ctx.lineCap = 'round';
    const jitter = (x: number, y: number, salt: number) => (pseudoRandom(x, y, salt) - 0.5) * 2.4;
    for (const seg of segments) {
      const mx = (seg.x1 + seg.x2) / 2;
      const my = (seg.y1 + seg.y2) / 2;
      for (const pass of [1, 2]) {
        ctx.moveTo(seg.x1 + jitter(seg.x1, seg.y1, pass), seg.y1 + jitter(seg.x1, seg.y1, pass + 10));
        ctx.quadraticCurveTo(
          mx + jitter(mx, my, pass + 20),
          my + jitter(mx, my, pass + 30),
          seg.x2 + jitter(seg.x2, seg.y2, pass),
          seg.y2 + jitter(seg.x2, seg.y2, pass + 10)
        );
      }
    }
  } else {
    ctx.lineWidth = style === 'fine' ? 1.6 : 3.2;
    for (const seg of segments) {
      ctx.moveTo(seg.x1, seg.y1);
      ctx.lineTo(seg.x2, seg.y2);
    }
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
      segments.push({ x1: x, y1: y, x2: x + gridSize, y2: y, normalX: 0, normalY: -1 });
    }
    if (!water[`${gx},${gy + 1}`]) {
      segments.push({ x1: x, y1: y + gridSize, x2: x + gridSize, y2: y + gridSize, normalX: 0, normalY: 1 });
    }
    if (!water[`${gx - 1},${gy}`]) {
      segments.push({ x1: x, y1: y, x2: x, y2: y + gridSize, normalX: -1, normalY: 0 });
    }
    if (!water[`${gx + 1},${gy}`]) {
      segments.push({ x1: x + gridSize, y1: y, x2: x + gridSize, y2: y + gridSize, normalX: 1, normalY: 0 });
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
 * Shoreline ripples inside free-form water (polygons in grid units), the same
 * three lines as along water cells, broken about once a cell. Draw them
 * clipped to the water, as the inner lines can cross in tight corners.
 */
export function renderShoreRipples(
  ctx: CanvasRenderingContext2D,
  water: Polygon[],
  gridSize: number,
  waterTint: string = '#2d5a68'
) {
  const rippleOffsets = [3, 7, 12];
  const opacities = [0.85, 0.55, 0.3];
  const widths = [1.5, 1.1, 0.8];
  const rings: { ring: Pair[]; inward: number }[] = [];
  for (const polygon of water) {
    polygon.forEach((closed, ringIndex) => {
      const ring = closed.slice(0, -1).map(([x, y]) => [x * gridSize, y * gridSize] as Pair);
      if (ring.length < 3) return;
      let area = 0;
      ring.forEach(([x1, y1], i) => {
        const [x2, y2] = ring[(i + 1) % ring.length];
        area += x1 * y2 - x2 * y1;
      });
      // (-dy, dx) points into a ring of positive area; water lies inside
      // the outline and outside its holes
      rings.push({ ring, inward: (area > 0 ? 1 : -1) * (ringIndex === 0 ? 1 : -1) });
    });
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = waterTint;
  ctx.setLineDash([gridSize - 4, 4]);
  for (let r = 0; r < rippleOffsets.length; r++) {
    const offset = rippleOffsets[r];
    ctx.globalAlpha = opacities[r];
    ctx.lineWidth = widths[r];
    ctx.beginPath();
    for (const { ring, inward } of rings) {
      const edgeNormal = (i: number): Pair => {
        const [ax, ay] = ring[i];
        const [bx, by] = ring[(i + 1) % ring.length];
        const len = Math.hypot(bx - ax, by - ay) || 1;
        return [(inward * -(by - ay)) / len, (inward * (bx - ax)) / len];
      };
      ring.forEach(([x, y], i) => {
        // Mitred: each corner moves so both edges beside it end up `offset` in
        const [n1, n2] = [edgeNormal((i + ring.length - 1) % ring.length), edgeNormal(i)];
        const k = Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
        const px = x + ((n1[0] + n2[0]) * offset) / k;
        const py = y + ((n1[1] + n2[1]) * offset) / k;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
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
