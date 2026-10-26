import { SkyTool, SpotPhase, type WireSpot } from '../../shared/protocol.ts';
import { STRIKE_TIMES, strikeWith } from './tools.ts';
import type { Cell, Player } from '../types.ts';
import { biggestCell, world } from '../world.ts';

const ROAM_RADIUS = 280;
const FOCUS_RADIUS = 170;
const ROAM_SPEED = 470;
const LOCK_TIME = 1.8;
const FOCUS_TIME = 1.1;
const FADE_TIME = 2;
const LIFETIME = 40;

interface Spot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  phase: number;
  phaseTime: number;
  lock: number;
  age: number;
  target: number;
  readonly tool: number;
  readonly angle: number;
}

let spot: Spot | null = null;

function pickTarget(): Player | undefined {
  const candidates = [...world.players.values()].filter((player) => player.cells.length);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function startPipette(tool: number, forced?: Player): boolean {
  const target = biggestCell(forced ?? pickTarget());
  if (!target) return false;
  const angle = Math.random() * Math.PI * 2;
  spot = {
    x: target.x + Math.cos(angle) * 1100,
    y: target.y + Math.sin(angle) * 1100,
    vx: 0,
    vy: 0,
    radius: ROAM_RADIUS,
    phase: SpotPhase.Roam,
    phaseTime: 0,
    lock: 0,
    age: 0,
    target: target.id,
    tool,
    angle: Math.random() * Math.PI,
  };
  return true;
}

export function pipetteActive(): boolean {
  return spot !== null;
}

function targetCell(current: Spot): Cell | undefined {
  for (const player of world.players.values()) {
    const cell = player.cells.find((candidate) => candidate.id === current.target);
    if (cell) return cell;
  }
  return undefined;
}

function enter(current: Spot, phase: number): void {
  current.phase = phase;
  current.phaseTime = 0;
}

function chase(current: Spot, cell: Cell, dt: number): void {
  const dx = cell.x - current.x;
  const dy = cell.y - current.y;
  const length = Math.hypot(dx, dy) || 1;
  const speed = current.phase === SpotPhase.Focus ? ROAM_SPEED * 0.7 : ROAM_SPEED;
  const blend = 1 - Math.exp(-dt * 3);
  current.vx += ((dx / length) * speed - current.vx) * blend;
  current.vy += ((dy / length) * speed - current.vy) * blend;
  current.x += current.vx * dt;
  current.y += current.vy * dt;
}

function strike(current: Spot, cell: Cell): void {
  strikeWith(current.tool, cell, current);
  enter(current, SpotPhase.Strike);
}

function roam(current: Spot, inside: boolean): void {
  if (!inside) current.lock = 0;
  if (current.lock >= LOCK_TIME) enter(current, SpotPhase.Focus);
}

function focus(current: Spot, cell: Cell, inside: boolean): void {
  if (!inside) enter(current, SpotPhase.Roam);
  else if (current.phaseTime >= FOCUS_TIME) strike(current, cell);
}

function strikeTime(current: Spot): number {
  return STRIKE_TIMES[current.tool] ?? 1;
}

function release(current: Spot, cell: Cell): void {
  cell.heldUntil = 0;
  enter(current, SpotPhase.Fade);
}

function advance(current: Spot, cell: Cell): void {
  const inside = Math.hypot(cell.x - current.x, cell.y - current.y) < current.radius;
  if (current.phase === SpotPhase.Roam) roam(current, inside);
  else if (current.phase === SpotPhase.Focus) focus(current, cell, inside);
  else if (current.phase === SpotPhase.Strike && current.phaseTime >= strikeTime(current)) release(current, cell);
}

export function updatePipette(dt: number): void {
  const current = spot;
  if (!current) return;
  current.age += dt;
  current.phaseTime += dt;
  current.lock += dt;
  const cell = targetCell(current);
  if (current.phase === SpotPhase.Fade) {
    if (current.phaseTime >= FADE_TIME) spot = null;
    return;
  }
  if (!cell || current.age > LIFETIME) {
    if (current.phase !== SpotPhase.Strike) enter(current, SpotPhase.Fade);
    return;
  }
  if (current.phase !== SpotPhase.Strike) chase(current, cell, dt);
  else if (current.tool === SkyTool.Holder) Object.assign(current, { x: cell.x, y: cell.y });
  const goal = current.phase === SpotPhase.Focus ? FOCUS_RADIUS : ROAM_RADIUS;
  current.radius += (goal - current.radius) * Math.min(1, dt * 2);
  advance(current, cell);
}

export function spotWire(): WireSpot | null {
  if (!spot) return null;
  const durations: Readonly<Record<number, number>> = {
    [SpotPhase.Roam]: LOCK_TIME,
    [SpotPhase.Focus]: FOCUS_TIME,
    [SpotPhase.Strike]: strikeTime(spot),
    [SpotPhase.Fade]: FADE_TIME,
  };
  const length = durations[spot.phase] ?? 1;
  const elapsed = spot.phase === SpotPhase.Roam ? spot.lock : spot.phaseTime;
  return {
    x: spot.x,
    y: spot.y,
    radius: spot.radius,
    phase: spot.phase,
    progress: Math.min(1, elapsed / length),
    target: spot.target,
    tool: spot.tool,
    angle: spot.angle,
  };
}
