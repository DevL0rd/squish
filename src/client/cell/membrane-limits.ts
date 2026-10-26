import { at } from '../../shared/math.ts';
import { nearestEdge } from '../../shared/polygon.ts';
import type { Wall } from '../world/obstacles.ts';
import { circleRing, ringArea, type Point, type Ring } from './geometry.ts';

const MAX_REACH = 1.8;
const WALL_SEAM = 1.5;

interface Limited extends Ring {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly radius: number;
  replace(ring: Ring): void;
}

export function shutWall(ring: Limited, wall: Wall): void {
  const reach = wall.reach + WALL_SEAM;
  for (let i = 0; i < ring.count; i += 1) {
    const point = { x: at(ring.x, i), y: at(ring.y, i) };
    const dx = point.x - wall.x;
    const dy = point.y - wall.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    const edge = nearestEdge(wall.points, point);
    if (!edge.inside) continue;
    ring.x[i] = edge.point.x + edge.normal.x * WALL_SEAM;
    ring.y[i] = edge.point.y + edge.normal.y * WALL_SEAM;
  }
}

export interface Round {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export function shutRound(ring: Limited, round: Round): void {
  const reach = round.radius + WALL_SEAM;
  for (let i = 0; i < ring.count; i += 1) {
    const dx = at(ring.x, i) - round.x;
    const dy = at(ring.y, i) - round.y;
    const squared = dx * dx + dy * dy;
    if (squared >= reach * reach) continue;
    const length = Math.sqrt(squared) || 1e-3;
    ring.x[i] = round.x + (dx / length) * reach;
    ring.y[i] = round.y + (dy / length) * reach;
  }
}

export function containRing(ring: Limited, anchor: Point): void {
  if (ringArea(ring) <= 0) {
    ring.replace(circleRing(ring.count, anchor, ring.radius));
    return;
  }
  const limit = ring.radius * MAX_REACH;
  for (let i = 0; i < ring.count; i += 1) {
    const dx = at(ring.x, i) - anchor.x;
    const dy = at(ring.y, i) - anchor.y;
    const length = Math.hypot(dx, dy);
    if (length <= limit) continue;
    ring.x[i] = anchor.x + (dx / length) * limit;
    ring.y[i] = anchor.y + (dy / length) * limit;
  }
}
