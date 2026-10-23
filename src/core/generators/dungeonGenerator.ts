// Procedural map generators: BSP dungeons and cellular automata caves. Each
// takes a settings object with a seed, so the same settings and seed always
// give the same layout and a reroll is just a new seed.

import type { DoorType, LayerContent, PlacedDoor, PlacedProp, PlacedStairs, PropType } from '../../types/map';

export type GeneratorKind = 'dungeon' | 'cave';

export interface DungeonSettings {
  width: number; // cells
  height: number;
  rooms: number; // how many rooms to aim for; a small map fits fewer
  minRoomSize: number; // cells across
  maxRoomSize: number;
  corridorWidth: number; // cells; doors go only where a corridor meets a room one cell wide
  doors: boolean;
  props: boolean;
  stairs: boolean;
  seed: number;
}

export interface CaveSettings {
  width: number; // cells
  height: number;
  openness: number; // 0 to 1: the share of open ground before smoothing
  smoothing: number; // cellular automata passes
  minCaveSize: number; // pockets of fewer cells are filled in
  pools: boolean;
  rocks: boolean;
  seed: number;
}

export const DEFAULT_DUNGEON: DungeonSettings = {
  width: 32,
  height: 24,
  rooms: 8,
  minRoomSize: 3,
  maxRoomSize: 8,
  corridorWidth: 1,
  doors: true,
  props: true,
  stairs: true,
  seed: 1,
};

export const DEFAULT_CAVE: CaveSettings = {
  width: 36,
  height: 26,
  openness: 0.55,
  smoothing: 4,
  minCaveSize: 12,
  pools: true,
  rocks: true,
  seed: 1,
};

/** What a generator lays on the layer, in place of its content */
export type GeneratorResult = Pick<LayerContent, 'rooms' | 'water' | 'foliage' | 'doors' | 'props' | 'stairs'>;

/** A seeded random number generator (mulberry32) giving numbers in [0, 1) */
function seededRandom(seed: number): () => number {
  let a = Math.round(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Node extends Rect {
  children?: [Node, Node];
  room?: Rect;
}

const key = (x: number, y: number) => `${x},${y}`;

const SIDES = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

const DOOR_MIX: [DoorType, number][] = [
  ['standard', 0.55],
  ['archway', 0.2],
  ['double', 0.1],
  ['portcullis', 0.08],
  ['secret', 0.07],
];

/**
 * A classical multi-room dungeon: Binary Space Partitioning splits the area
 * into one leaf per room, and each split is bridged by a corridor between the
 * closest rooms on either side, so every room can be reached.
 */
export function generateBspDungeon(settings: DungeonSettings): GeneratorResult {
  const random = seededRandom(settings.seed);
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const shuffle = <T>(items: T[]) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = int(0, i);
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const minRoom = Math.max(2, Math.round(settings.minRoomSize));
  const maxRoom = Math.max(minRoom, Math.round(settings.maxRoomSize));
  // A leaf keeps a cell of rock on each side of its room, so rooms never touch
  const minLeaf = minRoom + 2;
  const width = Math.max(minLeaf, Math.round(settings.width));
  const height = Math.max(minLeaf, Math.round(settings.height));

  // Centred on the origin
  const root: Node = { x: -Math.floor(width / 2), y: -Math.floor(height / 2), w: width, h: height };
  const leaves: Node[] = [root];
  const splits: [Node, Node][] = [];
  while (leaves.length < settings.rooms) {
    // Split the largest leaf that still holds two rooms
    const splittable = leaves.filter((n) => n.w >= 2 * minLeaf || n.h >= 2 * minLeaf);
    if (splittable.length === 0) break;
    const node = splittable.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a));
    const across = node.w >= 2 * minLeaf && (node.h < 2 * minLeaf || node.w > node.h || (node.w === node.h && random() < 0.5));
    let a: Node;
    let b: Node;
    if (across) {
      const at = int(minLeaf, node.w - minLeaf);
      a = { x: node.x, y: node.y, w: at, h: node.h };
      b = { x: node.x + at, y: node.y, w: node.w - at, h: node.h };
    } else {
      const at = int(minLeaf, node.h - minLeaf);
      a = { x: node.x, y: node.y, w: node.w, h: at };
      b = { x: node.x, y: node.y + at, w: node.w, h: node.h - at };
    }
    node.children = [a, b];
    leaves.splice(leaves.indexOf(node), 1, a, b);
    splits.push([a, b]);
  }

  const rooms: Rect[] = leaves.map((leaf) => {
    const w = int(minRoom, Math.min(maxRoom, leaf.w - 2));
    const h = int(minRoom, Math.min(maxRoom, leaf.h - 2));
    const room = { x: leaf.x + 1 + int(0, leaf.w - 2 - w), y: leaf.y + 1 + int(0, leaf.h - 2 - h), w, h };
    leaf.room = room;
    return room;
  });

  const floor: { [key: string]: boolean } = {};
  const inRoom = new Set<string>();
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let y = r.y; y < r.y + r.h; y++) {
        floor[key(x, y)] = true;
        inRoom.add(key(x, y));
      }
    }
  }

  // Corridors: an L from a cell in one room to a cell in the other, as wide as set
  const path = new Set<string>();
  const corridorWidth = Math.max(1, Math.round(settings.corridorWidth));
  const carve = (x: number, y: number) => {
    for (let i = 0; i < corridorWidth; i++) {
      for (let j = 0; j < corridorWidth; j++) {
        floor[key(x + i, y + j)] = true;
        path.add(key(x + i, y + j));
      }
    }
  };
  const roomsIn = (node: Node): Rect[] => (node.children ? node.children.flatMap(roomsIn) : node.room ? [node.room] : []);
  const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
  // Inside the room, leaving room for the corridor's width
  const cellIn = (r: Rect) => ({
    x: r.x + int(0, Math.max(0, r.w - corridorWidth)),
    y: r.y + int(0, Math.max(0, r.h - corridorWidth)),
  });
  for (const [a, b] of splits) {
    let best: [Rect, Rect] | null = null;
    let bestDistance = Infinity;
    for (const ra of roomsIn(a)) {
      for (const rb of roomsIn(b)) {
        const ca = centre(ra);
        const cb = centre(rb);
        const d = Math.hypot(ca.x - cb.x, ca.y - cb.y);
        if (d < bestDistance) [best, bestDistance] = [[ra, rb], d];
      }
    }
    if (!best) continue;
    const from = cellIn(best[0]);
    const to = cellIn(best[1]);
    const xFirst = random() < 0.5;
    let { x, y } = from;
    const stepX = () => {
      while (x !== to.x) {
        carve(x, y);
        x += x < to.x ? 1 : -1;
      }
    };
    const stepY = () => {
      while (y !== to.y) {
        carve(x, y);
        y += y < to.y ? 1 : -1;
      }
    };
    if (xFirst) {
      stepX();
      stepY();
    } else {
      stepY();
      stepX();
    }
    carve(x, y);
  }

  // Doors where a one-cell corridor enters a room: rock on both sides of the
  // corridor cell, and room beyond it
  const doors: PlacedDoor[] = [];
  const nearDoor = new Set<string>();
  if (settings.doors) {
    for (const k of Object.keys(floor)) {
      if (inRoom.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of SIDES) {
        if (!inRoom.has(key(x + dx, y + dy))) continue;
        if (floor[key(x + dy, y + dx)] || floor[key(x - dy, y - dx)]) continue;
        let pick = random();
        const type = DOOR_MIX.find(([, share]) => (pick -= share) < 0)?.[0] ?? 'standard';
        const door: PlacedDoor =
          dy !== 0
            ? { id: `door_g${doors.length + 1}`, x, y: dy < 0 ? y : y + 1, orientation: 'horizontal', type }
            : { id: `door_g${doors.length + 1}`, x: dx < 0 ? x : x + 1, y, orientation: 'vertical', type };
        doors.push(door);
        nearDoor.add(key(x + dx, y + dy));
        break;
      }
    }
  }

  // Stairs and props keep off corridors running through rooms and the cells inside doors
  const taken = new Set([...path, ...nearDoor]);
  const free = (x: number, y: number, w = 1, h = 1) => {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < h; j++) {
        if (!inRoom.has(key(x + i, y + j)) || taken.has(key(x + i, y + j))) return false;
      }
    }
    return true;
  };
  const take = (x: number, y: number, w = 1, h = 1) => {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) taken.add(key(x + i, y + j));
  };

  const stairs: PlacedStairs[] = [];
  if (settings.stairs && rooms.length > 0) {
    // The entrance: along a wall of one of the rooms, wherever there's space
    placing: for (const r of shuffle([...rooms])) {
      const spots: [number, number, number, number][] = [];
      for (let y = r.y; y < r.y + r.h - 1; y++) spots.push([r.x, y, 1, 2], [r.x + r.w - 1, y, 1, 2]);
      for (let x = r.x; x < r.x + r.w - 1; x++) spots.push([x, r.y, 2, 1], [x, r.y + r.h - 1, 2, 1]);
      for (const [x, y, w, h] of shuffle(spots)) {
        if (!free(x, y, w, h)) continue;
        take(x, y, w, h);
        const direction = w === 1 ? (x === r.x ? 'right' : 'left') : y === r.y ? 'down' : 'up';
        stairs.push({ id: 'stairs_g1', x, y, width: w, height: h, direction, steps: 4 });
        break placing;
      }
    }
  }

  const props: PlacedProp[] = [];
  if (settings.props) {
    const put = (x: number, y: number, type: PropType) => {
      if (!free(x, y)) return;
      take(x, y);
      props.push({ id: `prop_g${props.length + 1}`, x, y, type, rotation: 0 });
    };
    for (const r of rooms) {
      const right = r.x + r.w - 1;
      const bottom = r.y + r.h - 1;
      // Pillars in the corners of a hall, a cell in from the walls
      if (r.w >= 6 && r.h >= 6 && random() < 0.5) {
        put(r.x + 1, r.y + 1, 'pillar');
        put(right - 1, r.y + 1, 'pillar');
        put(r.x + 1, bottom - 1, 'pillar');
        put(right - 1, bottom - 1, 'pillar');
      }
      if (random() < 0.4) {
        const corners: [number, number][] = [
          [r.x, r.y],
          [right, r.y],
          [r.x, bottom],
          [right, bottom],
        ];
        const [x, y] = corners[int(0, 3)];
        put(x, y, random() < 0.7 ? 'chest' : 'barrel');
      }
      if (random() < 0.5) {
        // A torch on the wall, at the middle of its top or bottom side
        put(r.x + Math.floor(r.w / 2), random() < 0.5 ? r.y : bottom, 'torch');
      }
      if (r.w >= 3 && r.h >= 3 && random() < 0.3) {
        const centrepieces: PropType[] = ['altar', 'table', 'sarcophagus'];
        put(r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2), centrepieces[int(0, centrepieces.length - 1)]);
      }
    }
  }

  return { rooms: floor, water: {}, foliage: {}, doors, props, stairs };
}

/**
 * An organic cavern system from cellular automata: random rock smoothed into
 * caves, with pockets below the minimum size filled in, and optional pools and
 * boulders.
 */
export function generateCaveSystem(settings: CaveSettings): GeneratorResult {
  const random = seededRandom(settings.seed);
  const width = Math.max(8, Math.round(settings.width));
  const height = Math.max(8, Math.round(settings.height));
  const offsetX = -Math.floor(width / 2);
  const offsetY = -Math.floor(height / 2);
  const edge = (x: number, y: number) => x === 0 || y === 0 || x === width - 1 || y === height - 1;

  // true is rock; the border always is
  let grid: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) grid[y][x] = edge(x, y) || random() >= settings.openness;
  }
  for (let pass = 0; pass < settings.smoothing; pass++) {
    grid = grid.map((row, y) =>
      row.map((_, x) => {
        if (edge(x, y)) return true;
        let rock = 0;
        for (let ny = y - 1; ny <= y + 1; ny++) {
          for (let nx = x - 1; nx <= x + 1; nx++) if (grid[ny][nx]) rock++;
        }
        return rock >= 5;
      })
    );
  }

  // Keep the caves of at least the minimum size
  const seen = new Set<string>();
  const cells: [number, number][] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (grid[y][x] || seen.has(key(x, y))) continue;
      const cave: [number, number][] = [[x, y]];
      seen.add(key(x, y));
      for (let i = 0; i < cave.length; i++) {
        const [cx, cy] = cave[i];
        for (const [dx, dy] of SIDES) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (grid[ny][nx] || seen.has(key(nx, ny))) continue;
          seen.add(key(nx, ny));
          cave.push([nx, ny]);
        }
      }
      if (cave.length >= settings.minCaveSize) cells.push(...cave);
    }
  }
  const open = new Set(cells.map(([x, y]) => key(x, y)));
  const rooms: { [key: string]: boolean } = {};
  for (const [x, y] of cells) rooms[key(x + offsetX, y + offsetY)] = true;

  // Pools grow from a cell well inside a cave, keeping a cell of shore all round
  const water: { [key: string]: boolean } = {};
  const wet = new Set<string>();
  if (settings.pools) {
    const inland = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!open.has(key(x + dx, y + dy))) return false;
      return true;
    };
    const starts = cells.filter(([x, y]) => inland(x, y));
    const pools = Math.min(starts.length, 1 + Math.floor(random() * 2));
    for (let p = 0; p < pools; p++) {
      const target = Math.max(4, Math.round(cells.length / 18 / pools));
      const pool = [starts[Math.floor(random() * starts.length)]];
      wet.add(key(...pool[0]));
      for (let i = 0; i < pool.length && pool.length < target; i++) {
        for (const [dx, dy] of SIDES) {
          const nx = pool[i][0] + dx;
          const ny = pool[i][1] + dy;
          if (pool.length >= target || wet.has(key(nx, ny)) || !inland(nx, ny) || random() < 0.3) continue;
          wet.add(key(nx, ny));
          pool.push([nx, ny]);
        }
      }
    }
    for (const k of wet) {
      const [x, y] = k.split(',').map(Number);
      water[key(x + offsetX, y + offsetY)] = true;
    }
  }

  const foliage: GeneratorResult['foliage'] = {};
  if (settings.rocks) {
    const dry = cells.filter(([x, y]) => !wet.has(key(x, y)));
    const count = Math.round(dry.length / 30);
    for (let i = 0; i < count; i++) {
      const [x, y] = dry[Math.floor(random() * dry.length)];
      foliage[key(x + offsetX, y + offsetY)] = { type: 'rock', seed: Math.floor(random() * 1000) };
    }
  }

  return { rooms, water, foliage, doors: [], props: [], stairs: [] };
}
