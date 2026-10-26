import type { Creature, Point } from '../types.ts';
import { randomWorld, withinRange, world } from '../world.ts';
import { foodsNear } from './senses.ts';
import { spawnCreature } from './spawn.ts';
import { Behavior, speciesOf } from './species.ts';

const VIRUS_KIND = 11;
const VIRUS_TARGET = 50;
const FEEDS_TO_SPLIT = 7;
const LAUNCH_SPEED = 650;

function isVirus(creature: Creature): boolean {
  return speciesOf(creature.kind).behavior === Behavior.Virus;
}

function divide(virus: Creature): void {
  const dx = Math.cos(virus.heading);
  const dy = Math.sin(virus.heading);
  spawnCreature(VIRUS_KIND, virus.x + dx * virus.radius * 2, virus.y + dy * virus.radius * 2, {
    radius: virus.baseRadius,
    baseRadius: virus.baseRadius,
    color: virus.color,
    vx: dx * LAUNCH_SPEED,
    vy: dy * LAUNCH_SPEED,
  });
  virus.radius = virus.baseRadius;
  virus.feeds = 0;
}

export function feedVirus(virus: Creature): void {
  if (!isVirus(virus)) return;
  for (const food of foodsNear(virus.x, virus.y, virus.radius + 40)) {
    if (!food.ejecta || !withinRange(food, virus, virus.radius + food.radius * 0.5)) continue;
    world.foods.delete(food.id);
    pushVirus(virus, food, food.radius ** 2 * 0.6);
  }
}

export function pushVirus(virus: Creature, from: Point, growth: number): void {
  if (!isVirus(virus)) return;
  virus.heading = Math.atan2(virus.y - from.y, virus.x - from.x);
  virus.radius = Math.sqrt(virus.radius ** 2 + growth);
  virus.feeds += 1;
  if (virus.feeds >= FEEDS_TO_SPLIT) divide(virus);
}

export function keepViruses(counts: Map<number, number>): void {
  for (let count = counts.get(VIRUS_KIND) ?? 0; count < VIRUS_TARGET; count += 1) {
    spawnCreature(VIRUS_KIND, randomWorld(300), randomWorld(300));
  }
}
