import { encodeCreatures } from '../shared/codec.ts';
import { clamp, hslToRgb, WORLD } from '../shared/math.ts';
import { EventKind } from '../shared/protocol.ts';
import { CREATURE_KINDS, CREATURE_TARGET, THING_TARGET, type CreatureKind } from './config.ts';
import { flowAt } from './flow.ts';
import type { Cell, Client, Creature, Food } from './types.ts';
import { nextId, playerCenter, randomWorld, thingCount, toBytes, withinRange, world } from './world.ts';

const WALL_MARGIN = 60;
const VISIBLE_RANGE = 2200;

function kindOf(creature: Creature): CreatureKind {
  const kind = CREATURE_KINDS[creature.kind];
  if (!kind) throw new Error(`unknown creature kind ${creature.kind}`);
  return kind;
}

function addCreature(): void {
  const kind = Math.floor(Math.random() * CREATURE_KINDS.length);
  const meta = CREATURE_KINDS[kind];
  if (!meta) return;
  const creature: Creature = {
    id: nextId('creature'),
    kind,
    x: randomWorld(180),
    y: randomWorld(180),
    vx: (Math.random() - 0.5) * meta.speed,
    vy: (Math.random() - 0.5) * meta.speed,
    radius: meta.size * (0.82 + Math.random() * 0.4),
    angle: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    energy: 0.4 + Math.random() * 0.6,
    color: toBytes(hslToRgb(meta.hue + (Math.random() * 16 - 8), 0.42, 0.52)),
  };
  world.creatures.set(creature.id, creature);
}

function refill(): void {
  while (world.creatures.size < CREATURE_TARGET && thingCount() < THING_TARGET) addCreature();
}

export function seedCreatures(): void {
  for (let i = 0; i < CREATURE_TARGET && thingCount() < THING_TARGET; i += 1) addCreature();
}

function swim(creature: Creature, dt: number): void {
  const field = flowAt(creature);
  creature.phase += dt * (1.6 + creature.energy);
  creature.vx += (field.x * 1.6 + Math.cos(creature.phase * 0.7) * 12) * dt;
  creature.vy += (field.y * 1.6 + Math.sin(creature.phase * 0.55) * 12) * dt;
  const drag = Math.exp(-dt * 0.9);
  creature.vx *= drag;
  creature.vy *= drag;
  const speed = Math.hypot(creature.vx, creature.vy);
  const maxSpeed = kindOf(creature).speed;
  if (speed > maxSpeed) {
    creature.vx = (creature.vx / speed) * maxSpeed;
    creature.vy = (creature.vy / speed) * maxSpeed;
  }
  creature.x += creature.vx * dt;
  creature.y += creature.vy * dt;
  creature.angle = Math.atan2(creature.vy, creature.vx);
  if (creature.x < WALL_MARGIN || creature.x > WORLD - WALL_MARGIN) creature.vx *= -0.8;
  if (creature.y < WALL_MARGIN || creature.y > WORLD - WALL_MARGIN) creature.vy *= -0.8;
  creature.x = clamp(creature.x, WALL_MARGIN, WORLD - WALL_MARGIN);
  creature.y = clamp(creature.y, WALL_MARGIN, WORLD - WALL_MARGIN);
}

function graze(creature: Creature): void {
  const reach = creature.radius + 16;
  let meal: Food | undefined;
  for (const food of world.foods.values()) {
    if (withinRange(food, creature, reach)) {
      meal = food;
      break;
    }
  }
  if (!meal) return;
  world.foods.delete(meal.id);
  creature.energy = Math.min(1.6, creature.energy + 0.12);
  creature.radius = Math.min(kindOf(creature).size * 1.5, creature.radius + 0.35);
  creature.color = [
    creature.color[0] * 0.86 + meal.color[0] * 0.14,
    creature.color[1] * 0.86 + meal.color[1] * 0.14,
    creature.color[2] * 0.86 + meal.color[2] * 0.14,
  ];
}

function swallowedBy(creature: Creature): Cell | undefined {
  for (const player of world.players.values()) {
    const cell = player.cells.find(
      (candidate) =>
        candidate.radius >= creature.radius * 1.08 && withinRange(creature, candidate, candidate.radius * 0.96),
    );
    if (cell) return cell;
  }
  return undefined;
}

export function updateCreatures(dt: number): void {
  for (const creature of world.creatures.values()) {
    swim(creature, dt);
    graze(creature);
    const predator = swallowedBy(creature);
    if (!predator) continue;
    world.events.push({
      kind: EventKind.CreatureFirst + creature.kind,
      cellId: predator.id,
      predatorId: predator.id,
      x: creature.x,
      y: creature.y,
      color: creature.color,
    });
    world.creatures.delete(creature.id);
    if (thingCount() < THING_TARGET) addCreature();
  }
  refill();
}

export function creaturePacket(client: Client): Uint8Array {
  const center = client.player?.cells.length ? playerCenter(client.player) : client.view;
  const visible = [...world.creatures.values()].filter((creature) => withinRange(creature, center, VISIBLE_RANGE));
  return encodeCreatures(world.tick, visible);
}
