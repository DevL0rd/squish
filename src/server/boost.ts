import { clamp } from '../shared/math.ts';
import { EventKind } from '../shared/protocol.ts';
import { aimFrom, launchCell } from './actions.ts';
import { sendJson } from './transport.ts';
import type { Cell, Player } from './types.ts';
import { emit, ownerOf } from './world.ts';

const MAX_BOOSTS = 2;
const BOOST_SPEED = 1300;
const CHARGE_PER_RADIUS = 1 / 40;
const CHARGE_RANGE: readonly [number, number] = [0.15, 0.5];

export function tellBoost(player: Player): void {
  if (player.ws) sendJson(player.ws, { t: 'boost', charge: player.boost });
}

export function chargeBoost(cell: Cell, preyRadius: number): void {
  const player = ownerOf(cell);
  if (!player || player.boost >= MAX_BOOSTS) return;
  const gain = clamp(preyRadius * CHARGE_PER_RADIUS, CHARGE_RANGE[0], CHARGE_RANGE[1]);
  player.boost = Math.min(MAX_BOOSTS, player.boost + gain);
  tellBoost(player);
}

export function boostPlayer(player: Player): void {
  if (player.boost < 1) return;
  player.boost -= 1;
  tellBoost(player);
  for (const cell of player.cells) {
    if (cell.gut >= 0) continue;
    const aim = aimFrom(player, cell);
    launchCell(cell, aim, BOOST_SPEED);
    emit({
      kind: EventKind.Boost,
      cellId: cell.id,
      predatorId: 0,
      x: cell.x - aim.x * cell.radius,
      y: cell.y - aim.y * cell.radius,
      color: cell.pigment,
      amount: cell.radius,
    });
  }
}
