import { clamp, hslToRgb, worldHueAt, type Rgb } from '../shared/math.ts';

export function colorForHue(hue: number): Rgb {
  return hslToRgb(hue, 0.9, 0.58);
}

export function worldColorAt(x: number, y: number, saturation: number, lightness: number): Rgb {
  return hslToRgb(worldHueAt(x, y), saturation, lightness);
}

export function cssColor(hue: number): string {
  return `hsl(${Math.round(hue)} 76% 63%)`;
}

export function vividColor(color: Rgb): Rgb {
  const max = Math.max(color[0], color[1], color[2], 0.001);
  return [clamp(color[0] / max, 0, 1), clamp(color[1] / max, 0, 1), clamp(color[2] / max, 0, 1)];
}

export function mixColor(from: Rgb, to: Rgb, amount: number): Rgb {
  return [
    from[0] + (to[0] - from[0]) * amount,
    from[1] + (to[1] - from[1]) * amount,
    from[2] + (to[2] - from[2]) * amount,
  ];
}

export function randomRange(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

export function hexSeed(value: number): number {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
