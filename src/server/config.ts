import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { port: { type: 'string' }, admin: { type: 'boolean' }, 'admin-key': { type: 'string' } },
  strict: true,
});

export const PORT = Number(values.port ?? process.env['PORT'] ?? 5173);
export const ADMIN = values.admin === true;
export const ADMIN_NAME = 'DevL0rd';
export const ADMIN_KEY = values['admin-key'] ?? process.env['SQUISH_ADMIN_KEY'] ?? '';
export const SLOTS = 100;
export const FOOD_TARGET = 9600;
export const THING_TARGET = 10480;
export const CREATURE_TARGET = 680;
export const TICK_RATE = 30;
export const SNAPSHOT_EVERY = 2;
export const FOOD_EVERY = 6;
export const CREATURE_EVERY = 2;
export const PING_INTERVAL = 20000;
export const FLOW_N = 192;
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
