import type { Cell, Creature, Food, Player } from '../types.ts';
import { WORLD } from '../../shared/math.ts';
import { world } from '../world.ts';

const BUCKET = 220;

export interface Nearest {
  readonly player: Player;
  readonly cell: Cell;
  readonly distance: number;
}

const SIDE = Math.ceil(WORLD / BUCKET) + 1;
const heads = new Int32Array(SIDE * SIDE);
let next = new Int32Array(0);
let pool: Food[] = [];
let bigFoods: Food[] = [];
const SMALL_FOOD = 160;

function slotOf(value: number): number {
  return Math.min(SIDE - 1, Math.max(0, Math.floor(value / BUCKET)));
}

export function buildFoodGrid(): void {
  pool = [];
  bigFoods = [];
  for (const food of world.foods.values()) (food.radius > SMALL_FOOD ? bigFoods : pool).push(food);
  if (next.length < pool.length) next = new Int32Array(pool.length * 2);
  heads.fill(-1);
  pool.forEach((food, index) => {
    const slot = slotOf(food.y) * SIDE + slotOf(food.x);
    next[index] = heads[slot] ?? -1;
    heads[slot] = index;
  });
}

function touchesRange(food: Food, x: number, y: number, range: number): boolean {
  const dx = food.x - x;
  const dy = food.y - y;
  const reach = range + food.radius;
  return dx * dx + dy * dy < reach * reach;
}

function collect(found: Food[], slot: number, x: number, y: number, range: number): void {
  for (let index = heads[slot] ?? -1; index !== -1; index = next[index] ?? -1) {
    const food = pool[index];
    if (!food || !world.foods.has(food.id)) continue;
    if (touchesRange(food, x, y, range)) found.push(food);
  }
}

export function foodsNear(x: number, y: number, range: number): Food[] {
  const found: Food[] = [];
  const reach = range + SMALL_FOOD;
  const [x0, x1, y0, y1] = [slotOf(x - reach), slotOf(x + reach), slotOf(y - reach), slotOf(y + reach)];
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) collect(found, gy * SIDE + gx, x, y, range);
  }
  for (const food of bigFoods) if (world.foods.has(food.id) && touchesRange(food, x, y, range)) found.push(food);
  return found;
}

export function nearestFood(creature: Creature, range: number): Food | null {
  let best: Food | null = null;
  let bestDistance = range;
  for (const food of foodsNear(creature.x, creature.y, range)) {
    const distance = Math.hypot(food.x - creature.x, food.y - creature.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = food;
    }
  }
  return best;
}

interface Member {
  readonly player: Player;
  readonly cell: Cell;
}

const cellHeads = new Int32Array(SIDE * SIDE);
let cellNext = new Int32Array(0);
let members: Member[] = [];
let largestCell = 0;

export function buildCellGrid(): void {
  members = [];
  for (const player of world.players.values()) for (const cell of player.cells) members.push({ player, cell });
  if (cellNext.length < members.length) cellNext = new Int32Array(members.length * 2);
  cellHeads.fill(-1);
  largestCell = 0;
  members.forEach((member, index) => {
    const slot = slotOf(member.cell.y) * SIDE + slotOf(member.cell.x);
    cellNext[index] = cellHeads[slot] ?? -1;
    cellHeads[slot] = index;
    largestCell = Math.max(largestCell, member.cell.radius);
  });
}

export function cellsNear(x: number, y: number, range: number): Member[] {
  const reach = Math.max(0, range) + largestCell;
  const [x0, x1, y0, y1] = [slotOf(x - reach), slotOf(x + reach), slotOf(y - reach), slotOf(y + reach)];
  const found: Member[] = [];
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) {
      for (let index = cellHeads[gy * SIDE + gx] ?? -1; index !== -1; index = cellNext[index] ?? -1) {
        const member = members[index];
        if (member) found.push(member);
      }
    }
  }
  return found;
}

export function nearestCell(creature: Creature, range: number): Nearest | null {
  let best: Nearest | null = null;
  for (const member of cellsNear(creature.x, creature.y, range)) {
    const distance = Math.hypot(member.cell.x - creature.x, member.cell.y - creature.y) - member.cell.radius;
    if (distance < range && (!best || distance < best.distance)) best = { ...member, distance };
  }
  return best;
}

export function findCell(id: number): Nearest | null {
  for (const player of world.players.values()) {
    const cell = player.cells.find((candidate) => candidate.id === id);
    if (cell) return { player, cell, distance: 0 };
  }
  return null;
}

export function bearing(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}
