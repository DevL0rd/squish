import { nearestEdge } from '../../shared/polygon.ts';
import { lerp } from '../../shared/math.ts';
import type { ObstacleDrift, ObstacleShape } from '../../shared/protocol.ts';
import type { Point } from '../cell/geometry.ts';
import type { Plane } from '../cell/membrane.ts';

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

const SEAM = 1.2;

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

export function driftObstacles(dt: number): void {
  const blend = 1 - Math.exp(-dt * 2);
  for (const obstacle of obstacles.values()) {
    obstacle.x = lerp(obstacle.x, obstacle.tx, blend);
    obstacle.y = lerp(obstacle.y, obstacle.ty, blend);
    obstacle.angle = lerp(obstacle.angle, obstacle.targetAngle, blend);
  }
}

function worldPoints(obstacle: ObstacleVisual): Point[] {
  const c = Math.cos(obstacle.angle);
  const s = Math.sin(obstacle.angle);
  return obstacle.shape.points.map((point) => ({
    x: obstacle.x + point.x * c - point.y * s,
    y: obstacle.y + point.x * s + point.y * c,
  }));
}

function supportPlane(obstacle: ObstacleVisual, center: Point): Plane {
  const nearest = nearestEdge(worldPoints(obstacle), center);
  const dx = center.x - nearest.point.x;
  const dy = center.y - nearest.point.y;
  const length = Math.hypot(dx, dy);
  const outward = nearest.inside || length < 1e-3 ? nearest.normal : { x: dx / length, y: dy / length };
  return {
    nx: -outward.x,
    ny: -outward.y,
    offset: -(nearest.point.x * outward.x + nearest.point.y * outward.y) - SEAM,
  };
}

export function obstaclePlanes(center: Point, radius: number): Plane[] {
  const planes: Plane[] = [];
  for (const obstacle of obstacles.values()) {
    if (Math.hypot(center.x - obstacle.x, center.y - obstacle.y) > obstacle.reach + radius * 1.6) continue;
    planes.push(supportPlane(obstacle, center));
  }
  return planes;
}

export function pushOut(item: { x: number; y: number }, radius: number): void {
  for (const obstacle of obstacles.values()) {
    if (Math.hypot(item.x - obstacle.x, item.y - obstacle.y) > obstacle.reach + radius) continue;
    const nearest = nearestEdge(worldPoints(obstacle), item);
    if (!nearest.inside) continue;
    item.x = nearest.point.x + nearest.normal.x * radius;
    item.y = nearest.point.y + nearest.normal.y * radius;
  }
}
