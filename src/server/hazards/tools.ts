import { hslToRgb, radiusFor } from '../../shared/math.ts';
import { EventKind, SkyTool } from '../../shared/protocol.ts';
import { segmentShare, severCell } from '../actions.ts';
import type { Cell } from '../types.ts';
import { emit, ownerOf, toBytes, world } from '../world.ts';

const DRAIN = 0.6;
const GIFT_CHANCE = 0.12;
const HOLD_TIME = 60000;
const CUT_REACH = 3;
const CUT_MIN = 500;
const CUT_SPEED = 320;

export const STRIKE_TIMES: Readonly<Record<number, number>> = {
  [SkyTool.Needle]: 1.2,
  [SkyTool.Holder]: HOLD_TIME / 1000,
  [SkyTool.Knife]: 1.4,
};

function drain(cell: Cell, x: number, y: number): void {
  const gift = Math.random() < GIFT_CHANCE;
  const before = cell.mass;
  const color = gift ? toBytes(hslToRgb(Math.random() * 360, 0.8, 0.55)) : cell.pigment;
  cell.mass = gift ? before * (1 + DRAIN) : Math.max(10, before * (1 - DRAIN));
  cell.radius = radiusFor(cell.mass);
  if (gift) cell.pigment = color;
  const predatorId = ownerOf(cell)?.id ?? 0;
  emit({
    kind: EventKind.Pipette,
    cellId: cell.id,
    predatorId,
    x,
    y,
    color,
    amount: Math.abs(cell.mass - before),
    bonus: gift ? 1 : 0,
  });
}

function hold(cell: Cell): void {
  cell.heldUntil = world.now + HOLD_TIME;
}

function slice(target: Cell, angle: number): void {
  const along = { x: Math.cos(angle), y: Math.sin(angle) };
  const across = { x: -along.y, y: along.x };
  const reach = Math.max(CUT_MIN, target.radius * CUT_REACH);
  for (const player of world.players.values()) {
    for (const cell of [...player.cells]) {
      const dx = cell.x - target.x;
      const dy = cell.y - target.y;
      const offset = dx * across.x + dy * across.y;
      if (Math.abs(offset) >= cell.radius || Math.abs(dx * along.x + dy * along.y) > reach) continue;
      const side = offset >= 0 ? -1 : 1;
      severCell(player, cell, { x: across.x * side, y: across.y * side }, segmentShare(cell.radius, offset), CUT_SPEED);
    }
  }
}

export function strikeWith(tool: number, cell: Cell, at: { x: number; y: number; angle: number }): void {
  if (tool === SkyTool.Holder) hold(cell);
  else if (tool === SkyTool.Knife) slice(cell, at.angle);
  else drain(cell, at.x, at.y);
}
