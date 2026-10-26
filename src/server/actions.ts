import { clamp, radiusFor } from '../shared/math.ts';
import { EventKind, FoodVariety } from '../shared/protocol.ts';
import { MERGE_DELAY } from './config.ts';
import { addFood } from './food.ts';
import { narrowContact } from './obstacles.ts';
import { blendPigment } from './pigment.ts';
import { direction } from './physics.ts';
import { makeCell, playerColor } from './players.ts';
import type { Cell, Player, Point } from './types.ts';
import { emit, world } from './world.ts';

const SPLIT_COOLDOWN = 260;
const SPLIT_MIN_MASS = 25;
const LAUNCH_SPEED = 980;
const EJECT_COOLDOWN = 240;
const EJECT_MIN_MASS = 50;
const EJECT_MASS = 17;
const CHIP_SPEED = 620;
const EJECT_SPEED = 1500;

export function aimFrom(player: Player, cell: Cell): Point {
  const dx = player.target.x - cell.x;
  const dy = player.target.y - cell.y;
  if (Math.hypot(dx, dy) < 8) return direction(Math.cos(player.wanderPhase), Math.sin(player.wanderPhase));
  return direction(dx, dy);
}

interface Launch {
  readonly aim: Point;
  readonly reach: number;
  readonly speed: number;
  readonly mass: number;
}

function adoptPiece(player: Player, cell: Cell, child: Cell): void {
  player.cells.push(child);
  const color = playerColor(player, 0.86, 0.62);
  emit({ kind: EventKind.Split, cellId: cell.id, predatorId: child.id, x: child.x, y: child.y, color });
}

function launchPiece(player: Player, cell: Cell, launch: Launch): void {
  const { aim, speed } = launch;
  const child = makeCell({
    x: cell.x + aim.x * cell.radius * launch.reach,
    y: cell.y + aim.y * cell.radius * launch.reach,
    mass: launch.mass,
    vx: cell.vx + aim.x * speed,
    vy: cell.vy + aim.y * speed,
    boostX: aim.x * speed,
    boostY: aim.y * speed,
    mergeAt: world.now + MERGE_DELAY,
    digesting: cell.digesting,
    pigment: cell.pigment,
  });
  adoptPiece(player, cell, child);
}

export function launchCell(cell: Cell, aim: Point, speed: number): void {
  cell.boostX = aim.x * speed;
  cell.boostY = aim.y * speed;
  cell.vx += cell.boostX;
  cell.vy += cell.boostY;
}

function escapeGut(player: Player, cell: Cell): void {
  cell.gut = -1;
  launchCell(cell, aimFrom(player, cell), LAUNCH_SPEED);
}

function splitCell(player: Player, cell: Cell): void {
  const aim = aimFrom(player, cell);
  const half = cell.mass * 0.5;
  cell.mass = half;
  cell.digesting *= 0.5;
  cell.radius = radiusFor(half);
  cell.mergeAt = world.now + MERGE_DELAY;
  launchPiece(player, cell, { aim, reach: 0.7, speed: LAUNCH_SPEED, mass: half });
}

export function splitPlayer(player: Player): void {
  if (world.now - player.lastSplit < SPLIT_COOLDOWN) return;
  player.lastSplit = world.now;
  for (const cell of [...player.cells]) {
    if (cell.gut >= 0) {
      escapeGut(player, cell);
      continue;
    }
    if (cell.mass >= SPLIT_MIN_MASS) splitCell(player, cell);
  }
}

function ejectFrom(player: Player, cell: Cell): void {
  cell.mass -= EJECT_MASS;
  cell.radius = radiusFor(cell.mass);
  const aim = direction(player.target.x - cell.x, player.target.y - cell.y);
  const x = cell.x + aim.x * (cell.radius + 8);
  const y = cell.y + aim.y * (cell.radius + 8);
  const color = cell.pigment;
  addFood({
    x,
    y,
    vx: cell.vx + aim.x * EJECT_SPEED,
    vy: cell.vy + aim.y * EJECT_SPEED,
    mass: 15 ** 2 / 27.04,
    radius: 15,
    color,
    ejecta: true,
    owner: player.id,
    variety: FoodVariety.Vesicle,
  });
  emit({ kind: EventKind.Spit, cellId: cell.id, predatorId: 0, x, y, color });
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
  survivor.pigment = blendPigment(survivor.pigment, absorbed.pigment, absorbed.mass / total);
  survivor.x = (survivor.x * survivor.mass + absorbed.x * absorbed.mass) / total;
  survivor.y = (survivor.y * survivor.mass + absorbed.y * absorbed.mass) / total;
  survivor.vx = (survivor.vx * survivor.mass + absorbed.vx * absorbed.mass) / total;
  survivor.vy = (survivor.vy * survivor.mass + absorbed.vy * absorbed.mass) / total;
  survivor.mass = total;
  survivor.radius = radiusFor(total);
}

function canRejoin(a: Cell, b: Cell): boolean {
  if (world.now < a.mergeAt || world.now < b.mergeAt) return false;
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + REJOIN_SLACK;
}

const REJOIN_SLACK = 8;

function rejoin(player: Player, a: Cell, b: Cell): void {
  a.digesting += b.digesting;
  absorbInto(a, b);
  emit({
    kind: EventKind.Merge,
    cellId: b.id,
    predatorId: a.id,
    x: a.x,
    y: a.y,
    color: playerColor(player, 0.82, 0.58),
  });
}

export function rejoinCells(player: Player): void {
  if (player.cells.length < 2) return;
  const sorted = [...player.cells].sort((a, b) => a.x - a.radius - (b.x - b.radius));
  const gone = new Set<Cell>();
  sorted.forEach((a, i) => {
    if (gone.has(a)) return;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b || b.x - b.radius > a.x + a.radius + REJOIN_SLACK) break;
      if (gone.has(b) || !canRejoin(a, b)) continue;
      rejoin(player, a, b);
      gone.add(b);
    }
  });
  if (gone.size) player.cells = player.cells.filter((cell) => !gone.has(cell));
}

const BURST_SPEED = 520;
const BURST_PIECES = 7;

const PINCH_SPEED = 70;
const CUT_CLEAR = 0.5;
const PINCH_COOLDOWN = 900;

function segmentArea(offset: number): number {
  const d = clamp(offset, -1, 1);
  return Math.acos(d) - d * Math.sqrt(1 - d * d);
}

export function segmentShare(radius: number, offset: number): number {
  return segmentArea(Math.abs(offset) / radius) / Math.PI;
}

function chordFor(share: number): number {
  let low = -1;
  let high = 1;
  for (let i = 0; i < 24; i += 1) {
    const middle = (low + high) / 2;
    if (segmentArea(middle) / Math.PI > share) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function segmentCentroid(offset: number): number {
  const area = segmentArea(offset);
  return area > 1e-6 ? (2 * Math.pow(1 - offset * offset, 1.5)) / (3 * area) : offset;
}

export function severCell(player: Player, cell: Cell, aim: Point, share: number, speed: number): void {
  const part = clamp(share, 0.05, 0.95);
  const mass = cell.mass * part;
  if (mass < SPLIT_MIN_MASS || cell.mass - mass < SPLIT_MIN_MASS) return;
  const line = chordFor(part) * cell.radius;
  const front = Math.max(segmentCentroid(line / cell.radius) * cell.radius, line + radiusFor(mass) * CUT_CLEAR);
  const back = Math.max(
    segmentCentroid(-line / cell.radius) * cell.radius,
    radiusFor(cell.mass - mass) * CUT_CLEAR - line,
  );
  const child = makeCell({
    x: cell.x + aim.x * front,
    y: cell.y + aim.y * front,
    mass,
    vx: cell.vx + aim.x * speed * (1 - part),
    vy: cell.vy + aim.y * speed * (1 - part),
    mergeAt: world.now + MERGE_DELAY,
    digesting: cell.digesting * part,
    pigment: cell.pigment,
  });
  cell.x -= aim.x * back;
  cell.y -= aim.y * back;
  cell.vx -= aim.x * speed * part;
  cell.vy -= aim.y * speed * part;
  cell.mass -= mass;
  cell.radius = radiusFor(cell.mass);
  cell.digesting *= 1 - part;
  cell.mergeAt = world.now + MERGE_DELAY;
  adoptPiece(player, cell, child);
}

const CUT_DEPTH = 0.78;
const CUT_TIME = 0.4;
const CUT_EASE = 2;
const CUT_SPAN = 0.75;
const CUT_MIN_RADIUS = radiusFor(SPLIT_MIN_MASS * 2);

export function cutAgainstObstacles(player: Player, cell: Cell, dt: number): void {
  if (cell.radius < CUT_MIN_RADIUS) return;
  const aim = aimFrom(player, cell);
  const cut = narrowContact(cell, cell.radius, cell.radius * CUT_SPAN, aim);
  if (!cut || cut.depth < cell.radius * CUT_DEPTH || aim.x * cut.nx + aim.y * cut.ny >= 0) {
    cell.strain = Math.max(0, cell.strain - dt * CUT_EASE);
    return;
  }
  cell.strain += dt;
  if (cell.strain < CUT_TIME || world.now - player.lastSplit < PINCH_COOLDOWN) return;
  cell.strain = 0;
  player.lastSplit = world.now;
  const across = { x: -aim.y, y: aim.x };
  const offset = (cell.x - cut.x) * across.x + (cell.y - cut.y) * across.y;
  const side = offset >= 0 ? -1 : 1;
  severCell(player, cell, { x: across.x * side, y: across.y * side }, segmentShare(cell.radius, offset), PINCH_SPEED);
}

export function chipCell(player: Player, cell: Cell, aim: Point, fraction: number): void {
  const mass = cell.mass * fraction;
  if (mass < SPLIT_MIN_MASS) return;
  cell.mass -= mass;
  cell.radius = radiusFor(cell.mass);
  launchPiece(player, cell, { aim, reach: 0.9, speed: CHIP_SPEED, mass });
}

export function burstCell(player: Player, cell: Cell): boolean {
  const pieces = Math.min(BURST_PIECES, Math.floor(cell.mass / SPLIT_MIN_MASS));
  if (pieces < 2) return false;
  const share = cell.mass / pieces;
  cell.mass = share;
  cell.radius = radiusFor(share);
  cell.digesting /= pieces;
  cell.mergeAt = world.now + MERGE_DELAY;
  const spin = Math.random() * Math.PI * 2;
  for (let i = 1; i < pieces; i += 1) {
    const angle = spin + (i / pieces) * Math.PI * 2;
    const aim = { x: Math.cos(angle), y: Math.sin(angle) };
    launchPiece(player, cell, { aim, reach: 1, speed: BURST_SPEED, mass: share });
  }
  return true;
}
