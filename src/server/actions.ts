import { radiusFor } from '../shared/math.ts';
import { EventKind } from '../shared/protocol.ts';
import { MAX_CELLS, MERGE_DELAY } from './config.ts';
import { addFood } from './food.ts';
import { direction } from './physics.ts';
import { makeCell, playerColor } from './players.ts';
import type { Cell, Player, Point } from './types.ts';
import { world } from './world.ts';

const SPLIT_COOLDOWN = 260;
const SPLIT_MIN_MASS = 44;
const EJECT_COOLDOWN = 240;
const EJECT_MIN_MASS = 50;
const EJECT_MASS = 17;

function aimFrom(player: Player, cell: Cell): Point {
  const dx = player.target.x - cell.x;
  const dy = player.target.y - cell.y;
  if (Math.hypot(dx, dy) < 8) return direction(Math.cos(player.wanderPhase), Math.sin(player.wanderPhase));
  return direction(dx, dy);
}

function splitCell(player: Player, cell: Cell): void {
  const aim = aimFrom(player, cell);
  const half = cell.mass * 0.5;
  cell.mass = half;
  cell.radius = radiusFor(half);
  cell.mergeAt = world.now + MERGE_DELAY;
  const child = makeCell({
    x: cell.x + aim.x * cell.radius * 0.7,
    y: cell.y + aim.y * cell.radius * 0.7,
    mass: half,
    vx: cell.vx + aim.x * 560,
    vy: cell.vy + aim.y * 560,
    mergeAt: world.now + MERGE_DELAY,
  });
  player.cells.push(child);
  world.events.push({
    kind: EventKind.Split,
    cellId: cell.id,
    predatorId: child.id,
    x: child.x,
    y: child.y,
    color: playerColor(player, 0.86, 0.62),
  });
}

export function splitPlayer(player: Player): void {
  if (world.now - player.lastSplit < SPLIT_COOLDOWN) return;
  if (player.cells.length >= MAX_CELLS) return;
  player.lastSplit = world.now;
  for (const cell of [...player.cells]) {
    if (player.cells.length >= MAX_CELLS) break;
    if (cell.mass >= SPLIT_MIN_MASS) splitCell(player, cell);
  }
}

function ejectFrom(player: Player, cell: Cell): void {
  cell.mass -= EJECT_MASS;
  cell.radius = radiusFor(cell.mass);
  const aim = direction(player.target.x - cell.x, player.target.y - cell.y);
  const x = cell.x + aim.x * (cell.radius + 8);
  const y = cell.y + aim.y * (cell.radius + 8);
  const color = playerColor(player, 0.92, 0.66);
  addFood({ x, y, vx: aim.x * 620, vy: aim.y * 620, mass: 14, radius: 15, color, ejecta: true, owner: player.id });
  world.events.push({ kind: EventKind.Spit, cellId: cell.id, predatorId: 0, x, y, color });
}

export function ejectMass(player: Player): void {
  if (world.now - player.lastEject < EJECT_COOLDOWN) return;
  player.lastEject = world.now;
  for (const cell of player.cells) {
    if (cell.mass >= EJECT_MIN_MASS) ejectFrom(player, cell);
  }
}

export function absorbInto(survivor: Cell, absorbed: Cell): void {
  const total = survivor.mass + absorbed.mass;
  survivor.x = (survivor.x * survivor.mass + absorbed.x * absorbed.mass) / total;
  survivor.y = (survivor.y * survivor.mass + absorbed.y * absorbed.mass) / total;
  survivor.vx = (survivor.vx * survivor.mass + absorbed.vx * absorbed.mass) / total;
  survivor.vy = (survivor.vy * survivor.mass + absorbed.vy * absorbed.mass) / total;
  survivor.mass = total;
  survivor.radius = radiusFor(total);
}

function canRejoin(a: Cell, b: Cell): boolean {
  if (world.now < a.mergeAt || world.now < b.mergeAt) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + 8;
}

export function rejoinCells(player: Player): void {
  const cells = player.cells;
  for (let i = 0; i < cells.length; i += 1) {
    const a = cells[i];
    if (!a) continue;
    for (let j = i + 1; j < cells.length; j += 1) {
      const b = cells[j];
      if (!b || !canRejoin(a, b)) continue;
      absorbInto(a, b);
      world.events.push({
        kind: EventKind.Merge,
        cellId: b.id,
        predatorId: a.id,
        x: a.x,
        y: a.y,
        color: playerColor(player, 0.82, 0.58),
      });
      cells.splice(j, 1);
      j -= 1;
    }
  }
}
