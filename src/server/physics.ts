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
