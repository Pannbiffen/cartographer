// Procedural map generators: BSP Dungeons, Cellular Automata Caves, and Organic Rivers

export interface GeneratorResult {
  rooms: { [key: string]: boolean };
  water: { [key: string]: boolean };
  foliage?: { [key: string]: { type: 'tree' | 'bush' | 'rock'; seed: number } };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Generates a classical multi-room dungeon using Binary Space Partitioning (BSP)
 */
export function generateBspDungeon(
  width: number = 30,
  height: number = 22,
  minRoomSize: number = 4
): GeneratorResult {
  const roomsMap: { [key: string]: boolean } = {};
  const rooms: Rect[] = [];

  // Recursive partition
  function split(rect: Rect, depth: number) {
    if (depth > 3 || (rect.w <= minRoomSize * 2 && rect.h <= minRoomSize * 2)) {
      // Carve a room inside this leaf
      const rw = Math.floor(Math.random() * (rect.w - minRoomSize)) + minRoomSize;
      const rh = Math.floor(Math.random() * (rect.h - minRoomSize)) + minRoomSize;
      const rx = rect.x + Math.floor(Math.random() * (rect.w - rw));
      const ry = rect.y + Math.floor(Math.random() * (rect.h - rh));

      rooms.push({ x: rx, y: ry, w: rw, h: rh });
      return;
    }

    const splitHorizontal = rect.w < rect.h ? true : Math.random() > 0.5;

    if (splitHorizontal) {
      const splitY = Math.floor(rect.y + minRoomSize + Math.random() * (rect.h - minRoomSize * 2));
      split({ x: rect.x, y: rect.y, w: rect.w, h: splitY - rect.y }, depth + 1);
      split({ x: rect.x, y: splitY, w: rect.w, h: rect.y + rect.h - splitY }, depth + 1);
    } else {
      const splitX = Math.floor(rect.x + minRoomSize + Math.random() * (rect.w - minRoomSize * 2));
      split({ x: rect.x, y: rect.y, w: splitX - rect.x, h: rect.h }, depth + 1);
      split({ x: splitX, y: rect.y, w: rect.x + rect.w - splitX, h: rect.h }, depth + 1);
    }
  }

  // Offset so dungeon is centered
  const offsetX = -Math.floor(width / 2);
  const offsetY = -Math.floor(height / 2);

  split({ x: offsetX + 1, y: offsetY + 1, w: width - 2, h: height - 2 }, 0);

  // Carve room floors
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        roomsMap[`${x},${y}`] = true;
      }
    }
  }

  // Connect rooms with corridors
  for (let i = 0; i < rooms.length - 1; i++) {
    const r1 = rooms[i];
    const r2 = rooms[i + 1];

    let cx = Math.floor(r1.x + r1.w / 2);
    let cy = Math.floor(r1.y + r1.h / 2);
    const targetX = Math.floor(r2.x + r2.w / 2);
    const targetY = Math.floor(r2.y + r2.h / 2);

    while (cx !== targetX) {
      roomsMap[`${cx},${cy}`] = true;
      cx += cx < targetX ? 1 : -1;
    }
    while (cy !== targetY) {
      roomsMap[`${cx},${cy}`] = true;
      cy += cy < targetY ? 1 : -1;
    }
  }

  return { rooms: roomsMap, water: {} };
}

/**
 * Generates an organic cavern system using Cellular Automata
 */
export function generateCaveSystem(
  width: number = 32,
  height: number = 24,
  fillChance: number = 0.45
): GeneratorResult {
  const roomsMap: { [key: string]: boolean } = {};
  const waterMap: { [key: string]: boolean } = {};

  const offsetX = -Math.floor(width / 2);
  const offsetY = -Math.floor(height / 2);

  // Grid initialization
  let grid: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      // Border is always solid rock
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
        grid[y][x] = true;
      } else {
        grid[y][x] = Math.random() < fillChance;
      }
    }
  }

  // Cellular automata smoothing iterations
  for (let iter = 0; iter < 4; iter++) {
    const nextGrid: boolean[][] = [];
    for (let y = 0; y < height; y++) {
      nextGrid[y] = [];
      for (let x = 0; x < width; x++) {
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1) {
          nextGrid[y][x] = true;
          continue;
        }

        let neighborWalls = 0;
        for (let ny = y - 1; ny <= y + 1; ny++) {
          for (let nx = x - 1; nx <= x + 1; nx++) {
            if (grid[ny][nx]) neighborWalls++;
          }
        }

        nextGrid[y][x] = neighborWalls >= 5;
      }
    }
    grid = nextGrid;
  }

  // Invert: non-wall is carved cave floor
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (!grid[y][x]) {
        const gx = x + offsetX;
        const gy = y + offsetY;
        roomsMap[`${gx},${gy}`] = true;

        // Add a subterranean water pool in the deepest pocket
        if (x > width * 0.4 && x < width * 0.7 && y > height * 0.5 && y < height * 0.8) {
          waterMap[`${gx},${gy}`] = true;
        }
      }
    }
  }

  return { rooms: roomsMap, water: waterMap };
}

/**
 * Generates an organic river cutting through a natural cavern or ruins
 */
export function generateRiver(
  startX: number = -15,
  endX: number = 15,
  baseY: number = 0,
  widthRange: number = 3
): { [key: string]: boolean } {
  const waterMap: { [key: string]: boolean } = {};

  let currentY = baseY;
  for (let x = startX; x <= endX; x++) {
    currentY += Math.floor((Math.random() - 0.5) * 2.2);
    const riverWidth = Math.floor(Math.random() * widthRange) + 2;

    for (let w = -Math.floor(riverWidth / 2); w <= Math.floor(riverWidth / 2); w++) {
      waterMap[`${x},${currentY + w}`] = true;
    }
  }

  return waterMap;
}
