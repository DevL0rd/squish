import { encodeCreatures } from '../../shared/codec.ts';
import { clamp, WORLD } from '../../shared/math.ts';
import { CreatureState } from '../../shared/protocol.ts';
import { CREATURE_TARGET, THING_TARGET } from '../config.ts';
import { flowAt } from '../flow.ts';
import type { Client, Creature } from '../types.ts';
import { nextId, playerCenter, randomWorld, thingCount, withinRange, world } from '../world.ts';
import { BRAINS } from './brains.ts';
import { holdLatch, resolveContact } from './contacts.ts';
import { buildFoodGrid, foodsNear } from './senses.ts';
import { doublingTime, spawnCreature } from './spawn.ts';
import { Behavior, pickSpecies, speciesOf } from './species.ts';
import { feedVirus, keepViruses } from './viruses.ts';

const WALL_MARGIN = 60;
const FLOW_CARRY = 0.62;
const DRAG = 3;
const VIRUS_INERTIA_RADIUS = 18;
const VISIBLE_RANGE = 2400;
const DIVIDE_TIME = 1.6;
const ROUND_SPECIES = new Set([5]);

function addCreature(): void {
  spawnCreature(pickSpecies(), randomWorld(180), randomWorld(180));
}

export function seedCreatures(): void {
  for (let i = 0; i < CREATURE_TARGET && thingCount() < THING_TARGET; i += 1) addCreature();
}

function census(): Map<number, number> {
  const counts = new Map<number, number>();
  for (const creature of world.creatures.values()) counts.set(creature.kind, (counts.get(creature.kind) ?? 0) + 1);
  return counts;
}

function startDivision(creature: Creature, counts: Map<number, number>): void {
  const meta = speciesOf(creature.kind);
  const crowded = (counts.get(creature.kind) ?? 0) >= meta.cap || thingCount() >= THING_TARGET;
  if (!meta.cap || world.now < creature.divideAt || crowded || creature.state === CreatureState.Divide) return;
  creature.state = CreatureState.Divide;
  creature.stateUntil = world.now + DIVIDE_TIME * 1000;
  counts.set(creature.kind, (counts.get(creature.kind) ?? 0) + 1);
}

function finishDivision(creature: Creature): void {
  const offset = creature.radius * (ROUND_SPECIES.has(creature.kind) ? 0.96 : 1.1);
  const dx = Math.cos(creature.angle) * offset;
  const dy = Math.sin(creature.angle) * offset;
  creature.state = CreatureState.Swim;
  creature.stateUntil = world.now + 1000;
  creature.divideAt = world.now + doublingTime();
  const daughter: Creature = {
    ...creature,
    id: nextId('creature'),
    x: creature.x + dx,
    y: creature.y + dy,
    phase: Math.random() * 6,
  };
  daughter.divideAt = world.now + doublingTime();
  creature.x -= dx;
  creature.y -= dy;
  world.creatures.set(daughter.id, daughter);
}

function think(creature: Creature, dt: number): number {
  if (creature.state !== CreatureState.Divide) return BRAINS[speciesOf(creature.kind).brain](creature, dt);
  if (world.now >= creature.stateUntil) finishDivision(creature);
  return 0;
}

function move(creature: Creature, dt: number, thrust: number): void {
  const meta = speciesOf(creature.kind);
  const flow = flowAt(creature);
  const desiredX = Math.cos(creature.heading) * meta.speed * thrust;
  const desiredY = Math.sin(creature.heading) * meta.speed * thrust;
  const inertia = meta.behavior === Behavior.Virus ? Math.max(1, creature.radius / VIRUS_INERTIA_RADIUS) : 1;
  const carry = FLOW_CARRY / inertia;
  const grip = 1 - Math.exp((-dt * DRAG) / inertia);
  creature.vx += (desiredX + flow.x * carry - creature.vx) * grip;
  creature.vy += (desiredY + flow.y * carry - creature.vy) * grip;
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
  creature.phase += dt * (1.2 + Math.abs(thrust));
  const turn = Math.atan2(Math.sin(creature.heading - creature.angle), Math.cos(creature.heading - creature.angle));
  if (creature.state !== CreatureState.Divide) creature.angle += turn * Math.min(1, dt * 5);
  if (creature.x < WALL_MARGIN || creature.x > WORLD - WALL_MARGIN) creature.heading = Math.PI - creature.heading;
  if (creature.y < WALL_MARGIN || creature.y > WORLD - WALL_MARGIN) creature.heading = -creature.heading;
  creature.x = clamp(creature.x, WALL_MARGIN, WORLD - WALL_MARGIN);
  creature.y = clamp(creature.y, WALL_MARGIN, WORLD - WALL_MARGIN);
}

function graze(creature: Creature): void {
  const meta = speciesOf(creature.kind);
  if (!meta.grazer) return;
  const meal = foodsNear(creature.x, creature.y, creature.radius + 14).find(
    (food) => food.radius < creature.radius * 1.2,
  );
  if (!meal) return;
  world.foods.delete(meal.id);
  creature.energy = Math.min(1.6, creature.energy + 0.12);
  creature.radius = Math.min(meta.size * meta.spread[1] * 1.2, creature.radius + 0.3);
  creature.divideAt -= 3000;
}

function live(creature: Creature, dt: number, counts: Map<number, number>): boolean {
  if (creature.hostId) return holdLatch(creature);
  feedVirus(creature);
  startDivision(creature, counts);
  move(creature, dt, think(creature, dt));
  graze(creature);
  return resolveContact(creature);
}

export function updateCreatures(dt: number): void {
  buildFoodGrid();
  const counts = census();
  for (const creature of world.creatures.values()) {
    if (live(creature, dt, counts)) world.creatures.delete(creature.id);
  }
  while (world.creatures.size < CREATURE_TARGET && thingCount() < THING_TARGET) addCreature();
  keepViruses(counts);
}

export function creaturePacket(client: Client): Uint8Array {
  const center = client.player?.cells.length ? playerCenter(client.player) : client.view;
  const visible = [...world.creatures.values()].filter((creature) => withinRange(creature, center, VISIBLE_RANGE));
  return encodeCreatures(world.tick, visible);
}
