import { radiusFor } from '../../shared/math.ts';
import type { CreaturePacket, FoodPacket, Snapshot, WireCell } from '../../shared/protocol.ts';
import { type CellVisual, createCellVisual } from '../cell/cell.ts';
import { freshSpawn, state } from '../state.ts';
import { creatureStateSound } from '../voices.ts';
import { processEvent } from './events.ts';
import { removeCell } from './textures.ts';

const CELL_TIMEOUT = 850;
const FOOD_TIMEOUT = 2400;

const UNKNOWN = { hue: 168, name: 'organism', bot: false };

function identity(pid: number, fallback?: CellVisual): { hue: number; name: string; bot: boolean } {
  const source = state.roster.get(pid) ?? fallback ?? UNKNOWN;
  return { hue: source.hue, name: source.name, bot: source.bot };
}

const TELEPORT = 1500;

function teleported(cell: WireCell, pid: number): void {
  const visual = state.cells.get(cell.id);
  if (!visual || pid !== state.me) return;
  const dx = cell.x - visual.tx;
  const dy = cell.y - visual.ty;
  if (Math.hypot(dx, dy) < TELEPORT) return;
  removeCell(cell.id);
  state.camera.x += dx;
  state.camera.y += dy;
  state.target.x += dx;
  state.target.y += dy;
}

function syncCell(cell: WireCell, pid: number, now: number): void {
  teleported(cell, pid);
  const visual = state.cells.get(cell.id) ?? createCellVisual(cell, pid, identity(pid), now);
  state.cells.set(cell.id, visual);
  Object.assign(visual, identity(pid, visual), { pid, vx: cell.vx, vy: cell.vy, mass: cell.mass, lastSeen: now });
  visual.targetRadius = radiusFor(cell.mass);
  visual.tx = cell.x + cell.vx * 0.055;
  visual.ty = cell.y + cell.vy * 0.055;
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
      angle: creature.angle,
      targetAngle: creature.angle,
      stateSince: performance.now(),
      grow: freshSpawn(creature) ? 0 : 1,
    };
    if (creature.state !== visual.state) {
      visual.stateSince = performance.now();
      creatureStateSound(visual, creature.state);
    }
    state.creatures.set(creature.id, visual);
    Object.assign(visual, {
      tx: creature.x,
      ty: creature.y,
      radius: creature.radius,
      kind: creature.kind,
      color: creature.color,
      targetAngle: creature.angle,
      phase: creature.phase,
      state: creature.state,
    });
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
      grow: freshSpawn(food) ? 0 : 1,
      alpha: 0,
      targetAlpha: 1,
      lastSeen: now,
      phase: Math.random() * 10,
    };
    state.food.set(food.id, visual);
    Object.assign(visual, {
      tx: food.x,
      ty: food.y,
      targetRadius: food.radius,
      color: food.color,
      ejecta: food.ejecta,
      variety: food.variety,
    });
    visual.targetAlpha = 1;
    visual.lastSeen = now;
  }
  for (const [id, food] of state.food) {
    if (seen.has(id)) continue;
    food.targetAlpha = 0;
    if (now - food.lastSeen > FOOD_TIMEOUT || food.alpha < 0.01) state.food.delete(id);
  }
}
