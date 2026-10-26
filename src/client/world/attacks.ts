import { CLOUD_DELAY, CLOUD_LIFE, CLOUD_RADIUS, pulseReach } from '../../shared/combat.ts';
import type { Rgb } from '../../shared/math.ts';
import { addSplat } from '../state.ts';
import { spawnBurst } from './decor.ts';

export const Weapon = { Volley: 2, Dart: 3, Pulse: 4, Bomb: 5, Toxin: 6, Spine: 7 } as const;

interface Shot {
  readonly kind: number;
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly radius: number;
  readonly color: Rgb;
  readonly at: number;
  readonly seed: number;
  puffs: number;
}

export interface Streak {
  readonly a: { readonly x: number; readonly y: number };
  readonly b: { readonly x: number; readonly y: number };
  readonly width: number;
  readonly glow: number;
  readonly pointed: boolean;
  readonly seed: number;
  readonly color: Rgb;
  readonly alpha: number;
}

const TOXIN_LIFE = 6;
const DART_SPEED = 1100;

const LIFETIME: Readonly<Record<number, number>> = {
  [Weapon.Volley]: 1.1,
  [Weapon.Dart]: 0.7,
  [Weapon.Pulse]: 0.7,
  [Weapon.Bomb]: (CLOUD_DELAY + CLOUD_LIFE) / 1000,
  [Weapon.Toxin]: TOXIN_LIFE,
  [Weapon.Spine]: 0.9,
};
const PUFF_INTERVAL = 0.22;
const ACID: Rgb = [0.75, 0.95, 0.35];

let shots: Shot[] = [];

export function addShot(kind: number, from: Shot['from'], to: Shot['to'], radius: number, color: Rgb): void {
  shots.push({ kind, from, to, radius, color, at: performance.now(), seed: Math.random(), puffs: 0 });
}

function point(from: Shot['from'], aim: { x: number; y: number }, distance: number): { x: number; y: number } {
  return { x: from.x + aim.x * distance, y: from.y + aim.y * distance };
}

function geometry(shot: Shot): { aim: { x: number; y: number }; range: number } {
  const dx = shot.to.x - shot.from.x;
  const dy = shot.to.y - shot.from.y;
  const range = Math.hypot(dx, dy) || 1;
  return { aim: { x: dx / range, y: dy / range }, range };
}

function volley(shot: Shot, age: number): Streak[] {
  const { aim, range } = geometry(shot);
  const reach = Math.min(1, age / 0.12);
  const alpha = 1 - Math.max(0, (age - 0.45) / 0.65);
  const start = point(shot.from, aim, shot.radius * 0.9);
  const end = point(shot.from, aim, shot.radius * 0.9 + (range - shot.radius * 0.9) * reach);
  return [{ a: start, b: end, width: 1.8, glow: 0.9, pointed: true, seed: shot.seed, color: shot.color, alpha }];
}

function dart(shot: Shot, age: number): Streak[] {
  const { aim, range } = geometry(shot);
  const head = Math.min(range, shot.radius + (age / 0.22) * DART_SPEED);
  const tail = Math.max(shot.radius, head - 220);
  const lodged = head >= range;
  const alpha = lodged ? 1 - Math.max(0, (age - 0.3) / 0.4) : 1;
  const a = point(shot.from, aim, tail);
  const b = point(shot.from, aim, head);
  return [{ a, b, width: 4.5, glow: 1.4, pointed: true, seed: shot.seed, color: shot.color, alpha }];
}

function pulse(shot: Shot, age: number): Streak[] {
  const reach = pulseReach(shot.radius) * (1 - Math.pow(1 - Math.min(1, age / 0.45), 3));
  const alpha = 1 - Math.min(1, age / 0.7);
  const count = 40;
  return Array.from({ length: count }, (_, i) => {
    const a0 = (i / count) * Math.PI * 2;
    const a1 = ((i + 1) / count) * Math.PI * 2;
    return {
      a: { x: shot.from.x + Math.cos(a0) * reach, y: shot.from.y + Math.sin(a0) * reach },
      b: { x: shot.from.x + Math.cos(a1) * reach, y: shot.from.y + Math.sin(a1) * reach },
      width: 3,
      glow: 1.6,
      pointed: false,
      seed: shot.seed,
      color: [0.75, 0.92, 1],
      alpha: alpha * 0.8,
    };
  });
}

function bomb(shot: Shot, age: number): Streak[] {
  const flight = CLOUD_DELAY / 1000;
  if (age >= flight) {
    puff(shot, age - flight, { radius: CLOUD_RADIUS, life: CLOUD_LIFE / 1000, tint: acid(shot.color) });
    return [];
  }
  const { aim, range } = geometry(shot);
  const t = age / flight;
  const at = point(shot.from, aim, range * t);
  const lift = Math.sin(t * Math.PI) * range * 0.12;
  const blob = { x: at.x, y: at.y + lift };
  const trail = point(blob, aim, -14);
  return [{ a: trail, b: blob, width: 9, glow: 1.2, pointed: false, seed: shot.seed, color: ACID, alpha: 1 }];
}

interface Cloud {
  readonly radius: number;
  readonly life: number;
  readonly tint: Rgb;
}

function puff(shot: Shot, age: number, cloud: Cloud): void {
  const due = Math.floor(age / PUFF_INTERVAL);
  while (shot.puffs <= due && age < cloud.life) {
    shot.puffs += 1;
    const angle = Math.random() * Math.PI * 2;
    const spread = Math.random() * cloud.radius * 0.6;
    addSplat({
      x: shot.to.x + Math.cos(angle) * spread,
      y: shot.to.y + Math.sin(angle) * spread,
      radius: cloud.radius * (0.45 + Math.random() * 0.3),
      color: cloud.tint,
      strength: shot.puffs === 1 ? 0.9 : 0.32,
    });
    spawnBurst(shot.to.x, shot.to.y, cloud.tint, {
      count: 5,
      spread: cloud.radius * 0.6,
      speed: 40,
      size: 3,
      life: [1, 2.5],
      front: 0.5,
    });
  }
}

function acid(color: Rgb): Rgb {
  return [ACID[0] * 0.8 + color[0] * 0.2, ACID[1] * 0.8 + color[1] * 0.2, ACID[2] * 0.8 + color[2] * 0.2];
}

function spine(shot: Shot, age: number): Streak[] {
  const { aim, range } = geometry(shot);
  const head = Math.min(range, shot.radius + (age / 0.12) * range);
  const alpha = 1 - Math.max(0, (age - 0.4) / 0.5);
  const a = point(shot.from, aim, shot.radius * 0.8);
  const b = point(shot.from, aim, head);
  return [{ a, b, width: 1.1, glow: 0.35, pointed: true, seed: shot.seed, color: [0.92, 0.9, 0.85], alpha }];
}

function toxin(shot: Shot, age: number): Streak[] {
  puff(shot, age, { radius: shot.radius, life: TOXIN_LIFE, tint: shot.color });
  return [];
}

const DRAW: Readonly<Record<number, (shot: Shot, age: number) => Streak[]>> = {
  [Weapon.Volley]: volley,
  [Weapon.Dart]: dart,
  [Weapon.Pulse]: pulse,
  [Weapon.Bomb]: bomb,
  [Weapon.Toxin]: toxin,
  [Weapon.Spine]: spine,
};

export function activeStreaks(): Streak[] {
  const now = performance.now();
  shots = shots.filter((shot) => (now - shot.at) / 1000 < (LIFETIME[shot.kind] ?? 1));
  return shots.flatMap((shot) => DRAW[shot.kind]?.(shot, (now - shot.at) / 1000) ?? []);
}
