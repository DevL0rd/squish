type Quality = 'high' | 'balanced' | 'low';
type Side = 'left' | 'right';

export interface Settings {
  readonly master: number;
  readonly effects: number;
  readonly ambience: number;
  readonly music: number;
  readonly musicOn: boolean;
  readonly muted: boolean;
  readonly quality: Quality;
  readonly bloom: boolean;
  readonly grain: boolean;
  readonly shake: boolean;
  readonly reducedMotion: boolean;
  readonly names: boolean;
  readonly joystick: Side;
  readonly vibration: boolean;
  readonly leaderboard: boolean;
  readonly meals: boolean;
}

const KEY = 'squish.settings';

const DEFAULTS: Settings = {
  master: 0.8,
  effects: 0.8,
  ambience: 0.6,
  music: 0.6,
  musicOn: true,
  muted: false,
  quality: 'high',
  bloom: true,
  grain: true,
  shake: true,
  reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  names: true,
  joystick: 'left',
  vibration: true,
  leaderboard: true,
  meals: true,
};

type Listener = (current: Settings) => void;
const listeners: Listener[] = [];

function sanitize(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return DEFAULTS;
  const source = raw as Record<string, unknown>;
  const pick = <K extends keyof Settings>(key: K): Settings[K] => {
    const value = source[key];
    return typeof value === typeof DEFAULTS[key] ? (value as Settings[K]) : DEFAULTS[key];
  };
  const keys = Object.keys(DEFAULTS) as (keyof Settings)[];
  return Object.fromEntries(keys.map((key) => [key, pick(key)])) as unknown as Settings;
}

function load(): Settings {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return DEFAULTS;
  }
}

let current = load();

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    return;
  } finally {
    for (const listener of listeners) listener(current);
  }
}

export function onSettings(listener: Listener): void {
  listeners.push(listener);
  listener(current);
}

export function resetSettings(): void {
  updateSettings(DEFAULTS);
}

export const QUALITY = {
  high: { pixelRatio: 1.75, fluid: 1024 },
  balanced: { pixelRatio: 1.25, fluid: 768 },
  low: { pixelRatio: 1, fluid: 512 },
} as const;
