import { EventKind } from '../../shared/protocol.ts';
import { burstCell, chipCell, launchCell } from '../actions.ts';
import type { Cell, Player, Point } from '../types.ts';
import { radiusFor } from '../../shared/math.ts';
import { emit, world } from '../world.ts';

export interface Blow {
  readonly wound: number;
  readonly chip: number;
  readonly shove?: number;
}

export interface Target {
  readonly player: Player;
  readonly cell: Cell;
}

const BURST_DRAIN = 0.3;

export function enemies(attacker: Player | null): Target[] {
  const targets: Target[] = [];
  for (const player of world.players.values()) {
    if (player === attacker) continue;
    for (const cell of player.cells) if (cell.gut < 0) targets.push({ player, cell });
  }
  return targets;
}

export function along(origin: Point, aim: Point, target: Point, range: number, width: number): number | null {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const t = dx * aim.x + dy * aim.y;
  if (t < 0 || t > range) return null;
  return Math.abs(dx * aim.y - dy * aim.x) <= width ? t : null;
}

function burst(target: Target): void {
  target.cell.wounds = 0;
  if (burstCell(target.player, target.cell)) return;
  target.cell.mass *= 1 - BURST_DRAIN;
  target.cell.radius = radiusFor(target.cell.mass);
}

export function woundCell(target: Target, amount: number): boolean {
  target.cell.wounds += amount * (1 - target.player.defense);
  if (target.cell.wounds < 1) return false;
  burst(target);
  return true;
}

export function strikeCell(target: Target, aim: Point, blow: Blow): void {
  const guard = 1 - target.player.defense;
  const { cell } = target;
  emit({
    kind: EventKind.Hit,
    cellId: cell.id,
    predatorId: 0,
    x: cell.x - aim.x * cell.radius,
    y: cell.y - aim.y * cell.radius,
    color: cell.pigment,
    amount: blow.wound * guard,
  });
  if (blow.shove) launchCell(cell, aim, blow.shove * guard);
  if (!woundCell(target, blow.wound) && blow.chip > 0) chipCell(target.player, cell, aim, blow.chip * guard);
}
