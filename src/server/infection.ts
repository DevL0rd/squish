import { radiusFor, type Rgb } from '../shared/math.ts';
import { EventKind, Infection, INFECTIONS } from '../shared/protocol.ts';
import type { Cell, Player } from './types.ts';
import { emit, world } from './world.ts';

const PARASITE_DRAIN = 0.9;
const BLOOM_GAIN = 1.3;
const LYSIS_DRAIN = 1.5;
const MIN_MASS = 12;

function duration(type: number): number {
  return (INFECTIONS[type]?.duration ?? 10) * 1000;
}

export function infect(player: Player, cell: Cell, type: number, color: Rgb): void {
  const until = world.now + duration(type);
  if (type === Infection.Parasite) cell.parasites.push(until);
  else player.effects.push({ type, until });
  emit({
    kind: EventKind.InfectionFirst + type,
    cellId: cell.id,
    predatorId: 0,
    x: cell.x,
    y: cell.y,
    color,
  });
}

export function randomPhage(): number {
  return Infection.Swift + Math.floor(Math.random() * (INFECTIONS.length - 1));
}

function hasEffect(player: Player, type: number): boolean {
  return player.effects.some((effect) => effect.type === type);
}

export function speedFactor(player: Player): number {
  let factor = 1;
  if (hasEffect(player, Infection.Swift)) factor *= 1.35;
  if (hasEffect(player, Infection.Sluggish)) factor *= 0.7;
  return factor;
}

function adjust(cell: Cell, delta: number): void {
  cell.mass = Math.max(MIN_MASS, cell.mass + delta);
  cell.radius = radiusFor(cell.mass);
}

export function applyInfections(player: Player, dt: number): void {
  player.effects = player.effects.filter((effect) => effect.until > world.now);
  const growth =
    (hasEffect(player, Infection.Bloom) ? BLOOM_GAIN : 0) - (hasEffect(player, Infection.Lysis) ? LYSIS_DRAIN : 0);
  const share = player.cells.length || 1;
  for (const cell of player.cells) {
    cell.parasites = cell.parasites.filter((until) => until > world.now);
    const drain = cell.parasites.length * PARASITE_DRAIN;
    if (drain || growth) adjust(cell, (growth / share - drain) * dt);
  }
}
