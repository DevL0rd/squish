import type { Rgb } from '../../shared/math.ts';
import { randomRange, worldColorAt } from '../color.ts';
import type { CellVisual } from '../cell/cell.ts';
import { inView, state } from '../state.ts';
import { sampleClientFlow } from '../render/flow-field.ts';
import { viewBounds, type Bounds } from './camera.ts';
import { pushOut } from './obstacles.ts';

export interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly size: number;
  readonly type: number;
  readonly seed: number;
  color: Rgb;
  readonly customColor: boolean;
  life: number;
  readonly front: boolean;
}

export interface Bubble {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  readonly seed: number;
  front: boolean;
  life: number;
}

interface DebrisOptions {
  readonly vx?: number;
  readonly vy?: number;
  readonly size?: number;
  readonly type?: number;
  readonly life?: number;
  readonly front?: boolean;
}

const DEBRIS_COUNT = 70;
const DEBRIS_LIMIT = 600;
const BUBBLE_COUNT = 20;

export const debris: Debris[] = [];
export const bubbles: Bubble[] = [];

function ambientColor(x: number, y: number, type: number): Rgb {
  return worldColorAt(x, y, 0.68, type > 0.5 ? 0.45 : 0.36);
}

function spawnDebris(x: number, y: number, color: Rgb | null, options: DebrisOptions = {}): void {
  const type = options.type ?? Math.random();
  debris.push({
    x,
    y,
    vx: options.vx ?? randomRange(-13, 13),
    vy: options.vy ?? randomRange(-13, 13),
    size: options.size ?? randomRange(1.5, 7),
    type,
    seed: Math.random(),
    color: color ?? ambientColor(x, y, type),
    customColor: color !== null,
    life: options.life ?? randomRange(18, 50),
    front: options.front ?? Math.random() < 0.3,
  });
}

export interface Burst {
  readonly count: number;
  readonly spread: number;
  readonly speed: number;
  readonly size: number;
  readonly life: readonly [number, number];
  readonly front: number;
}

export function spawnBurst(x: number, y: number, color: Rgb, burst: Burst): void {
  if (!inView({ x, y }, 0.75, burst.spread + 200)) return;
  for (let i = 0; i < burst.count; i += 1) {
    spawnDebris(x + randomRange(-burst.spread, burst.spread), y + randomRange(-burst.spread, burst.spread), color, {
      vx: randomRange(-burst.speed, burst.speed),
      vy: randomRange(-burst.speed, burst.speed),
      size: randomRange(1, burst.size),
      type: 0,
      life: randomRange(burst.life[0], burst.life[1]),
      front: Math.random() < burst.front,
    });
  }
}

function spawnAmbientDebris(bounds: Bounds): void {
  spawnDebris(randomRange(bounds.left, bounds.right), randomRange(bounds.bottom, bounds.top), null, {
    type: Math.random() < 0.72 ? 0 : 1,
  });
}

function spawnBubble(bounds: Bounds): void {
  bubbles.push({
    x: randomRange(bounds.left, bounds.right),
    y: randomRange(bounds.bottom, bounds.top),
    vx: randomRange(-4, 4),
    vy: randomRange(3, 12),
    size: randomRange(5, 23),
    seed: Math.random() * 20,
    front: Math.random() < 0.35,
    life: randomRange(18, 40),
  });
}

export function resetDecor(): void {
  debris.length = 0;
  bubbles.length = 0;
  const bounds = viewBounds(240);
  for (let i = 0; i < DEBRIS_COUNT; i += 1) spawnAmbientDebris(bounds);
  for (let i = 0; i < BUBBLE_COUNT; i += 1) spawnBubble(bounds);
}

function outside(point: { x: number; y: number }, bounds: Bounds): boolean {
  return point.x < bounds.left || point.x > bounds.right || point.y < bounds.bottom || point.y > bounds.top;
}

function driftDebris(particle: Debris, dt: number): void {
  const time = state.time;
  const flow = sampleClientFlow(particle.x, particle.y);
  if (flow) {
    particle.vx += (flow[0] - particle.vx) * dt * 1.6;
    particle.vy += (flow[1] - particle.vy) * dt * 1.6;
  } else {
    const flowX =
      Math.sin(particle.y * 0.006 + time * 0.11 + particle.seed * 7) * 7 +
      Math.cos(particle.x * 0.003 - time * 0.08) * 4;
    const flowY = Math.cos(particle.x * 0.005 - time * 0.09 + particle.seed * 9) * 5;
    particle.vx += flowX * dt * 0.35;
    particle.vy += flowY * dt * 0.35;
  }
  particle.vx = (particle.vx + Math.sin(time * 0.21 + particle.seed * 8) * dt * 0.9) * Math.exp(-dt * 0.22);
  particle.vy = (particle.vy + Math.cos(time * 0.17 + particle.seed * 11) * dt * 0.9) * Math.exp(-dt * 0.22);
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  particle.life -= dt;
}

function recycleDebris(particle: Debris, bounds: Bounds): void {
  particle.x = randomRange(bounds.left, bounds.right);
  particle.y = randomRange(bounds.bottom, bounds.top);
  particle.vx = randomRange(-10, 10);
  particle.vy = randomRange(-10, 10);
  particle.life = randomRange(18, 50);
  if (!particle.customColor) particle.color = ambientColor(particle.x, particle.y, particle.type);
}

function updateDebris(dt: number, bounds: Bounds): void {
  for (let i = debris.length - 1; i >= 0; i -= 1) {
    const particle = debris[i];
    if (!particle) continue;
    driftDebris(particle, dt);
    const gone = outside(particle, bounds);
    if (particle.life <= 0 || (gone && debris.length > DEBRIS_COUNT)) debris.splice(i, 1);
    else if (gone) recycleDebris(particle, bounds);
  }
}

function updateBubble(bubble: Bubble, dt: number, bounds: Bounds): void {
  const flow = sampleClientFlow(bubble.x, bubble.y);
  if (flow) {
    bubble.vx += (flow[0] - bubble.vx) * dt * 1.15;
    bubble.vy += (flow[1] + 8 - bubble.vy) * dt * 1.15;
  } else {
    bubble.vx += Math.sin(bubble.y * 0.008 + state.time * 0.6 + bubble.seed) * dt * 2.4;
  }
  bubble.x += bubble.vx * dt;
  bubble.y += bubble.vy * dt;
  bubble.vx *= Math.exp(-dt * 0.5);
  bubble.life -= dt;
  if (bubble.life > 0 && bubble.y >= bounds.bottom && bubble.x >= bounds.left && bubble.x <= bounds.right) return;
  bubble.x = randomRange(bounds.left, bounds.right);
  bubble.y = bounds.bottom + randomRange(0, bounds.height * 0.25);
  bubble.vx = randomRange(-4, 4);
  bubble.vy = randomRange(3, 12);
  bubble.size = randomRange(5, 23);
  bubble.life = randomRange(18, 40);
  bubble.front = Math.random() < 0.35;
}

interface Movable {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function displace(
  item: Movable,
  cell: CellVisual,
  reach: number,
  strength: { move: number; kick: number; drag: number },
): void {
  const dx = item.x - cell.x;
  const dy = item.y - cell.y;
  if (dx * dx + dy * dy >= reach * reach) return;
  const distance = Math.hypot(dx, dy) || 0.001;
  const push = (reach - distance) / reach;
  item.x += (dx / distance) * push * strength.move;
  item.y += (dy / distance) * push * strength.move;
  item.vx += (dx / distance) * push * strength.kick + cell.vx * strength.drag;
  item.vy += (dy / distance) * push * strength.kick + cell.vy * strength.drag;
}

const BUBBLE_PUSH = { move: 2.5, kick: 18, drag: 0.04 };
const DEBRIS_PUSH = { move: 2.4, kick: 12, drag: 0.03 };

function pushAside(cell: CellVisual): void {
  for (const bubble of bubbles) displace(bubble, cell, cell.radius + bubble.size * 0.45, BUBBLE_PUSH);
  for (const particle of debris) {
    if (particle.type <= 0.5) displace(particle, cell, cell.radius + particle.size * 0.4, DEBRIS_PUSH);
  }
}

function cohere(items: readonly Movable[], range: number, strength: number): void {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  sorted.forEach((a, i) => {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b || b.x - a.x > range) break;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      if (dx * dx + dy * dy > range * range) continue;
      const distance = Math.hypot(dx, dy) || 0.001;
      const force = (1 - distance / range) * strength;
      a.vx += (dx / distance) * force;
      a.vy += (dy / distance) * force;
      b.vx -= (dx / distance) * force;
      b.vy -= (dy / distance) * force;
    }
  });
}

export function maintainDecor(dt: number): void {
  const bounds = viewBounds(360);
  updateDebris(dt, bounds);
  for (const bubble of bubbles) updateBubble(bubble, dt, bounds);
  while (debris.length < DEBRIS_COUNT) spawnAmbientDebris(bounds);
  for (const cell of state.cells.values()) if (inView(cell, 0.75, cell.radius * 2)) pushAside(cell);
  if (debris.length > DEBRIS_LIMIT) debris.splice(0, debris.length - DEBRIS_LIMIT);
  cohere(bubbles, 135, 0.011);
  cohere(
    debris.filter((particle) => particle.type <= 0.5),
    38,
    0.006,
  );
  while (bubbles.length < BUBBLE_COUNT) spawnBubble(bounds);
  for (const item of debris) pushOut(item, item.size);
  for (const bubble of bubbles) pushOut(bubble, bubble.size * 0.5);
}
