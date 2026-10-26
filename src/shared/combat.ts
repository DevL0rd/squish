export const VOLLEY_THREADS = 3;
export const VOLLEY_RANGE = 420;
export const DART_RANGE = 900;
export const BOMB_RANGE = 1100;
export const CLOUD_RADIUS = 300;
export const CLOUD_DELAY = 550;
export const CLOUD_LIFE = 5000;

const PULSE_REACH = 220;
const VOLLEY_SPREAD = 0.18;

export function pulseReach(radius: number): number {
  return radius * 1.6 + PULSE_REACH;
}

export function spreadAngle(index: number): number {
  return ((index / (VOLLEY_THREADS - 1)) * 2 - 1) * VOLLEY_SPREAD;
}

export function rotate(aim: { x: number; y: number }, angle: number): { x: number; y: number } {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: aim.x * c - aim.y * s, y: aim.x * s + aim.y * c };
}
