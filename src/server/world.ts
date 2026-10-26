import type { WireEvent } from '../shared/protocol.ts';
import { WORLD } from '../shared/math.ts';
import type { Client, Creature, Food, Member, Player, Point } from './types.ts';

export const world = {
  now: Date.now(),
  tick: 0,
  clients: new Set<Client>(),
  players: new Map<number, Player>(),
  foods: new Map<number, Food>(),
  creatures: new Map<number, Creature>(),
  events: [] as WireEvent[],
};

const counters = { player: 1, cell: 1, food: 1, creature: 1 };

export function nextId(kind: keyof typeof counters): number {
  const id = counters[kind];
  counters[kind] += 1;
  return id;
}

export function randomWorld(margin: number): number {
  return margin + Math.random() * (WORLD - margin * 2);
}

export function thingCount(): number {
  return world.foods.size + world.creatures.size;
}

export function worldCenter(): Point {
  return { x: WORLD / 2, y: WORLD / 2 };
}

export function playerCenter(player: Player): Point {
  if (!player.cells.length) return worldCenter();
  let x = 0;
  let y = 0;
  let total = 0;
  for (const cell of player.cells) {
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    total += cell.mass;
  }
  return { x: x / total, y: y / total };
}

export function playerMass(player: Player): number {
  return player.cells.reduce((total, cell) => total + cell.mass, 0);
}

export function allMembers(): Member[] {
  const members: Member[] = [];
  for (const player of world.players.values()) {
    for (const cell of player.cells) members.push({ player, cell });
  }
  return members;
}

export function withinRange(point: Point, center: Point, limit: number): boolean {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return dx * dx + dy * dy < limit * limit;
}

export function toBytes(color: readonly [number, number, number]): [number, number, number] {
  return [Math.round(color[0] * 255), Math.round(color[1] * 255), Math.round(color[2] * 255)];
}
