// Universal VTT (.dd2vtt) Exporter
import type { MapData } from '../../types/map';
import { extractWallSegments } from '../geometry/hatching';
import { visibleLayers } from '../layers';
import { mapLights } from '../lighting';

export interface VttPoint {
  x: number;
  y: number;
}

export interface VttPortal {
  position: VttPoint;
  bounds: [VttPoint, VttPoint];
  closed: boolean;
  freestanding: boolean;
}

export interface VttLight {
  position: VttPoint;
  range: number;
  color: string;
  intensity: number;
  shadows: boolean;
}

export interface UniversalVttData {
  format: number;
  resolution: {
    map_origin: VttPoint;
    map_size: VttPoint;
    pixels_per_grid: number;
  };
  line_of_sight: [VttPoint, VttPoint][];
  portals: VttPortal[];
  lights: VttLight[];
  image: string; // Base64 image
}

export function exportUniversalVtt(
  mapData: MapData,
  imageDataBase64: string,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number
): string {
  const gridSize = mapData.gridSize;
  const widthUnits = Math.max(1, maxX - minX + 1);
  const heightUnits = Math.max(1, maxY - minY + 1);

  // Walls outline the floor of every shown layer together
  const layers = visibleLayers(mapData);
  const rooms = Object.assign({}, ...layers.map((l) => l.rooms));
  const rawSegments = extractWallSegments(rooms, gridSize);

  // Convert wall segments to grid units relative to (minX, minY)
  const lineOfSight: [VttPoint, VttPoint][] = rawSegments.map((seg) => [
    {
      x: (seg.x1 - minX * gridSize) / gridSize,
      y: (seg.y1 - minY * gridSize) / gridSize,
    },
    {
      x: (seg.x2 - minX * gridSize) / gridSize,
      y: (seg.y2 - minY * gridSize) / gridSize,
    },
  ]);

  // Convert doors to VTT portals
  // Archways are open passages, so they don't become portals
  const portals: VttPortal[] = layers
    .flatMap((l) => l.doors)
    .filter((door) => door.type !== 'archway')
    .map((door) => {
    const dx = door.x - minX;
    const dy = door.y - minY;

    if (door.orientation === 'horizontal') {
      return {
        position: { x: dx + 0.5, y: dy },
        bounds: [
          { x: dx + 0.1, y: dy },
          { x: dx + 0.9, y: dy },
        ],
        closed: true,
        freestanding: false,
      };
    } else {
      return {
        position: { x: dx, y: dy + 0.5 },
        bounds: [
          { x: dx, y: dy + 0.1 },
          { x: dx, y: dy + 0.9 },
        ],
        closed: true,
        freestanding: false,
      };
    }
  });

  // Placed lights and torches become VTT light sources, colour as AARRGGBB
  const lights: VttLight[] = mapLights(mapData).map((light) => ({
    position: { x: light.x - minX, y: light.y - minY },
    range: light.radius,
    color: `ff${light.color.slice(1)}`,
    intensity: light.intensity,
    shadows: true,
  }));

  // Strip "data:image/png;base64," prefix if present
  const cleanImage = imageDataBase64.replace(/^data:image\/[a-z]+;base64,/, '');

  const vttDoc: UniversalVttData = {
    format: 0.2,
    resolution: {
      map_origin: { x: 0, y: 0 },
      map_size: { x: widthUnits, y: heightUnits },
      pixels_per_grid: gridSize,
    },
    line_of_sight: lineOfSight,
    portals,
    lights,
    image: cleanImage,
  };

  return JSON.stringify(vttDoc, null, 2);
}
