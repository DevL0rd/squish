import { radiusFor } from '../../shared/math.ts';
import type { CreaturePacket, FoodPacket, Snapshot, WireCell } from '../../shared/protocol.ts';
import { hexSeed } from '../color.ts';
import { coarsePointer } from '../dom.ts';
import { SoftBody } from '../softbody/softbody.ts';
import { state, type CellVisual } from '../state.ts';
import { processEvent } from './events.ts';
import { removeCell } from './interiors.ts';

const RING_COUNT = coarsePointer ? 48 : 64;
const CELL_TIMEOUT = 850;
const FOOD_TIMEOUT = 2400;

function createCell(cell: WireCell, pid: number, now: number): CellVisual {
  const meta = state.roster.get(pid);
  const radius = radiusFor(cell.mass);
  const soft = new SoftBody(RING_COUNT, hexSeed(cell.id * 1013 + 71));
  soft.reset(cell.x, cell.y, radius);
  return {
    id: cell.id,
    pid,
    x: cell.x,
    y: cell.y,
    tx: cell.x,
    ty: cell.y,
    vx: cell.vx,
    vy: cell.vy,
    mass: cell.mass,
    radius,
    targetRadius: radius,
    hue: meta?.hue ?? 168,
    name: meta?.name ?? 'organism',
    bot: meta?.bot ?? false,
    lastSeen: now,
    mergeReady: cell.mergeReady,
    soft,
  };
}

function correctTarget(visual: CellVisual, cell: WireCell): void {
  if (visual.pid === state.me && state.joined && !state.dead) {
    const errorX = cell.x - visual.tx;
    const errorY = cell.y - visual.ty;
    if (Math.hypot(errorX, errorY) > 140) {
      visual.tx += errorX * 0.45;
      visual.ty += errorY * 0.45;
    }
    return;
  }
  visual.tx = cell.x + cell.vx * 0.055;
  visual.ty = cell.y + cell.vy * 0.055;
}

function syncCell(cell: WireCell, pid: number, now: number): void {
  const visual = state.cells.get(cell.id) ?? createCell(cell, pid, now);
  state.cells.set(cell.id, visual);
  const meta = state.roster.get(pid);
  visual.pid = pid;
  correctTarget(visual, cell);
  visual.vx = cell.vx;
  visual.vy = cell.vy;
  visual.mass = cell.mass;
  visual.targetRadius = radiusFor(cell.mass);
  visual.hue = meta?.hue ?? visual.hue;
  visual.name = meta?.name ?? visual.name;
  visual.bot = meta?.bot ?? visual.bot;
  visual.lastSeen = now;
  visual.mergeReady = cell.mergeReady;
  if (pid !== state.me || state.targetReady) return;
  state.target.x = cell.x;
  state.target.y = cell.y;
  state.targetReady = true;
  state.camera.x = cell.x;
  state.camera.y = cell.y;
}

export function processSnapshot(snapshot: Snapshot): void {
  const now = performance.now();
  const seen = new Set<number>();
  for (const player of snapshot.players) {
    for (const cell of player.cells) {
      seen.add(cell.id);
      syncCell(cell, player.id, now);
    }
  }
  for (const [id, cell] of state.cells) {
    if (!seen.has(id) && now - cell.lastSeen > CELL_TIMEOUT) removeCell(id);
  }
  for (const event of snapshot.events) processEvent(event);
}

export function processCreatures(packet: CreaturePacket): void {
  const seen = new Set<number>();
  for (const creature of packet.creatures) {
    seen.add(creature.id);
    const visual = state.creatures.get(creature.id) ?? {
      ...creature,
      tx: creature.x,
      ty: creature.y,
      angle: 0,
      targetAngle: creature.angle,
    };
    state.creatures.set(creature.id, visual);
    visual.tx = creature.x;
    visual.ty = creature.y;
    visual.radius = creature.radius;
    visual.kind = creature.kind;
    visual.color = creature.color;
    visual.targetAngle = creature.angle;
    visual.phase = creature.phase;
  }
  for (const id of state.creatures.keys()) {
    if (!seen.has(id)) state.creatures.delete(id);
  }
}

export function processFood(packet: FoodPacket): void {
  const now = performance.now();
  const seen = new Set<number>();
  for (const food of packet.food) {
    seen.add(food.id);
    const visual = state.food.get(food.id) ?? {
      ...food,
      tx: food.x,
      ty: food.y,
      targetRadius: food.radius,
      alpha: 0,
      targetAlpha: 1,
      lastSeen: now,
      phase: Math.random() * 10,
    };
    state.food.set(food.id, visual);
    visual.tx = food.x;
    visual.ty = food.y;
    visual.targetRadius = food.radius;
    visual.color = food.color;
    visual.ejecta = food.ejecta;
    visual.targetAlpha = 1;
    visual.lastSeen = now;
  }
  for (const [id, food] of state.food) {
    if (seen.has(id)) continue;
    food.targetAlpha = 0;
    if (now - food.lastSeen > FOOD_TIMEOUT || food.alpha < 0.01) state.food.delete(id);
  }
}
