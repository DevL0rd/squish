import { clamp } from '../../shared/math.ts';

function hash(seed: number, x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash(seed, ix, iy);
  const b = hash(seed, ix + 1, iy);
  const c = hash(seed, ix, iy + 1);
  const d = hash(seed, ix + 1, iy + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

function fbm(seed: number, x: number, y: number): number {
  let value = 0;
  let amplitude = 0.55;
  let px = x;
  let py = y;
  for (let octave = 0; octave < 4; octave += 1) {
    value += noise(seed, px, py) * amplitude;
    const nx = px * 0.8 - py * 0.6;
    const ny = px * 0.6 + py * 0.8;
    px = nx * 2.07 + 11.3;
    py = ny * 2.07 + 7.9;
    amplitude *= 0.5;
  }
  return value;
}

export function dyeDensity(seed: number, x: number, y: number): number {
  const radial = Math.sqrt(x * x + y * y);
  const falloff = Math.max(0, 1 - radial * radial * 0.92);
  const warpX = x * 1.6 + fbm(seed, x * 1.1 + 3.7, y * 1.1 - 1.9) * 0.85;
  const warpY = y * 1.6 + fbm(seed, x * 1.1 - 2.3, y * 1.1 + 5.1) * 0.85;
  const body = fbm(seed, warpX, warpY);
  const veins = fbm(seed, x * 3.1 + body * 1.4, y * 3.1 - body * 1.4);
  return clamp(falloff * (0.32 + body * 0.95 + veins * 0.28), 0, 1.25);
}
