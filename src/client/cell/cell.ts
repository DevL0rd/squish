import { mulberry32, radiusFor, type Rgb } from '../../shared/math.ts';
import type { WireCell } from '../../shared/protocol.ts';
import { colorForHue, hexSeed, mixColor } from '../color.ts';
import { coarsePointer } from '../dom.ts';
import { Interior } from '../interior/interior.ts';
import { circleRing, ringCentroid, type Point } from './geometry.ts';
import { Membrane, type Cleave, type Plane } from './membrane.ts';
import { Organelles } from './organelles.ts';

export const RING_POINTS = coarsePointer ? 48 : 64;
const INTERIOR_RESOLUTION = 40;
const COLOR_INTERVAL = 0.18;

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
  readonly membrane: Membrane;
  readonly interior: Interior;
  readonly organelles: Organelles;
  center: Point;
  texture: WebGLTexture | null;
  fluidColor: Rgb;
  colorTimer: number;
}

export interface Identity {
  readonly hue: number;
  readonly name: string;
  readonly bot: boolean;
}

export function createCellVisual(wire: WireCell, pid: number, identity: Identity, now: number): CellVisual {
  const radius = radiusFor(wire.mass);
  const seed = hexSeed(wire.id * 7919 + 17);
  const interior = new Interior(INTERIOR_RESOLUTION, seed, identity.hue >= 0 ? colorForHue(identity.hue) : null);
  const organelles = new Organelles(mulberry32(seed ^ 0x5bd1e995));
  organelles.seed(radius);
  const membrane = new Membrane(circleRing(RING_POINTS, wire, radius), seed);
  membrane.radius = radius;
  return {
    id: wire.id,
    pid,
    x: wire.x,
    y: wire.y,
    tx: wire.x,
    ty: wire.y,
    vx: wire.vx,
    vy: wire.vy,
    mass: wire.mass,
    radius,
    targetRadius: radius,
    ...identity,
    lastSeen: now,
    membrane,
    interior,
    organelles,
    center: { x: wire.x, y: wire.y },
    texture: null,
    fluidColor: interior.averageColor(),
    colorTimer: 0,
  };
}

export function interiorScale(cell: CellVisual): number {
  return cell.radius * 1.35;
}

export function toLocal(cell: CellVisual, point: Point): Point {
  return { x: point.x - cell.center.x, y: point.y - cell.center.y };
}

export function stepMembrane(cell: CellVisual, dt: number, planes: readonly Plane[], cleave: Cleave | null): void {
  cell.membrane.radius = cell.radius;
  for (const item of cell.organelles.items) {
    if (!item.cup) continue;
    item.cup.x = cell.center.x + item.x;
    item.cup.y = cell.center.y + item.y;
  }
  cell.membrane.step(dt, { anchor: cell, vx: cell.vx, vy: cell.vy, planes, cleave });
  cell.center = ringCentroid(cell.membrane);
}

export function stepInterior(cell: CellVisual, dt: number): boolean {
  const simulated = cell.interior.step(dt, cell);
  const scale = interiorScale(cell);
  cell.organelles.update(dt, { ring: cell.membrane, center: cell.center, scale, fluid: cell.interior }, cell.radius);
  cell.colorTimer += dt;
  if (cell.colorTimer > COLOR_INTERVAL) {
    cell.fluidColor = mixColor(cell.fluidColor, cell.interior.averageColor(), 0.25);
    cell.colorTimer = 0;
  }
  return simulated || cell.interior.dirty;
}
