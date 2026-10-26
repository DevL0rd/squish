import { WORLD, type Rgb } from '../shared/math.ts';
import type { RosterEntry } from '../shared/protocol.ts';
import type { Interior } from './interior/interior.ts';
import type { SoftBody } from './softbody/softbody.ts';

export const WORLD_CENTER = WORLD / 2;

export interface CellVisual {
  readonly id: number;
  pid: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  targetRadius: number;
  hue: number;
  name: string;
  bot: boolean;
  lastSeen: number;
  mergeReady: boolean;
  readonly soft: SoftBody;
}

export interface InteriorRecord {
  readonly interior: Interior;
  texture: WebGLTexture | null;
  lastSeen: number;
  fluidColor: Rgb | null;
  colorTimer: number;
}

export interface FoodVisual {
  readonly id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  radius: number;
  targetRadius: number;
  color: Rgb;
  ejecta: boolean;
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
}

export interface MergeGhost {
  readonly survivorId: number;
  readonly cell: CellVisual;
  readonly record: InteriorRecord;
  readonly startX: number;
  readonly startY: number;
  readonly startRadius: number;
  life: number;
  readonly maxLife: number;
  mergeTimer: number;
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
  dead: false,
  roster: new Map<number, RosterEntry>(),
  cells: new Map<number, CellVisual>(),
  food: new Map<number, FoodVisual>(),
  interiors: new Map<number, InteriorRecord>(),
  creatures: new Map<number, CreatureVisual>(),
  splats: [] as Splat[],
  mergeGhosts: [] as MergeGhost[],
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
  state.camera.shake = Math.max(state.camera.shake, amount);
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
