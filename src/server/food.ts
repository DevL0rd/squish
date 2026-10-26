import { hslToRgb, pareto, radiusFor, regionalHue, WORLD, worldHueAt, type Rgb } from '../shared/math.ts';
import { EventKind, FoodVariety } from '../shared/protocol.ts';
import { FOOD_TARGET } from './config.ts';
import { flowAt } from './flow.ts';
import { bounceInside, shoveApart } from './physics.ts';
import { foodsNear } from './life/senses.ts';
import { ingest } from './pigment.ts';
import type { Cell, Food, Player } from './types.ts';
import { emit, nextId, randomWorld, toBytes, world } from './world.ts';

const COHESION_BUCKET = 48;
const COHESION_REACH = 34;
const WAKE_SCALE = 2.4;
const FLOW_STRIDE = 3;
const COHESION_STRIDE = 3;
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

const FOOD_LIMIT = 4000;

interface Grade {
  readonly least: number;
  readonly tail: number;
  readonly density: number;
}

const GRADES: Readonly<Record<number, Grade>> = {
  [FoodVariety.Algae]: { least: 1, tail: 2.4, density: 0.35 },
  [FoodVariety.Plant]: { least: 4, tail: 1.9, density: 0.5 },
  [FoodVariety.Detritus]: { least: 3, tail: 1.9, density: 0.4 },
  [FoodVariety.Pollen]: { least: 8, tail: 2.1, density: 0.8 },
};

function sized(variety: number): { radius: number; mass: number } {
  const grade = GRADES[variety] ?? { least: 1, tail: 1.6, density: 0.35 };
  const mass = grade.least * pareto(Math.random, grade.tail, FOOD_LIMIT / grade.least);
  return { radius: radiusFor(mass / grade.density), mass };
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
  const size = sized(variety);
  if (variety === FoodVariety.Plant) return { ...size, color: tinted(104, 0.62, 0.42, 0.5) };
  if (variety === FoodVariety.Detritus) return { ...size, color: tinted(30, 0.35, 0.4, 0.35) };
  if (variety === FoodVariety.Pollen) return { ...size, color: tinted(46, 0.75, 0.55, 0.4) };
  return { ...size, color: (x, y) => toBytes(hslToRgb(worldHueAt(x, y), 0.92, 0.55)) };
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
    flowX: 0,
    flowY: 0,
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

const COHESION_SIDE = Math.ceil(WORLD / COHESION_BUCKET) + 1;
const heads = new Int32Array(COHESION_SIDE * COHESION_SIDE);
let next = new Int32Array(0);
let pool: Food[] = [];

function bucketOf(value: number): number {
  return Math.min(COHESION_SIDE - 1, Math.max(0, Math.floor(value / COHESION_BUCKET)));
}

function buildBuckets(): void {
  pool = [...world.foods.values()];
  if (next.length < pool.length) next = new Int32Array(pool.length * 2);
  heads.fill(-1);
  pool.forEach((food, i) => {
    const slot = bucketOf(food.y) * COHESION_SIDE + bucketOf(food.x);
    next[i] = heads[slot] ?? -1;
    heads[slot] = i;
  });
}

function attract(food: Food, other: Food): void {
  const dx = other.x - food.x;
  const dy = other.y - food.y;
  const squared = dx * dx + dy * dy;
  if (squared <= 1e-6 || squared > COHESION_REACH * COHESION_REACH) return;
  const distance = Math.sqrt(squared);
  const force = (1 - distance / COHESION_REACH) * 0.055 * COHESION_STRIDE;
  food.vx += (dx / distance) * force;
  food.vy += (dy / distance) * force;
  other.vx -= (dx / distance) * force;
  other.vy -= (dy / distance) * force;
}

function attractBucket(index: number, food: Food, slot: number): void {
  for (let j = heads[slot] ?? -1; j !== -1; j = next[j] ?? -1) {
    const other = pool[j];
    if (j > index && other) attract(food, other);
  }
}

function applyFoodCohesion(): void {
  buildBuckets();
  pool.forEach((food, index) => {
    const bx = bucketOf(food.x);
    const by = bucketOf(food.y);
    for (let gy = Math.max(0, by - 1); gy <= Math.min(COHESION_SIDE - 1, by + 1); gy += 1) {
      for (let gx = Math.max(0, bx - 1); gx <= Math.min(COHESION_SIDE - 1, bx + 1); gx += 1) {
        attractBucket(index, food, gy * COHESION_SIDE + gx);
      }
    }
  });
}

function driftFood(food: Food, dt: number): void {
  if ((food.id + world.tick) % FLOW_STRIDE === 0) {
    const field = flowAt(food);
    food.flowX = field.x * 0.62;
    food.flowY = field.y * 0.62;
  }
  food.x += (food.flowX + food.vx) * dt;
  food.y += (food.flowY + food.vy) * dt;
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

export function updateFoods(dt: number): void {
  if (world.tick % COHESION_STRIDE === 0) applyFoodCohesion();
  for (const food of world.foods.values()) {
    driftFood(food, dt);
    if (food.ejecta && world.now - food.born > EJECTA_LIFETIME) world.foods.delete(food.id);
  }
}

function pushInWake(cell: Cell, food: Food): void {
  const dx = food.x - cell.x;
  const dy = food.y - cell.y;
  const distanceSquared = dx * dx + dy * dy;
  const wake = cell.radius * WAKE_SCALE + food.radius;
  if (distanceSquared >= wake * wake) return;
  const distance = Math.sqrt(distanceSquared) || 1;
  const influence = 1 - distance / wake;
  food.vx += (dx / distance) * (cell.vx * 0.18 + 22) * influence * 0.12;
  food.vy += (dy / distance) * (cell.vy * 0.18 + 22) * influence * 0.12;
}

function immune(player: Player, food: Food): boolean {
  return food.owner === player.id && world.now - food.born < OWNER_IMMUNITY;
}

function feedCell(player: Player, cell: Cell): void {
  for (const food of foodsNear(cell.x, cell.y, cell.radius * WAKE_SCALE)) {
    if (!immune(player, food) && touches(cell, food, 0.35)) eatFood(cell, food);
    else if (cell.radius <= food.radius * EDIBLE_RATIO) shoveApart(cell, cell.mass, food, food.mass);
    else pushInWake(cell, food);
  }
}

export function feedPlayers(players: Iterable<Player>): void {
  for (const player of players) {
    for (const cell of player.cells) feedCell(player, cell);
  }
}

export function trimEjecta(limit: number, thingCount: () => number): void {
  const ejecta = [...world.foods.values()].filter((item) => item.ejecta).sort((a, b) => a.born - b.born);
  for (const item of ejecta) {
    if (thingCount() <= limit) return;
    world.foods.delete(item.id);
  }
}
