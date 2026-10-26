import { clamp } from '../../shared/math.ts';
import type { Point } from '../types.ts';

export interface Chain {
  readonly points: Point[];
  readonly radii: number[];
}

export interface Body extends Point {
  vx: number;
  vy: number;
  readonly radius: number;
}

export interface ChainHit {
  readonly index: number;
  readonly t: number;
  readonly distance: number;
  readonly nx: number;
  readonly ny: number;
  readonly radius: number;
}

export function makeChain(
  count: number,
  start: Point,
  heading: number,
  spacing: number,
  profile: (u: number) => number,
): Chain {
  const points = Array.from({ length: count }, (_, i) => ({
    x: start.x - Math.cos(heading) * spacing * i,
    y: start.y - Math.sin(heading) * spacing * i,
  }));
  const radii = Array.from({ length: count }, (_, i) => profile(i / (count - 1)));
  return { points, radii };
}

export function follow(chain: Chain, spacing: number): void {
  for (let i = 1; i < chain.points.length; i += 1) {
    const lead = chain.points[i - 1];
    const point = chain.points[i];
    if (!lead || !point) continue;
    const dx = point.x - lead.x;
    const dy = point.y - lead.y;
    const length = Math.hypot(dx, dy) || 1;
    point.x = lead.x + (dx / length) * spacing;
    point.y = lead.y + (dy / length) * spacing;
  }
}

export function nearestOnChain(chain: Chain, p: Point): ChainHit | null {
  let best: ChainHit | null = null;
  for (let i = 0; i < chain.points.length - 1; i += 1) {
    const a = chain.points[i];
    const b = chain.points[i + 1];
    if (!a || !b) continue;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const t = clamp(((p.x - a.x) * ex + (p.y - a.y) * ey) / Math.max(ex * ex + ey * ey, 1e-6), 0, 1);
    const dx = p.x - (a.x + ex * t);
    const dy = p.y - (a.y + ey * t);
    const distance = Math.hypot(dx, dy) || 1e-3;
    const radius = (chain.radii[i] ?? 0) * (1 - t) + (chain.radii[i + 1] ?? 0) * t;
    if (!best || distance - radius < best.distance - best.radius) {
      best = { index: i, t, distance, nx: dx / distance, ny: dy / distance, radius };
    }
  }
  return best;
}

export function pointAlong(chain: Chain, progress: number): Point {
  const scaled = clamp(progress, 0, 1) * (chain.points.length - 1);
  const index = Math.min(chain.points.length - 2, Math.floor(scaled));
  const t = scaled - index;
  const a = chain.points[index] ?? { x: 0, y: 0 };
  const b = chain.points[index + 1] ?? a;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function pushOut(chain: Chain, body: Body, carry: Point): boolean {
  const hit = nearestOnChain(chain, body);
  if (!hit) return false;
  const overlap = hit.radius + body.radius - hit.distance;
  if (overlap <= 0) return false;
  body.x += hit.nx * overlap;
  body.y += hit.ny * overlap;
  const into = body.vx * hit.nx + body.vy * hit.ny;
  if (into < 0) {
    body.vx -= hit.nx * into;
    body.vy -= hit.ny * into;
  }
  body.vx += (carry.x - body.vx) * 0.1;
  body.vy += (carry.y - body.vy) * 0.1;
  return true;
}
