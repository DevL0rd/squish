import type { Cell, Creature, Food, Player } from '../types.ts';
import { world } from '../world.ts';

const BUCKET = 220;

export interface Nearest {
  readonly player: Player;
  readonly cell: Cell;
  readonly distance: number;
}

let grid = new Map<number, Food[]>();

function key(bx: number, by: number): number {
  return by * 4096 + bx;
}

export function buildFoodGrid(): void {
  grid = new Map();
  for (const food of world.foods.values()) {
    const slot = key(Math.floor(food.x / BUCKET), Math.floor(food.y / BUCKET));
    const bucket = grid.get(slot);
    if (bucket) bucket.push(food);
    else grid.set(slot, [food]);
  }
}

export function foodsNear(x: number, y: number, range: number): Food[] {
  const found: Food[] = [];
  const reach = Math.ceil(range / BUCKET);
  const bx = Math.floor(x / BUCKET);
  const by = Math.floor(y / BUCKET);
  for (let oy = -reach; oy <= reach; oy += 1) {
    for (let ox = -reach; ox <= reach; ox += 1) {
      for (const food of grid.get(key(bx + ox, by + oy)) ?? []) {
        if (world.foods.has(food.id) && Math.hypot(food.x - x, food.y - y) < range) found.push(food);
      }
    }
  }
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

export function nearestCell(creature: Creature, range: number): Nearest | null {
  let best: Nearest | null = null;
  for (const player of world.players.values()) {
    for (const cell of player.cells) {
      const distance = Math.hypot(cell.x - creature.x, cell.y - creature.y) - cell.radius;
      if (distance < range && (!best || distance < best.distance)) best = { player, cell, distance };
    }
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
