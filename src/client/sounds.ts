import type { Hiss, Tone } from './audio.ts';

export type Sfx =
  'eat' | 'split' | 'spit' | 'merge' | 'death' | 'boost' | 'level' | 'volley' | 'dart' | 'pulse' | 'bomb' | 'hit';

export const SOUNDS: Readonly<Record<Sfx, { readonly tones: readonly Tone[]; readonly hisses: readonly Hiss[] }>> = {
  eat: {
    tones: [{ type: 'sine', from: 210, to: 96, duration: 0.13, gain: 0.05 }],
    hisses: [{ from: 1400, to: 500, duration: 0.07, gain: 0.02, q: 1.6 }],
  },
  split: {
    tones: [
      { type: 'triangle', from: 180, to: 420, duration: 0.16, gain: 0.03, sweep: 0.14 },
      { type: 'sine', from: 520, to: 90, duration: 0.16, gain: 0.06, delay: 0.15 },
    ],
    hisses: [
      { from: 2600, to: 700, duration: 0.05, gain: 0.04, q: 2.4, delay: 0.15 },
      { from: 300, to: 2600, duration: 0.42, gain: 0.07, q: 0.8, delay: 0.17 },
    ],
  },
  spit: {
    tones: [
      { type: 'sine', from: 360, to: 820, duration: 0.09, gain: 0.04 },
      { type: 'triangle', from: 640, to: 200, duration: 0.12, gain: 0.03, delay: 0.07 },
    ],
    hisses: [{ from: 500, to: 2200, duration: 0.34, gain: 0.05, q: 0.9, delay: 0.05 }],
  },
  boost: {
    tones: [
      { type: 'sine', from: 90, to: 46, duration: 0.3, gain: 0.08 },
      { type: 'triangle', from: 300, to: 900, duration: 0.22, gain: 0.025, delay: 0.02 },
    ],
    hisses: [
      { from: 220, to: 3200, duration: 0.55, gain: 0.09, q: 0.7 },
      { from: 1600, to: 400, duration: 0.7, gain: 0.03, q: 1.4, delay: 0.2 },
    ],
  },
  level: {
    tones: [
      { type: 'sine', from: 392, to: 392, duration: 0.5, gain: 0.03, wobble: [6, 4] },
      { type: 'sine', from: 523, to: 523, duration: 0.5, gain: 0.03, delay: 0.12, wobble: [6, 5] },
      { type: 'sine', from: 659, to: 659, duration: 0.6, gain: 0.03, delay: 0.24, wobble: [6, 6] },
      { type: 'triangle', from: 784, to: 1046, duration: 0.8, gain: 0.025, delay: 0.9, sweep: 0.5 },
    ],
    hisses: [{ from: 4000, to: 900, duration: 0.6, gain: 0.025, q: 2, delay: 0.85 }],
  },
  merge: {
    tones: [
      { type: 'sine', from: 128, to: 62, duration: 0.42, gain: 0.06 },
      { type: 'sine', from: 760, to: 470, duration: 0.28, gain: 0.022, delay: 0.03 },
    ],
    hisses: [{ from: 620, to: 180, duration: 0.34, gain: 0.03, q: 0.8 }],
  },
  death: {
    tones: [{ type: 'sawtooth', from: 190, to: 46, duration: 0.85, gain: 0.06 }],
    hisses: [{ from: 500, to: 90, duration: 0.9, gain: 0.03, q: 0.7 }],
  },
  volley: {
    tones: [{ type: 'triangle', from: 1400, to: 600, duration: 0.08, gain: 0.03 }],
    hisses: [
      { from: 2400, to: 5200, duration: 0.18, gain: 0.05, q: 3 },
      { from: 1800, to: 4200, duration: 0.16, gain: 0.03, q: 3, delay: 0.05 },
      { from: 2000, to: 4800, duration: 0.16, gain: 0.03, q: 3, delay: 0.1 },
    ],
  },
  dart: {
    tones: [
      { type: 'sawtooth', from: 900, to: 140, duration: 0.18, gain: 0.03 },
      { type: 'sine', from: 2200, to: 1800, duration: 0.05, gain: 0.03 },
    ],
    hisses: [{ from: 6000, to: 900, duration: 0.3, gain: 0.07, q: 1.2 }],
  },
  pulse: {
    tones: [
      { type: 'sine', from: 70, to: 32, duration: 0.6, gain: 0.12 },
      { type: 'sine', from: 240, to: 120, duration: 0.3, gain: 0.03 },
    ],
    hisses: [{ from: 200, to: 1400, duration: 0.7, gain: 0.06, q: 0.6 }],
  },
  bomb: {
    tones: [
      { type: 'sine', from: 300, to: 520, duration: 0.12, gain: 0.04 },
      { type: 'sine', from: 120, to: 60, duration: 0.5, gain: 0.07, delay: 0.55 },
    ],
    hisses: [{ from: 3000, to: 1200, duration: 1.4, gain: 0.04, q: 4, delay: 0.55 }],
  },
  hit: {
    tones: [{ type: 'sine', from: 380, to: 110, duration: 0.14, gain: 0.05 }],
    hisses: [{ from: 1800, to: 500, duration: 0.1, gain: 0.04, q: 1.6 }],
  },
};
