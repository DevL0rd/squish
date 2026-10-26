import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { port: { type: 'string' } }, strict: true });

export const PORT = Number(values.port ?? process.env['PORT'] ?? 5173);
export const SLOTS = 12;
export const FOOD_TARGET = 720;
export const THING_TARGET = 760;
export const CREATURE_TARGET = 34;
export const MAX_CELLS = 8;
export const TICK_RATE = 30;
export const SNAPSHOT_EVERY = 2;
export const FOOD_EVERY = 6;
export const CREATURE_EVERY = 2;
export const PING_INTERVAL = 20000;
export const FLOW_N = 64;
export const MERGE_DELAY = 10500;

export const BOT_NAMES = [
  'B. subtilis',
  'S. aureus',
  'P. aeruginosa',
  'E. coli',
  'V. cholerae',
  'S. cerevisiae',
  'A. niger',
  'T. thermophilus',
  'M. luteus',
  'L. lactis',
  'C. glutamicum',
  'R. rubrum',
  'N. oceanica',
  'D. radiodurans',
  'H. salinarum',
  'C. crescentus',
] as const;

export interface CreatureKind {
  readonly name: string;
  readonly size: number;
  readonly hue: number;
  readonly speed: number;
}

export const CREATURE_KINDS: readonly CreatureKind[] = [
  { name: 'paramecium', size: 9, hue: 92, speed: 34 },
  { name: 'euglena', size: 8, hue: 88, speed: 42 },
  { name: 'diatom', size: 7, hue: 44, speed: 18 },
  { name: 'rotifer', size: 9, hue: 26, speed: 28 },
  { name: 'bacillus', size: 4, hue: 196, speed: 30 },
  { name: 'coccus', size: 3, hue: 280, speed: 12 },
];
