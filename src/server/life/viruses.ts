import { CreatureState, EventKind } from '../../shared/protocol.ts';
import { severCell } from '../actions.ts';
import { along } from '../combat/strike.ts';
import type { Creature, Point } from '../types.ts';
import { emit, randomWorld, withinRange, world } from '../world.ts';
import { cellsNear, foodsNear } from './senses.ts';
import { spawnCreature } from './spawn.ts';
import { Behavior, speciesOf } from './species.ts';

const VIRUS_KIND = 11;
const VIRUS_TARGET = 200;
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

const CHARGE_EVERY = 150;
const CHARGE_TIME = 4000;
const SPINE_REACH = 700;
const SPINE_SPEED = 280;

function fire(virus: Creature): void {
  const count = 3 + Math.floor(Math.random() * 3);
  const range = virus.radius * 2 + SPINE_REACH;
  const nearby = cellsNear(virus.x, virus.y, range);
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const aim = { x: Math.cos(angle), y: Math.sin(angle) };
    const hits = nearby
      .map((member) => ({ member, t: along(virus, aim, member.cell, range, member.cell.radius) }))
      .filter((hit): hit is { member: (typeof hit)['member']; t: number } => hit.t !== null)
      .sort((a, b) => a.t - b.t);
    const first = hits[0];
    const reach = first ? first.t : range;
    if (first) severCell(first.member.player, first.member.cell, { x: -aim.y, y: aim.x }, 0.5, SPINE_SPEED);
    const end = { x: virus.x + aim.x * reach, y: virus.y + aim.y * reach };
    emit({
      kind: EventKind.Spine,
      cellId: first?.member.cell.id ?? 0,
      predatorId: virus.id,
      ...end,
      color: virus.color,
      amount: virus.radius,
    });
  }
}

export function chargeVirus(virus: Creature, dt: number): void {
  if (!isVirus(virus)) return;
  if (virus.state === CreatureState.Charge) {
    if (world.now < virus.stateUntil) return;
    fire(virus);
    virus.state = CreatureState.Swim;
    return;
  }
  if (Math.random() < dt / CHARGE_EVERY) {
    virus.state = CreatureState.Charge;
    virus.stateUntil = world.now + CHARGE_TIME;
  }
}
