import type { Rgb } from '../../shared/math.ts';

const DURATION = 4400;

interface Injection {
  readonly cellId: number;
  readonly color: Rgb;
  readonly at: number;
}

let injections: Injection[] = [];

export function startInjection(cellId: number, color: Rgb): void {
  injections.push({ cellId, color, at: performance.now() });
}

export function activeInjections(): { readonly cellId: number; readonly color: Rgb; readonly progress: number }[] {
  const now = performance.now();
  injections = injections.filter((item) => now - item.at < DURATION);
  return injections.map((item) => ({ cellId: item.cellId, color: item.color, progress: (now - item.at) / DURATION }));
}
