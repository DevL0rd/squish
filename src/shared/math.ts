export type Rgb = readonly [number, number, number];

export const WORLD = 12960;
export const TAU = Math.PI * 2;

export function at(field: ArrayLike<number>, index: number): number {
  return field[index] ?? 0;
}

export function clamp(value: number, low: number, high: number): number {
  if (value < low) return low;
  return value > high ? high : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function radiusFor(mass: number): number {
  return 5.2 * Math.sqrt(Math.max(mass, 1));
}

export function digestionRate(radius: number): number {
  return clamp(radius / radiusFor(55), 0.6, 4);
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hueChannel(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

export function hslToRgb(hue: number, saturation: number, lightness: number): Rgb {
  const h = (((hue % 360) + 360) % 360) / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hueChannel(p, q, h + 1 / 3), hueChannel(p, q, h), hueChannel(p, q, h - 1 / 3)];
}

export function worldHueAt(x: number, y: number): number {
  const nx = x / WORLD;
  const ny = y / WORLD;
  const hue =
    168 +
    82 * Math.sin(nx * 5.3 + 0.6) +
    46 * Math.sin(ny * 4.1 - 0.35) +
    24 * Math.sin((nx + ny) * 8.2 + 1.1) +
    16 * Math.cos((nx - ny) * 10.4);
  return ((hue % 360) + 360) % 360;
}

export function regionalHue(x: number, y: number, hue: number, weight: number): number {
  const local = worldHueAt(x, y);
  const delta = ((((local - hue) % 360) + 540) % 360) - 180;
  return (((hue + delta * weight) % 360) + 360) % 360;
}

export function sampleGrid(field: Float32Array, n: number, x: number, y: number): number {
  const cx = clamp(x, 0, n - 1.001);
  const cy = clamp(y, 0, n - 1.001);
  const x0 = cx | 0;
  const y0 = cy | 0;
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = y0 * n + x0;
  const top = at(field, i00) * (1 - fx) + at(field, i00 + 1) * fx;
  const bottom = at(field, i00 + n) * (1 - fx) + at(field, i00 + n + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}
