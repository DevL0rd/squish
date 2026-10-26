import { clamp, type Rgb } from '../../shared/math.ts';
import { EventKind, type WireEvent } from '../../shared/protocol.ts';
import { playSfx } from '../audio.ts';
import { colorForHue } from '../color.ts';
import { addSplat, isMine, shake, state, type CellVisual } from '../state.ts';
import { spawnBurst } from './decor.ts';
import { interiorFor, interiorTexture, newRecord, refreshFluidColor } from './interiors.ts';
import { MAX_SPLATS } from '../render/fluid.ts';

const MERGE_TIME = 0.34;

function localPoint(
  cell: CellVisual,
  event: { readonly x: number; readonly y: number },
  limit: number,
): [number, number] {
  const radius = Math.max(cell.radius, 1);
  return [clamp((event.x - cell.x) / radius, -limit, limit), clamp((event.y - cell.y) / radius, -limit, limit)];
}

function takeNearbyFood(event: WireEvent): number {
  for (const [id, food] of state.food) {
    if (Math.hypot(food.x - event.x, food.y - event.y) < 55) {
      state.food.delete(id);
      return food.radius;
    }
  }
  return 9;
}

function onEat(event: WireEvent): void {
  const foodRadius = takeNearbyFood(event);
  const cell = state.cells.get(event.cellId);
  addSplat({ x: event.x, y: event.y, radius: 52, color: event.color, strength: 0.09 });
  if (!cell) return;
  const [x, y] = localPoint(cell, event, 0.82);
  const size = clamp(foodRadius / Math.max(cell.radius, 1), 0.02, 0.32);
  interiorFor(cell).interior.addFood({ x, y, color: event.color, amount: 1.5, size, vx: x * 0.9, vy: y * 0.9 });
  spawnBurst(event.x, event.y, event.color, { count: 2, spread: 5, speed: 35, size: 3.4, life: [2.5, 6], front: 0 });
  if (isMine(cell)) shake(0.3);
  playSfx('eat', isMine(cell) ? 0.9 : 0.2);
}

function findChild(parent: CellVisual, event: WireEvent): CellVisual | undefined {
  const direct = state.cells.get(event.predatorId);
  if (direct) return direct;
  return [...state.cells.values()].find(
    (candidate) =>
      candidate.pid === parent.pid && Math.hypot(candidate.x - event.x, candidate.y - event.y) < candidate.radius * 2.4,
  );
}

function onSplit(event: WireEvent): void {
  const parent = state.cells.get(event.cellId);
  const child = parent ? findChild(parent, event) : undefined;
  if (!parent || !child || parent.id === child.id) return;
  const parentRecord = interiorFor(parent);
  const childRecord = interiorFor(child);
  const length = Math.hypot(child.x - parent.x, child.y - parent.y) || 1;
  const dir = { x: (child.x - parent.x) / length, y: (child.y - parent.y) / length };
  parentRecord.interior.splitTo(childRecord.interior, dir.x, dir.y);
  refreshFluidColor(parentRecord);
  refreshFluidColor(childRecord);
  parent.soft.forkTo(child.soft, parent, child, dir);
  interiorTexture(parentRecord);
  interiorTexture(childRecord);
  addSplat({ x: event.x, y: event.y, radius: Math.max(55, child.radius * 1.4), color: event.color, strength: 0.13 });
  spawnBurst(event.x, event.y, event.color, { count: 5, spread: 8, speed: 30, size: 3.5, life: [2.5, 6], front: 0.5 });
  if (!isMine(parent)) return;
  shake(1.2);
  playSfx('split', 1);
}

function startGhost(absorbed: CellVisual, survivor: CellVisual, spread: number): void {
  const record = state.interiors.get(absorbed.id) ?? newRecord(absorbed.id, colorForHue(absorbed.hue));
  state.interiors.delete(absorbed.id);
  state.cells.delete(absorbed.id);
  const [x, y] = localPoint(survivor, absorbed, 0.9);
  interiorFor(survivor).interior.mergeFrom(record.interior, x, y, 0.25, spread);
  state.mergeGhosts.push({
    survivorId: survivor.id,
    cell: absorbed,
    record,
    startX: absorbed.x,
    startY: absorbed.y,
    startRadius: absorbed.radius,
    life: MERGE_TIME,
    maxLife: MERGE_TIME,
    mergeTimer: 0,
  });
}

function onMerge(event: WireEvent): void {
  const absorbed = state.cells.get(event.cellId);
  const survivor = state.cells.get(event.predatorId);
  if (!absorbed || !survivor || absorbed.id === survivor.id) {
    addSplat({ x: event.x, y: event.y, radius: 80, color: event.color, strength: 0.16 });
    return;
  }
  const involvesMe = isMine(absorbed) || isMine(survivor);
  if (involvesMe) playSfx('merge', 1);
  startGhost(absorbed, survivor, clamp(absorbed.radius / Math.max(survivor.radius, 1), 0.1, 0.95));
  survivor.soft.kickBody(0.22);
  addSplat({ x: event.x, y: event.y, radius: Math.max(50, absorbed.radius * 1.4), color: event.color, strength: 0.14 });
  spawnBurst(event.x, event.y, event.color, { count: 7, spread: 9, speed: 35, size: 4, life: [2.5, 6], front: 0.5 });
  if (involvesMe) shake(1.2);
}

function tintNearestFood(event: WireEvent, color: Rgb): void {
  let nearest = null;
  let nearestDistance = 90;
  for (const food of state.food.values()) {
    const distance = Math.hypot(food.x - event.x, food.y - event.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = food;
    }
  }
  if (!nearest) return;
  nearest.color = color;
  nearest.ejecta = true;
}

function onSpit(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  const record = interiorFor(cell);
  record.interior.drain(0.045);
  const color = refreshFluidColor(record);
  cell.soft.kickBody(0.06);
  tintNearestFood(event, color);
  state.spitTints.push({ x: event.x, y: event.y, color, life: 2.2 });
  addSplat({ x: event.x, y: event.y, radius: 42, color, strength: 0.1 });
  spawnBurst(event.x, event.y, color, { count: 3, spread: 6, speed: 25, size: 3, life: [2, 5], front: 0 });
  if (!isMine(cell)) return;
  playSfx('spit', 1);
  shake(0.45);
}

function onCreatureEaten(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  const record = interiorFor(cell);
  const [x, y] = localPoint(cell, event, 0.72);
  record.interior.addFood({ x, y, color: event.color, amount: 3, size: 0.2, vx: x * 0.9, vy: y * 0.9 });
  record.interior.addDye(x, y, event.color, 0.09);
  addSplat({ x: event.x, y: event.y, radius: 58, color: event.color, strength: 0.08 });
  if (!isMine(cell)) return;
  playSfx('eat', 1);
  shake(0.7);
}

const handlers: Readonly<Record<number, (event: WireEvent) => void>> = {
  [EventKind.Eat]: onEat,
  [EventKind.Split]: onSplit,
  [EventKind.Merge]: onMerge,
  [EventKind.Spit]: onSpit,
};

export function processEvent(event: WireEvent): void {
  const creature = event.kind >= EventKind.CreatureFirst && event.kind <= EventKind.CreatureLast;
  const handler = creature ? onCreatureEaten : handlers[event.kind];
  handler?.(event);
  if (state.splats.length > MAX_SPLATS) state.splats = state.splats.slice(-MAX_SPLATS);
}
