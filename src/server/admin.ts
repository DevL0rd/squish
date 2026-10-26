import { clamp, radiusFor, WORLD } from '../shared/math.ts';
import { AdminAction, FoodVariety, INFECTIONS, type AdminCatalog } from '../shared/protocol.ts';
import { ADMIN, ADMIN_KEY, ADMIN_NAME } from './config.ts';
import { addFood } from './food.ts';
import { bossPoint, endBoss, forceBoss, forcePipette, toggleRapid } from './hazards/events.ts';
import { infect } from './infection.ts';
import { SPECIES } from './life/species.ts';
import { spawnCreature } from './life/spawn.ts';
import type { Player } from './types.ts';
import { sendJson } from './transport.ts';

const FOOD_BURST = 8;
const FOOD_SCATTER = 120;
const MASS_GIFT = 1000;
const VARIETIES = Object.values(FoodVariety);

export function isAdmin(name: string, local: boolean, key: unknown): boolean {
  if (!ADMIN || name !== ADMIN_NAME) return false;
  return local || (ADMIN_KEY.length > 0 && key === ADMIN_KEY);
}

export function adminCatalog(): AdminCatalog {
  return { species: SPECIES.map((item) => item.name) };
}

function tell(player: Player, text: string): void {
  if (player.ws) sendJson(player.ws, { t: 'announce', text, danger: false });
}

function scatterFood(player: Player, variety: number): void {
  if (!VARIETIES.includes(variety as (typeof VARIETIES)[number])) return;
  for (let i = 0; i < FOOD_BURST; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * FOOD_SCATTER;
    addFood({
      variety,
      x: clamp(player.target.x + Math.cos(angle) * distance, 0, WORLD),
      y: clamp(player.target.y + Math.sin(angle) * distance, 0, WORLD),
    });
  }
}

function giveMass(player: Player): void {
  const cell = player.cells[0];
  if (!cell) return;
  cell.mass += MASS_GIFT;
  cell.radius = radiusFor(cell.mass);
}

function teleport(player: Player): void {
  const anchor = player.cells[0];
  if (!anchor) return;
  const dx = player.target.x - anchor.x;
  const dy = player.target.y - anchor.y;
  for (const cell of player.cells) {
    cell.x = clamp(cell.x + dx, cell.radius, WORLD - cell.radius);
    cell.y = clamp(cell.y + dy, cell.radius, WORLD - cell.radius);
  }
}

const VISIT_OFFSET = 700;

function visitBoss(player: Player): void {
  const point = bossPoint();
  if (!point) return;
  player.target.x = point.x + VISIT_OFFSET;
  player.target.y = point.y;
  teleport(player);
}

function infectSelf(player: Player, type: number): void {
  const cell = player.cells[0];
  if (cell && INFECTIONS[type]) infect(player, cell, type, [240, 200, 120]);
}

function hazardAction(player: Player, action: number, arg: number): void {
  if (action === AdminAction.Boss) forceBoss(arg);
  else if (action === AdminAction.EndBoss) endBoss();
  else if (action === AdminAction.Pipette) forcePipette(player, arg);
  else if (action === AdminAction.Rapid) tell(player, toggleRapid() ? 'Rapid events on' : 'Rapid events off');
}

function playerAction(player: Player, action: number, arg: number): void {
  if (action === AdminAction.Creature && SPECIES[arg]) spawnCreature(arg, player.target.x, player.target.y);
  else if (action === AdminAction.Food) scatterFood(player, arg);
  else if (action === AdminAction.Infect) infectSelf(player, arg);
  else if (action === AdminAction.Mass) giveMass(player);
  else if (action === AdminAction.Teleport) teleport(player);
  else if (action === AdminAction.Visit) visitBoss(player);
}

export function adminCommand(player: Player, action: unknown, arg: unknown): void {
  if (!player.admin || typeof action !== 'number' || typeof arg !== 'number') return;
  if (action <= AdminAction.Rapid) hazardAction(player, action, Math.trunc(arg));
  else playerAction(player, action, Math.trunc(arg));
}
