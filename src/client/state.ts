import { settings } from './ui/settings.ts';
import { WORLD, type Rgb } from '../shared/math.ts';
import type { RosterEntry } from '../shared/protocol.ts';
import type { CellVisual } from './cell/cell.ts';

export const WORLD_CENTER = WORLD / 2;

export interface FoodVisual {
  readonly id: number;
  variety: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  radius: number;
  targetRadius: number;
  color: Rgb;
  ejecta: boolean;
  grow: number;
  alpha: number;
  targetAlpha: number;
  lastSeen: number;
  readonly phase: number;
}

export interface CreatureVisual {
  readonly id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  radius: number;
  kind: number;
  color: Rgb;
  angle: number;
  targetAngle: number;
  phase: number;
  state: number;
  stateSince: number;
  grow: number;
}

export interface Splat {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly strength: number;
}

export interface SpitTint {
  readonly x: number;
  readonly y: number;
  readonly color: Rgb;
  life: number;
}

export const state = {
  me: 0,
  joined: false,
  joinedAt: 0,
  dead: false,
  roster: new Map<number, RosterEntry>(),
  cells: new Map<number, CellVisual>(),
  food: new Map<number, FoodVisual>(),
  creatures: new Map<number, CreatureVisual>(),
  splats: [] as Splat[],
  spitTints: [] as SpitTint[],
  camera: { x: WORLD_CENTER, y: WORLD_CENTER, width: 1200, height: 800, ox: 0, oy: 0, shake: 0 },
  target: { x: WORLD_CENTER, y: WORLD_CENTER },
  zoom: { value: 1, target: 1 },
  targetReady: false,
  time: 0,
  attractSeed: Math.random() * 100,
};

export function isMine(cell: { readonly pid: number }): boolean {
  return cell.pid === state.me;
}

export function shake(amount: number): void {
  const { shake: enabled, reducedMotion } = settings();
  if (enabled && !reducedMotion) state.camera.shake = Math.max(state.camera.shake, amount);
}

export function addSplat(splat: Splat): void {
  state.splats.push(splat);
}

export function ownCells(): CellVisual[] {
  return [...state.cells.values()].filter(isMine);
}

export function playerCenter(): { x: number; y: number; mass: number } | null {
  let x = 0;
  let y = 0;
  let mass = 0;
  for (const cell of ownCells()) {
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    mass += cell.mass;
  }
  return mass > 0 ? { x: x / mass, y: y / mass, mass } : null;
}

export function inView(point: { readonly x: number; readonly y: number }, scale: number, margin: number): boolean {
  const camera = state.camera;
  return (
    Math.abs(point.x - camera.x) <= camera.width * scale + margin &&
    Math.abs(point.y - camera.y) <= camera.height * scale + margin
  );
}

const SETTLE_TIME = 2000;
const GROW_TIME = 1.4;

export function freshSpawn(point: { readonly x: number; readonly y: number }): boolean {
  return state.joined && performance.now() - state.joinedAt > SETTLE_TIME && inView(point, 0.42, 0);
}

export function growStep(grow: number, dt: number): number {
  return Math.min(1, grow + dt / GROW_TIME);
}

export function growth(item: { readonly grow: number }): number {
  return item.grow * item.grow * (3 - 2 * item.grow);
}
