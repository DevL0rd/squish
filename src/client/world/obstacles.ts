import { nearestEdge } from '../../shared/polygon.ts';
import { lerp } from '../../shared/math.ts';
import type { ObstacleDrift, ObstacleShape } from '../../shared/protocol.ts';
import type { Point } from '../cell/geometry.ts';
import { inView } from '../state.ts';

export interface ObstacleVisual {
  readonly shape: ObstacleShape;
  readonly reach: number;
  x: number;
  y: number;
  angle: number;
  tx: number;
  ty: number;
  targetAngle: number;
  placed: boolean;
}

export const obstacles = new Map<number, ObstacleVisual>();

export function receiveShapes(items: readonly ObstacleShape[]): void {
  obstacles.clear();
  for (const shape of items) {
    const reach = Math.max(...shape.points.map((point) => Math.hypot(point.x, point.y)));
    obstacles.set(shape.id, { shape, reach, x: 0, y: 0, angle: 0, tx: 0, ty: 0, targetAngle: 0, placed: false });
  }
}

export function receiveDrift(items: readonly ObstacleDrift[]): void {
  for (const [id, x, y, angle] of items) {
    const obstacle = obstacles.get(id);
    if (!obstacle) continue;
    Object.assign(obstacle, { tx: x, ty: y, targetAngle: angle });
    if (!obstacle.placed) Object.assign(obstacle, { x, y, angle, placed: true });
  }
}

const VIEW_SLACK = 600;
const cached = new Map<ObstacleVisual, Point[]>();
let nearby: ObstacleVisual[] = [];

function transformed(obstacle: ObstacleVisual): Point[] {
  const c = Math.cos(obstacle.angle);
  const s = Math.sin(obstacle.angle);
  return obstacle.shape.points.map((point) => ({
    x: obstacle.x + point.x * c - point.y * s,
    y: obstacle.y + point.x * s + point.y * c,
  }));
}

export function driftObstacles(dt: number): void {
  const blend = 1 - Math.exp(-dt * 2);
  nearby = [];
  cached.clear();
  for (const obstacle of obstacles.values()) {
    obstacle.x = lerp(obstacle.x, obstacle.tx, blend);
    obstacle.y = lerp(obstacle.y, obstacle.ty, blend);
    obstacle.angle = lerp(obstacle.angle, obstacle.targetAngle, blend);
    if (inView(obstacle, 0.75, obstacle.reach + VIEW_SLACK)) nearby.push(obstacle);
  }
}

function worldPoints(obstacle: ObstacleVisual): Point[] {
  const known = cached.get(obstacle);
  if (known) return known;
  const points = transformed(obstacle);
  cached.set(obstacle, points);
  return points;
}

function within(point: Point, obstacle: ObstacleVisual, reach: number): boolean {
  const dx = point.x - obstacle.x;
  const dy = point.y - obstacle.y;
  return dx * dx + dy * dy <= reach * reach;
}

export interface Wall {
  readonly x: number;
  readonly y: number;
  readonly reach: number;
  readonly points: readonly Point[];
}

export function obstacleWalls(center: Point, radius: number): Wall[] {
  return nearby
    .filter((obstacle) => within(center, obstacle, obstacle.reach + radius * 1.6))
    .map((obstacle) => ({ x: obstacle.x, y: obstacle.y, reach: obstacle.reach, points: worldPoints(obstacle) }));
}

export function pushOut(item: { x: number; y: number }, radius: number): void {
  for (const obstacle of nearby) {
    if (!within(item, obstacle, obstacle.reach + radius)) continue;
    const nearest = nearestEdge(worldPoints(obstacle), item);
    if (!nearest.inside) continue;
    item.x = nearest.point.x + nearest.normal.x * radius;
    item.y = nearest.point.y + nearest.normal.y * radius;
  }
}
