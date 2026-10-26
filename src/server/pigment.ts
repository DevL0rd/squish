import type { Rgb } from '../shared/math.ts';
import type { Cell } from './types.ts';

export const NEUTRAL_PIGMENT: Rgb = [128, 138, 136];

const MAX_BONUS = 2;

function chroma(color: Rgb): [number, number, number] {
  const mean = (color[0] + color[1] + color[2]) / 3;
  return [color[0] - mean, color[1] - mean, color[2] - mean];
}

function length(vector: readonly number[]): number {
  return Math.hypot(...vector);
}

export function affinity(pigment: Rgb, color: Rgb): number {
  const a = chroma(pigment);
  const b = chroma(color);
  const strength = Math.min(1, length(a) / 60);
  const cosine = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / Math.max(length(a) * length(b), 1e-6);
  return Math.max(0, cosine) ** 3 * strength;
}

export function blendPigment(a: Rgb, b: Rgb, weightB: number): Rgb {
  return [a[0] + (b[0] - a[0]) * weightB, a[1] + (b[1] - a[1]) * weightB, a[2] + (b[2] - a[2]) * weightB];
}

export function ingest(cell: Cell, color: Rgb, mass: number): number {
  const gained = mass * (1 + MAX_BONUS * affinity(cell.pigment, color));
  cell.pigment = blendPigment(cell.pigment, color, gained / (cell.mass + gained));
  return gained;
}
