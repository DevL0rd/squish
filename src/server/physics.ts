import type { Point } from './types.ts';

interface Body extends Point {
  vx: number;
  vy: number;
}

export function bounceInside(body: Body, low: number, high: number, restitution: number): void {
  if (body.x < low) {
    body.x = low;
    body.vx = Math.abs(body.vx) * restitution;
  }
  if (body.x > high) {
    body.x = high;
    body.vx = -Math.abs(body.vx) * restitution;
  }
  if (body.y < low) {
    body.y = low;
    body.vy = Math.abs(body.vy) * restitution;
  }
  if (body.y > high) {
    body.y = high;
    body.vy = -Math.abs(body.vy) * restitution;
  }
}

export function direction(dx: number, dy: number): Point {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

interface Round extends Body {
  readonly radius: number;
}

const BOUNCE = 0.6;

export function shoveApart(a: Round, massA: number, b: Round, massB: number, softness = 1): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const reach = a.radius * softness + b.radius;
  const squared = dx * dx + dy * dy;
  if (squared >= reach * reach) return;
  const distance = Math.sqrt(squared) || 0.001;
  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = reach - distance;
  const shareA = massB / (massA + massB);
  const shareB = 1 - shareA;
  a.x -= nx * overlap * shareA;
  a.y -= ny * overlap * shareA;
  b.x += nx * overlap * shareB;
  b.y += ny * overlap * shareB;
  const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (closing >= 0) return;
  const impulse = -closing * BOUNCE;
  a.vx -= nx * impulse * shareA;
  a.vy -= ny * impulse * shareA;
  b.vx += nx * impulse * shareB;
  b.vy += ny * impulse * shareB;
}
