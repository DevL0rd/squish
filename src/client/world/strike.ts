import type { Rgb } from '../../shared/math.ts';

interface Strike {
  readonly color: Rgb;
  readonly gift: boolean;
  readonly at: number;
}

let strike: Strike | null = null;

export function rememberStrike(color: Rgb, gift: boolean): void {
  strike = { color, gift, at: performance.now() };
}

export function lastStrike(): Strike | null {
  return strike && performance.now() - strike.at < 3000 ? strike : null;
}
