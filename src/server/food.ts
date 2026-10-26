import { hslToRgb, radiusFor, regionalHue, WORLD, worldHueAt, type Rgb } from '../shared/math.ts';
import { EventKind, FoodVariety } from '../shared/protocol.ts';
import { FOOD_TARGET } from './config.ts';
import { flowAt } from './flow.ts';
import { bounceInside } from './physics.ts';
import { ingest } from './pigment.ts';
import type { Cell, Food, Player } from './types.ts';
import { emit, nextId, randomWorld, toBytes, world } from './world.ts';

const COHESION_BUCKET = 48;
const COHESION_REACH = 34;
const EJECTA_LIFETIME = 12000;
const OWNER_IMMUNITY = 2000;
const EDIBLE_RATIO = 1.35;

interface FoodOptions {
  readonly variety?: number;
  readonly x?: number;
  readonly y?: number;
  readonly vx?: number;
  readonly vy?: number;
  readonly mass?: number;
  readonly radius?: number;
  readonly color?: Rgb;
  readonly ejecta?: boolean;
  readonly owner?: number;
}

interface Recipe {
  readonly radius: number;
  readonly mass: number;
  readonly color: (x: number, y: number) => Rgb;
}

function massFor(radius: number): number {
  return (radius / 2) ** 2 / 27.04;
}

function pickVariety(): number {
  const roll = Math.random();
  if (roll < 0.02) return FoodVariety.Pollen;
  if (roll < 0.07) return FoodVariety.Plant;
  if (roll < 0.12) return FoodVariety.Detritus;
  return FoodVariety.Algae;
}

function recipe(variety: number): Recipe {
  const tinted =
    (hue: number, saturation: number, lightness: number, weight: number) =>
    (x: number, y: number): Rgb =>
      toBytes(hslToRgb(regionalHue(x, y, hue, weight) + (Math.random() - 0.5) * 18, saturation, lightness));
  if (variety === FoodVariety.Plant) {
    const radius = 15 + Math.random() * 9;
    return { radius, mass: massFor(radius) * 2.2, color: tinted(104, 0.62, 0.42, 0.5) };
  }
  if (variety === FoodVariety.Detritus) {
    const radius = 13 + Math.random() * 12;
    return { radius, mass: massFor(radius) * 1.6, color: tinted(30, 0.35, 0.4, 0.35) };
  }
  if (variety === FoodVariety.Pollen) {
    const radius = 19 + Math.random() * 9;
    return { radius, mass: massFor(radius) * 3, color: tinted(46, 0.75, 0.55, 0.4) };
  }
  const radius = 8 + Math.random() * 5;
  return { radius, mass: massFor(radius), color: (x, y) => toBytes(hslToRgb(worldHueAt(x, y), 0.92, 0.55)) };
}

export function addFood(options: FoodOptions = {}): Food {
  const x = options.x ?? randomWorld(40);
  const y = options.y ?? randomWorld(40);
  const variety = options.variety ?? pickVariety();
  const made = recipe(variety);
  const food: Food = {
    id: nextId('food'),
    variety,
    vx: 0,
    vy: 0,
    mass: made.mass,
    radius: made.radius,
    ejecta: false,
    owner: 0,
    born: world.now,
    ...options,
    x,
    y,
    color: options.color ?? made.color(x, y),
  };
  world.foods.set(food.id, food);
  return food;
}

export function seedFood(): void {
  for (let i = 0; i < FOOD_TARGET; i += 1) addFood();
}

function eatFood(cell: Cell, food: Food): void {
  world.foods.delete(food.id);
  const gained = ingest(cell, food.color, food.mass);
  cell.mass += gained;
  cell.digesting += gained;
  cell.radius = radiusFor(cell.mass);
  emit({
    kind: EventKind.Eat,
    cellId: cell.id,
    predatorId: cell.id,
    x: food.x,
    y: food.y,
    color: food.color,
    amount: gained,
    bonus: gained / food.mass,
  });
  addFood();
}

function bucketKey(bx: number, by: number): number {
  return by * 4096 + bx;
}

function buildBuckets(): Map<number, Food[]> {
  const buckets = new Map<number, Food[]>();
  for (const food of world.foods.values()) {
    const key = bucketKey(Math.floor(food.x / COHESION_BUCKET), Math.floor(food.y / COHESION_BUCKET));
    const bucket = buckets.get(key);
    if (bucket) bucket.push(food);
    else buckets.set(key, [food]);
  }
  return buckets;
}

function attract(food: Food, other: Food): void {
  if (other.id <= food.id) return;
  const dx = other.x - food.x;
  const dy = other.y - food.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= 0.001 || distance > COHESION_REACH) return;
  const force = (1 - distance / COHESION_REACH) * 0.055;
  food.vx += (dx / distance) * force;
  food.vy += (dy / distance) * force;
  other.vx -= (dx / distance) * force;
  other.vy -= (dy / distance) * force;
}

function applyFoodCohesion(): void {
  const buckets = buildBuckets();
  for (const food of world.foods.values()) {
    const bx = Math.floor(food.x / COHESION_BUCKET);
    const by = Math.floor(food.y / COHESION_BUCKET);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        for (const other of buckets.get(bucketKey(bx + ox, by + oy)) ?? []) attract(food, other);
      }
    }
  }
}

function driftFood(food: Food, dt: number): void {
  const field = flowAt(food);
  food.x += (field.x * 0.62 + food.vx) * dt;
  food.y += (field.y * 0.62 + food.vy) * dt;
  if (food.vx === 0 && food.vy === 0) return;
  const drag = Math.exp(-dt * (food.ejecta ? 2.4 : 2.8));
  food.vx *= drag;
  food.vy *= drag;
  if (Math.abs(food.vx) < 0.4) food.vx = 0;
  if (Math.abs(food.vy) < 0.4) food.vy = 0;
  bounceInside(food, food.radius + 4, WORLD - food.radius - 4, 0.35);
}

function touches(cell: Cell, food: Food, reachScale: number): boolean {
  const dx = food.x - cell.x;
  const dy = food.y - cell.y;
  const reach = cell.radius + food.radius * reachScale;
  return cell.radius > food.radius * EDIBLE_RATIO && dx * dx + dy * dy < reach * reach;
}

function findEater(food: Food): Cell | null {
  for (const player of world.players.values()) {
    const immune = food.owner === player.id && world.now - food.born < OWNER_IMMUNITY;
    if (immune) continue;
    const cell = player.cells.find((candidate) => touches(candidate, food, 0.3));
    if (cell) return cell;
  }
  return null;
}

export function updateFoods(dt: number): void {
  applyFoodCohesion();
  for (const food of world.foods.values()) {
    driftFood(food, dt);
    if (food.ejecta && world.now - food.born > EJECTA_LIFETIME) {
      world.foods.delete(food.id);
      continue;
    }
    const eater = findEater(food);
    if (eater) eatFood(eater, food);
  }
}

function pushInWake(cell: Cell, food: Food): void {
  const dx = food.x - cell.x;
  const dy = food.y - cell.y;
  const distanceSquared = dx * dx + dy * dy;
  const wake = cell.radius * 2.4 + food.radius;
  if (distanceSquared >= wake * wake) return;
  const distance = Math.sqrt(distanceSquared) || 1;
  const influence = 1 - distance / wake;
  food.vx += (dx / distance) * (cell.vx * 0.18 + 22) * influence * 0.12;
  food.vy += (dy / distance) * (cell.vy * 0.18 + 22) * influence * 0.12;
}

function feedCell(cell: Cell): void {
  for (const food of world.foods.values()) {
    if (touches(cell, food, 0.35)) eatFood(cell, food);
    else pushInWake(cell, food);
  }
}

export function feedPlayers(players: Iterable<Player>): void {
  for (const player of players) {
    for (const cell of player.cells) feedCell(cell);
  }
}

export function trimEjecta(limit: number, thingCount: () => number): void {
  const ejecta = [...world.foods.values()].filter((item) => item.ejecta).sort((a, b) => a.born - b.born);
  for (const item of ejecta) {
    if (thingCount() <= limit) return;
    world.foods.delete(item.id);
  }
}
