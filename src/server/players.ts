import { createMind } from './bots/mind.ts';
import { clamp, hslToRgb, radiusFor, type Rgb } from '../shared/math.ts';
import { BOT_NAMES, SLOTS } from './config.ts';
import type { Cell, Player, Point } from './types.ts';
import { sendJson } from './transport.ts';
import { blockedAt } from './obstacles.ts';
import { NEUTRAL_PIGMENT } from './pigment.ts';
import { nextId, randomWorld, toBytes, world, worldCenter } from './world.ts';

const DEFAULT_HUE = 198;
const SPAWN_ATTEMPTS = 28;

interface CellOptions {
  readonly x: number;
  readonly y: number;
  readonly mass: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly mergeAt?: number;
  readonly boostX?: number;
  readonly boostY?: number;
  readonly digesting?: number;
  readonly pigment?: Rgb;
}

export function makeCell(options: CellOptions): Cell {
  return {
    id: nextId('cell'),
    x: options.x,
    y: options.y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    mass: options.mass,
    radius: radiusFor(options.mass),
    mergeAt: options.mergeAt ?? 0,
    boostX: options.boostX ?? 0,
    boostY: options.boostY ?? 0,
    parasites: [],
    digesting: options.digesting ?? 0,
    pigment: options.pigment ?? NEUTRAL_PIGMENT,
    gut: -1,
    wounds: 0,
  };
}

export function playerColor(player: Player, saturation: number, lightness: number): Rgb {
  return toBytes(hslToRgb(player.hue >= 0 ? player.hue : DEFAULT_HUE, saturation, lightness));
}

export function randomName(): string {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)] ?? BOT_NAMES[0];
}

function clearance(x: number, y: number): number {
  let score = 1e9;
  for (const player of world.players.values()) {
    for (const cell of player.cells) score = Math.min(score, Math.hypot(cell.x - x, cell.y - y) - cell.radius);
  }
  return score;
}

function spawnPoint(minDistance: number): Point {
  let best = { x: randomWorld(220), y: randomWorld(220) };
  let bestScore = -1;
  for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt += 1) {
    const candidate = { x: randomWorld(260), y: randomWorld(260) };
    const score = blockedAt(candidate, 120) ? -1 : clearance(candidate.x, candidate.y);
    if (score <= bestScore) continue;
    bestScore = score;
    best = candidate;
    if (score > minDistance) break;
  }
  return best;
}

export function spawnPlayer(player: Player, mass = 55): void {
  const point = spawnPoint(700);
  player.cells = [makeCell({ x: point.x, y: point.y, mass })];
  player.target.x = point.x;
  player.target.y = point.y;
  player.alive = true;
  player.graceUntil = world.now + (player.bot ? 2600 : 9000);
  player.respawnAt = 0;
  player.boost = 0;
  player.level = 1;
  player.defense = 0;
}

interface PlayerOptions {
  readonly name: string;
  readonly hue: number;
  readonly bot?: boolean;
  readonly admin?: boolean;
  readonly ws?: Player['ws'];
}

export function createPlayer(options: PlayerOptions): Player {
  const player: Player = {
    id: nextId('player'),
    name: options.name,
    hue: options.hue === -1 ? -1 : clamp(Math.round(options.hue), 0, 359),
    bot: options.bot ?? false,
    admin: options.admin ?? false,
    mind: options.bot ? createMind() : null,
    ws: options.ws ?? null,
    cells: [],
    target: worldCenter(),
    alive: false,
    graceUntil: 0,
    respawnAt: 0,
    lastSplit: 0,
    lastEject: 0,
    lastKiller: null,
    effects: [],
    boost: 0,
    level: 1,
    defense: 0,
    wanderPhase: Math.random() * Math.PI * 2,
  };
  world.players.set(player.id, player);
  spawnPlayer(player);
  return player;
}

export function createBot(): Player {
  const used = new Set([...world.players.values()].filter((player) => player.bot).map((player) => player.name));
  const available = BOT_NAMES.filter((name) => !used.has(name));
  const name = available[Math.floor(Math.random() * available.length)] ?? randomName();
  return createPlayer({ bot: true, name, hue: -1 });
}

export function humanCount(): number {
  return [...world.players.values()].filter((player) => !player.bot).length;
}

export function botCount(): number {
  return world.players.size - humanCount();
}

export function broadcastRoster(): void {
  const players = [...world.players.values()].map(({ id, name, hue, bot, alive }) => ({ id, name, hue, bot, alive }));
  for (const client of world.clients) sendJson(client.ws, { t: 'roster', players });
}

export function ensurePopulation(): void {
  const desired = Math.max(0, SLOTS - humanCount());
  const bots = [...world.players.values()].filter((player) => player.bot);
  while (bots.length < desired) bots.push(createBot());
  for (const bot of bots.splice(desired)) world.players.delete(bot.id);
  broadcastRoster();
}

export function removePlayer(player: Player): void {
  world.players.delete(player.id);
  ensurePopulation();
}

export function markPlayerDead(player: Player, killer: string): void {
  player.alive = false;
  if (player.bot) {
    player.respawnAt = world.now + 1800 + Math.random() * 1400;
    return;
  }
  player.respawnAt = world.now + 100000;
  sendJson(player.ws, { t: 'dead', by: killer });
}
