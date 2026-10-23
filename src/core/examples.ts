// Example maps, offered in File > Examples and the welcome dialog. The first
// is the starter dungeon shown on a first visit. Each is built in code, so no
// map files ship with the app.
import type { LayerContent, MapData, Pair } from '../types/map';
import { newLayer } from './layers';
import { DEFAULT_NEW_MAP } from './newMap';
import { DEFAULT_RIVER, DEFAULT_ROAD, riverPolygon } from './geometry/river';
import { addPaint, addWater, applyShape, circlePolygon, pathPolygon, polygonFromPoints } from './geometry/region';

export interface ExampleMap {
  id: string;
  title: string;
  blurb: string;
  load: () => MapData;
}

type Cells = { [key: string]: boolean };

/** Marks every cell from (x0, y0) to (x1, y1), both included */
function fill(cells: Cells, x0: number, x1: number, y0: number, y1: number) {
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) cells[`${x},${y}`] = true;
  }
}

function sunkenCrypt(): MapData {
  const rooms: Cells = {};
  const water: Cells = {};
  fill(rooms, -3, 3, -10, -7); // entrance courtyard
  fill(rooms, 0, 0, -6, -3); // hallway
  fill(rooms, -5, 5, -2, 6); // grand hall
  fill(water, 1, 4, 1, 4); // spring in the hall
  rooms['6,1'] = true; // passage to the east chamber
  fill(rooms, 7, 11, -1, 3);
  rooms['-6,4'] = true; // secret passage to the west cave
  fill(rooms, -12, -7, 2, 7);

  return {
    version: 4,
    title: 'The Sunken Crypt',
    gridSize: 40,
    ...DEFAULT_NEW_MAP,
    background: 'fitted-stone',
    lighting: false,
    darkness: 0.75,
    levels: [
      {
        id: 'level1',
        name: 'Level 1',
        layers: [
          newLayer('layer1', 'Dungeon', {
            rooms,
            water,
            foliage: {
              '-4,-9': { type: 'tree', seed: 101 },
              '4,-9': { type: 'tree', seed: 202 },
              '-5,-8': { type: 'bush', seed: 303 },
              '5,-8': { type: 'rock', seed: 404 },
            },
            doors: [
              { id: 'd1', x: 0, y: -6, orientation: 'horizontal', type: 'standard' },
              { id: 'd2', x: 6, y: 1, orientation: 'vertical', type: 'standard' },
              { id: 'd3', x: -5, y: 4, orientation: 'vertical', type: 'secret' },
            ],
            stairs: [{ id: 's1', x: 0, y: -10, width: 2, height: 1, direction: 'down', steps: 4 }],
            props: [
              { id: 'p1', x: -3, y: 0, type: 'pillar', rotation: 0 },
              { id: 'p2', x: -3, y: 4, type: 'pillar', rotation: 0 },
              { id: 'p3', x: 9, y: 1, type: 'altar', rotation: 0 },
              { id: 'p4', x: -10, y: 3, type: 'chest', rotation: 0 },
              { id: 'p5', x: -4, y: 2, type: 'torch', rotation: 0 },
            ],
            labels: [
              { id: 'l1', x: 0.5, y: 5.5, text: 'Grand Hall', size: 20 },
              { id: 'l2', x: -9, y: 6.5, text: 'Hidden Vault', size: 16 },
            ],
          }),
        ],
      },
    ],
  };
}

function riversideFarm(): MapData {
  const ground = newLayer('layer1', 'Ground');
  addWater(ground, riverPolygon([[-6, -14], [-3, -6], [-6, 2], [-2, 9], [-4, 16]], { ...DEFAULT_RIVER, seed: 7 }));
  addPaint(ground, riverPolygon([[14, -12], [7, -4], [4, 3], [6, 10], [3, 16]], { ...DEFAULT_ROAD, seed: 3 }), 'dirt');
  addPaint(ground, pathPolygon([[4.5, 1.5], [10, 1.5]], 1.2), 'dirt');
  addPaint(ground, polygonFromPoints([[10, 5], [15, 5], [15, 9], [10, 9]]), 'sand');

  const foliage: LayerContent['foliage'] = {};
  const trees: Pair[] = [[-12, -10], [-10, -12], [-13, -6], [-11, -3], [-14, 1], [-12, 5], [-10, 11], [-13, 13], [1, -12], [3, -14], [18, -2], [19, 4], [17, 12], [12, 14], [-1, 13]];
  trees.forEach(([x, y], i) => (foliage[`${x},${y}`] = { type: 'tree', seed: 11 + i * 37 }));
  const bushes: Pair[] = [[-9, -8], [-8, 4], [0, -9], [2, 6], [16, 1], [14, 11], [-9, 14]];
  bushes.forEach(([x, y], i) => (foliage[`${x},${y}`] = { type: 'bush', seed: 503 + i * 41 }));
  const rocks: Pair[] = [[-2, -3], [-1, 3], [-8, 9], [1, 15]];
  rocks.forEach(([x, y], i) => (foliage[`${x},${y}`] = { type: 'rock', seed: 907 + i * 13 }));

  const rooms: Cells = {};
  const floors: { [key: string]: 'planks' } = {};
  fill(rooms, 10, 15, -3, 2); // farmhouse
  fill(rooms, 16, 17, -1, 0); // pantry
  for (const key of Object.keys(rooms)) floors[key] = 'planks';
  const buildings = newLayer('layer2', 'Buildings', {
    rooms,
    floors,
    doors: [
      { id: 'd1', x: 10, y: 1, orientation: 'vertical', type: 'standard' },
      { id: 'd2', x: 16, y: -1, orientation: 'vertical', type: 'standard' },
    ],
    props: [
      { id: 'p1', x: 12, y: -2, type: 'table', rotation: 0 },
      { id: 'p2', x: 14, y: 1, type: 'chest', rotation: 0 },
      { id: 'p3', x: 17, y: 0, type: 'barrel', rotation: 0 },
      { id: 'p4', x: 11, y: 7, type: 'barrel', rotation: 0 },
      { id: 'p5', x: 13, y: 6, type: 'barrel', rotation: 0 },
    ],
    labels: [
      { id: 'l1', x: 12.5, y: -4.5, text: 'Farmhouse', size: 18, style: 'box' },
      { id: 'l2', x: -5, y: -1, text: 'Willow Brook', size: 16 },
      { id: 'l3', x: 12.5, y: 10.5, text: 'Yard', size: 14 },
    ],
  });

  return {
    version: 4,
    title: 'Riverside Farm',
    gridSize: 40,
    ...DEFAULT_NEW_MAP,
    background: 'grass',
    hatchStyle: 'none',
    lighting: false,
    darkness: 0.75,
    levels: [{ id: 'level1', name: 'Level 1', layers: [{ ...ground, foliage }, buildings] }],
  };
}

function emberCavern(): MapData {
  const cave = newLayer('layer1', 'Cave');
  const chambers: [number, number, number][] = [[0, 0, 4.5], [-2.5, 2, 3], [9, -3, 3.5], [11, -5.5, 2.2], [-9, -5, 3], [-1, 11, 4]];
  for (const [x, y, r] of chambers) applyShape(cave, [circlePolygon(x, y, r)], 'add');
  applyShape(cave, pathPolygon([[3, -1], [6.5, -2.5]], 2), 'add');
  applyShape(cave, pathPolygon([[-3, -2], [-6.5, -4]], 1.6), 'add');
  applyShape(cave, pathPolygon([[0, 4], [-1, 7.5]], 1.8), 'add');
  addWater(cave, [circlePolygon(-0.5, 12, 2)], 'lava');
  addWater(cave, [circlePolygon(-9.5, -5.5, 1.4)], 'solid');

  cave.props = [
    { id: 'p1', x: 2, y: -3, type: 'torch', rotation: 0 },
    { id: 'p2', x: -3, y: 3, type: 'torch', rotation: 0 },
    { id: 'p3', x: 8, y: -2, type: 'torch', rotation: 0 },
    { id: 'p4', x: 11, y: -6, type: 'chest', rotation: 0 },
    { id: 'p5', x: -1, y: 0, type: 'altar', rotation: 0 },
  ];
  cave.lights = [{ id: 'g1', x: -9, y: -4, color: '#7fc8ff', radius: 3, intensity: 0.6 }];
  cave.foliage = {
    '1,2': { type: 'rock', seed: 17 },
    '10,-2': { type: 'rock', seed: 61 },
    '-3,10': { type: 'rock', seed: 89 },
  };
  cave.labels = [
    { id: 'l1', x: 0.5, y: -3.5, text: 'Shrine of Embers', size: 16 },
    { id: 'l2', x: -9, y: -8.5, text: 'Still Pool', size: 14 },
    { id: 'l3', x: -1, y: 15.5, text: 'The Forge Pit', size: 14 },
  ];

  return {
    version: 4,
    title: 'Ember Cavern',
    gridSize: 40,
    ...DEFAULT_NEW_MAP,
    background: 'rough-stone',
    hatchStyle: 'dyson',
    lighting: true,
    darkness: 0.8,
    levels: [{ id: 'level1', name: 'Level 1', layers: [cave] }],
  };
}

export const EXAMPLES: ExampleMap[] = [
  { id: 'sunken-crypt', title: 'The Sunken Crypt', blurb: 'A small dungeon with a spring and a hidden vault', load: sunkenCrypt },
  { id: 'riverside-farm', title: 'Riverside Farm', blurb: 'Outdoors: a farmhouse by a brook, a road and woods', load: riversideFarm },
  { id: 'ember-cavern', title: 'Ember Cavern', blurb: 'A torchlit cave with a lava pit, in the dark', load: emberCavern },
];

/** The map shown on a first visit */
export function starterMap(): MapData {
  return EXAMPLES[0].load();
}
