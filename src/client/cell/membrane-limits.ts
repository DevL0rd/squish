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

const PINCH_GAP = 0.3;

export interface Pinch {
  readonly share: number;
  readonly x: number;
  readonly y: number;
}

function close(ring: Limited): [number, number] | null {
  const gap = ring.radius * PINCH_GAP;
  const quarter = Math.floor(ring.count / 4);
  for (let i = 0; i < ring.count; i += 1) {
    for (let j = i + quarter; j <= i + ring.count - quarter && j < ring.count; j += 1) {
      if (Math.hypot(at(ring.x, j) - at(ring.x, i), at(ring.y, j) - at(ring.y, i)) < gap) return [i, j];
    }
  }
  return null;
}

function half(ring: Limited, from: number, to: number): { area: number; x: number; y: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const span = (to - from + ring.count) % ring.count;
  for (let k = 0; k <= span; k += 1) {
    const a = (from + k) % ring.count;
    const b = k === span ? from : (from + k + 1) % ring.count;
    const cross = at(ring.x, a) * at(ring.y, b) - at(ring.x, b) * at(ring.y, a);
    area += cross;
    cx += (at(ring.x, a) + at(ring.x, b)) * cross;
    cy += (at(ring.y, a) + at(ring.y, b)) * cross;
  }
  const safe = Math.abs(area) > 1e-6 ? area : 1e-6;
  return { area: Math.abs(area) / 2, x: cx / (3 * safe), y: cy / (3 * safe) };
}

export function pinchOf(ring: Limited): Pinch | null {
  const pair = close(ring);
  if (!pair) return null;
  const front = half(ring, pair[0], pair[1]);
  const back = half(ring, pair[1], pair[0]);
  const total = front.area + back.area;
  if (total <= 0) return null;
  return { share: front.area / total, x: front.x - back.x, y: front.y - back.y };
}
