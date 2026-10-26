import { nearestEdge } from '../shared/polygon.ts';
import { clamp, WORLD } from '../shared/math.ts';
import { ObstacleKind, type ObstacleShape } from '../shared/protocol.ts';
import { flowAt } from './flow.ts';
import type { Point } from './types.ts';
import { nextId, randomWorld } from './world.ts';

const OBSTACLE_COUNT = 320;
const DRIFT = 0.06;
const GRID = 512;
const GRID_SIDE = Math.ceil(WORLD / GRID);

interface Obstacle extends ObstacleShape {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
  readonly reach: number;
}

interface Body extends Point {
  vx: number;
  vy: number;
  readonly radius: number;
}

function polygon(count: number, radius: (angle: number) => number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const r = radius(angle);
    return { x: Math.round(Math.cos(angle) * r), y: Math.round(Math.sin(angle) * r) };
  });
}

function grain(): Point[] {
  const size = 90 + Math.random() * 130;
  const stretch = 0.65 + Math.random() * 0.35;
  const lobes = Array.from({ length: 4 }, (_, k) => ({ phase: Math.random() * Math.PI * 2, amount: 0.09 / (k + 1) }));
  return polygon(40, (angle) => {
    const rough = lobes.reduce((sum, lobe, k) => sum + Math.sin(angle * (k + 2) + lobe.phase) * lobe.amount, 0);
    return size * (1 + rough) * (1 - (1 - stretch) * Math.abs(Math.sin(angle)));
  });
}

function fiber(): Point[] {
  const length = 260 + Math.random() * 320;
  const width = 22 + Math.random() * 18;
  const cap = (sign: number): Point[] =>
    Array.from({ length: 5 }, (_, i) => {
      const angle = -Math.PI / 2 + (i / 4) * Math.PI;
      return {
        x: Math.round(sign * (length / 2 + Math.cos(angle) * width)),
        y: Math.round(Math.sin(angle) * width * sign),
      };
    });
  return [...cap(1), ...cap(-1)];
}

function bubble(): Point[] {
  const size = 70 + Math.random() * 110;
  return polygon(24, () => size);
}

function shapeFor(kind: number): Point[] {
  if (kind === ObstacleKind.Fiber) return fiber();
  if (kind === ObstacleKind.Bubble) return bubble();
  return grain();
}

function pickKind(): number {
  const roll = Math.random();
  if (roll < 0.5) return ObstacleKind.Grain;
  return roll < 0.78 ? ObstacleKind.Fiber : ObstacleKind.Bubble;
}

const obstacles: Obstacle[] = [];

export function seedObstacles(): void {
  for (let attempt = 0; obstacles.length < OBSTACLE_COUNT && attempt < 4000; attempt += 1) {
    const kind = pickKind();
    const points = shapeFor(kind);
    const reach = Math.max(...points.map((point) => Math.hypot(point.x, point.y)));
    const x = randomWorld(reach + 120);
    const y = randomWorld(reach + 120);
    const clear = obstacles.every((other) => Math.hypot(other.x - x, other.y - y) > other.reach + reach + 160);
    if (!clear) continue;
    obstacles.push({
      id: nextId('obstacle'),
      kind,
      points,
      seed: Math.random() * 100,
      x,
      y,
      angle: Math.random() * Math.PI * 2,
      vx: 0,
      vy: 0,
      spin: (Math.random() - 0.5) * 0.02,
      reach,
    });
  }
  rebuildGrid();
}

const grid: Obstacle[][] = Array.from({ length: GRID_SIDE * GRID_SIDE }, () => []);

function span(value: number, reach: number): [number, number] {
  return [
    clamp(Math.floor((value - reach) / GRID), 0, GRID_SIDE - 1),
    clamp(Math.floor((value + reach) / GRID), 0, GRID_SIDE - 1),
  ];
}

function rebuildGrid(): void {
  for (const bucket of grid) bucket.length = 0;
  for (const obstacle of obstacles) {
    const [x0, x1] = span(obstacle.x, obstacle.reach);
    const [y0, y1] = span(obstacle.y, obstacle.reach);
    for (let gy = y0; gy <= y1; gy += 1) {
      for (let gx = x0; gx <= x1; gx += 1) grid[gy * GRID_SIDE + gx]?.push(obstacle);
    }
  }
}

function nearby(point: Point, radius: number): readonly Obstacle[] {
  const [x0, x1] = span(point.x, radius);
  const [y0, y1] = span(point.y, radius);
  if (x0 === x1 && y0 === y1) return grid[y0 * GRID_SIDE + x0] ?? [];
  const found: Obstacle[] = [];
  for (let gy = y0; gy <= y1; gy += 1) {
    for (let gx = x0; gx <= x1; gx += 1) {
      for (const obstacle of grid[gy * GRID_SIDE + gx] ?? []) if (!found.includes(obstacle)) found.push(obstacle);
    }
  }
  return found;
}

function toLocal(obstacle: Obstacle, point: Point): Point {
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  const c = Math.cos(-obstacle.angle);
  const s = Math.sin(-obstacle.angle);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function toWorldVector(obstacle: Obstacle, vector: Point): Point {
  const c = Math.cos(obstacle.angle);
  const s = Math.sin(obstacle.angle);
  return { x: vector.x * c - vector.y * s, y: vector.x * s + vector.y * c };
}

interface Contact {
  readonly normal: Point;
  readonly depth: number;
}

function contactWith(obstacle: Obstacle, body: Point, radius: number): Contact | null {
  const dx0 = body.x - obstacle.x;
  const dy0 = body.y - obstacle.y;
  const limit = obstacle.reach + radius;
  if (dx0 * dx0 + dy0 * dy0 > limit * limit) return null;
  const local = toLocal(obstacle, body);
  const edge = nearestEdge(obstacle.points, local);
  const dx = local.x - edge.point.x;
  const dy = local.y - edge.point.y;
  const distance = Math.hypot(dx, dy);
  if (!edge.inside && distance >= radius) return null;
  const outward = edge.inside || distance < 1e-6 ? edge.normal : { x: dx / distance, y: dy / distance };
  const depth = edge.inside ? radius + distance : radius - distance;
  return { normal: toWorldVector(obstacle, outward), depth };
}

export interface Cut {
  readonly x: number;
  readonly y: number;
  readonly nx: number;
  readonly ny: number;
  readonly depth: number;
}

const CUT_INSET = 0.66;

function solidAt(obstacle: Obstacle, point: Point): boolean {
  return nearestEdge(obstacle.points, toLocal(obstacle, point)).inside;
}

export function narrowContact(body: Point, radius: number, width: number, along: Point): Cut | null {
  let deepest: Cut | null = null;
  for (const obstacle of nearby(body, radius)) {
    const contact = contactWith(obstacle, body, radius);
    if (!contact || (deepest && deepest.depth >= contact.depth)) continue;
    const { normal, depth } = contact;
    const x = body.x - normal.x * (radius - depth);
    const y = body.y - normal.y * (radius - depth);
    const probe = (side: number): Point => ({
      x: x + along.x * width * CUT_INSET - along.y * width * side,
      y: y + along.y * width * CUT_INSET + along.x * width * side,
    });
    if (solidAt(obstacle, probe(1)) || solidAt(obstacle, probe(-1))) continue;
    deepest = { x, y, nx: normal.x, ny: normal.y, depth };
  }
  return deepest;
}

export function collideBody(body: Body, radius = body.radius): void {
  for (const obstacle of nearby(body, radius)) {
    const contact = contactWith(obstacle, body, radius);
    if (!contact) continue;
    body.x += contact.normal.x * contact.depth;
    body.y += contact.normal.y * contact.depth;
    const into = body.vx * contact.normal.x + body.vy * contact.normal.y;
    if (into >= 0) continue;
    body.vx -= contact.normal.x * into;
    body.vy -= contact.normal.y * into;
  }
}

function separate(a: Obstacle, b: Obstacle): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const limit = a.reach + b.reach + 40;
  if (dx * dx + dy * dy >= limit * limit) return;
  const distance = Math.hypot(dx, dy) || 1;
  const overlap = limit - distance;
  a.vx -= (dx / distance) * overlap * 0.01;
  a.vy -= (dy / distance) * overlap * 0.01;
  b.vx += (dx / distance) * overlap * 0.01;
  b.vy += (dy / distance) * overlap * 0.01;
}

export function updateObstacles(dt: number): void {
  obstacles.forEach((obstacle) => {
    const flow = flowAt(obstacle);
    obstacle.vx = (obstacle.vx + flow.x * DRIFT * dt) * Math.exp(-dt * 0.4);
    obstacle.vy = (obstacle.vy + flow.y * DRIFT * dt) * Math.exp(-dt * 0.4);
    for (const other of nearby(obstacle, obstacle.reach + 40)) if (other.id > obstacle.id) separate(obstacle, other);
    obstacle.x = clamp(obstacle.x + obstacle.vx * dt, obstacle.reach, WORLD - obstacle.reach);
    obstacle.y = clamp(obstacle.y + obstacle.vy * dt, obstacle.reach, WORLD - obstacle.reach);
    obstacle.angle += obstacle.spin * dt;
  });
  rebuildGrid();
}

export function obstacleShapes(): ObstacleShape[] {
  return obstacles.map(({ id, kind, points, seed }) => ({ id, kind, points, seed }));
}

export function obstaclePositions(): [number, number, number, number][] {
  return obstacles.map((obstacle) => [
    obstacle.id,
    Math.round(obstacle.x),
    Math.round(obstacle.y),
    Number(obstacle.angle.toFixed(3)),
  ]);
}

export function blockedAt(point: Point, radius: number): boolean {
  return nearby(point, radius).some((obstacle) => contactWith(obstacle, point, radius) !== null);
}
