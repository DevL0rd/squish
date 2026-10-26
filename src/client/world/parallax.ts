import { hslToRgb, worldHueAt } from '../../shared/math.ts';
import type { CreatureVisual, FoodVisual } from '../state.ts';
import { state } from '../state.ts';
import type { ViewCamera } from '../render/view.ts';

export interface Layer {
  readonly depth: number;
  readonly scale: number;
  readonly blur: number;
  readonly alpha: number;
  readonly creatures: CreatureVisual[];
  readonly food: FoodVisual[];
}

const KINDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CREATURE_COUNT = 22;
const FOOD_COUNT = 40;
const MARGIN = 1.3;

export const layers: readonly Layer[] = [
  { depth: 0.35, scale: 0.6, blur: 2.2, alpha: 0.16, creatures: [], food: [] },
  { depth: 0.6, scale: 0.8, blur: 1.1, alpha: 0.28, creatures: [], food: [] },
];

let nextId = -1;

export function layerCamera(layer: Layer): ViewCamera {
  const { camera } = state;
  return {
    x: camera.x * layer.depth,
    y: camera.y * layer.depth,
    width: camera.width / layer.scale,
    height: camera.height / layer.scale,
    ox: 0,
    oy: 0,
  };
}

function spot(view: ViewCamera): { x: number; y: number } {
  return {
    x: view.x + (Math.random() - 0.5) * view.width * MARGIN,
    y: view.y + (Math.random() - 0.5) * view.height * MARGIN,
  };
}

function tint(x: number, y: number, lightness: number): [number, number, number] {
  const [r, g, b] = hslToRgb(worldHueAt(x, y) + (Math.random() - 0.5) * 40, 0.55, lightness);
  return [r, g, b];
}

function fakeCreature(view: ViewCamera): CreatureVisual {
  const at = spot(view);
  const angle = Math.random() * Math.PI * 2;
  return {
    id: nextId--,
    x: at.x,
    y: at.y,
    tx: at.x,
    ty: at.y,
    radius: 8 + Math.random() ** 3 * 60,
    kind: KINDS[Math.floor(Math.random() * KINDS.length)] ?? 0,
    color: tint(at.x, at.y, 0.34),
    angle,
    targetAngle: angle,
    phase: Math.random() * 10,
    state: 0,
    stateSince: performance.now(),
    grow: 1,
  };
}

function fakeFood(view: ViewCamera): FoodVisual {
  const at = spot(view);
  const radius = 6 + Math.random() ** 4 * 60;
  return {
    id: nextId--,
    variety: Math.floor(Math.random() * 4),
    x: at.x,
    y: at.y,
    tx: at.x,
    ty: at.y,
    radius,
    targetRadius: radius,
    color: tint(at.x, at.y, 0.3),
    ejecta: false,
    grow: 1,
    alpha: 1,
    targetAlpha: 1,
    lastSeen: 0,
    phase: Math.random() * 10,
  };
}

function outside(item: { x: number; y: number }, view: ViewCamera): boolean {
  return Math.abs(item.x - view.x) > view.width * 0.75 || Math.abs(item.y - view.y) > view.height * 0.75;
}

function swim(creature: CreatureVisual, dt: number): void {
  creature.targetAngle += (Math.random() - 0.5) * dt * 1.6;
  creature.angle +=
    Math.atan2(Math.sin(creature.targetAngle - creature.angle), Math.cos(creature.targetAngle - creature.angle)) *
    Math.min(1, dt * 3);
  const speed = 18 + 40 / (1 + creature.radius / 20);
  creature.x += Math.cos(creature.angle) * speed * dt;
  creature.y += Math.sin(creature.angle) * speed * dt;
  creature.phase += dt;
}

function keep<T extends { x: number; y: number }>(
  items: T[],
  count: number,
  view: ViewCamera,
  make: (view: ViewCamera) => T,
): void {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item && outside(item, view)) items.splice(i, 1);
  }
  while (items.length < count) items.push(make(view));
}

export function updateParallax(dt: number): void {
  for (const layer of layers) {
    const view = layerCamera(layer);
    for (const creature of layer.creatures) swim(creature, dt);
    for (const item of layer.food) item.y += Math.sin(item.phase + state.time * 0.3) * dt * 4;
    keep(layer.creatures, CREATURE_COUNT, view, fakeCreature);
    keep(layer.food, FOOD_COUNT, view, fakeFood);
  }
}
