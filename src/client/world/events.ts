import { ATTACKS, EventKind, Infection, INFECTIONS, type WireEvent } from '../../shared/protocol.ts';
import { playSfx } from '../audio.ts';
import { startInjection } from './injections.ts';
import { onAttack, onHit, onSpine, onToxin } from './combat-events.ts';
import type { CellVisual } from '../cell/cell.ts';
import { MAX_SPLATS } from '../render/fluid.ts';
import { showStatus } from '../dom.ts';
import { addEffect } from '../ui/effects.ts';
import { creatureName, foodName, recordMeal } from '../ui/meals.ts';
import { addSplat, isMine, shake, state, type CreatureVisual } from '../state.ts';
import { spawnBurst } from './decor.ts';
import { rememberStrike } from './strike.ts';
import { finishDivision, startDivision } from './division.ts';
import { fuseCells } from './fusion.ts';
import { toLocal } from '../cell/cell.ts';
import { OrganelleKind } from '../cell/organelles.ts';
import type { Rgb } from '../../shared/math.ts';
import { removeCell } from './textures.ts';

const CREATURE_SIZE = 12;

const SWALLOW_TIME = 1.1;

function takeNearbyFood(event: WireEvent): Meal {
  for (const [id, food] of state.food) {
    if (Math.hypot(food.x - event.x, food.y - event.y) < 55) {
      state.food.delete(id);
      return food;
    }
  }
  return { x: event.x, y: event.y, radius: 6, phase: Math.random() * 10, variety: 0 };
}

interface Meal {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly phase: number;
  readonly variety: number;
}

function swallow(cell: CellVisual, at: Meal, radius: number, color: Rgb): void {
  const item = cell.organelles.make(OrganelleKind.Food, toLocal(cell, at), radius, color, 10 + Math.random() * 5);
  item.phase = at.phase;
  item.variety = at.variety;
  item.cup = { x: at.x, y: at.y, radius, life: SWALLOW_TIME, duration: SWALLOW_TIME };
  cell.membrane.cups.push(item.cup);
}

function onEat(event: WireEvent): void {
  const food = takeNearbyFood(event);
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  swallow(cell, food, food.radius, event.color);
  if (isMine(cell)) {
    recordMeal({ name: foodName(food.variety), color: event.color, amount: event.amount, bonus: event.bonus });
  }
  spawnBurst(event.x, event.y, event.color, { count: 2, spread: 4, speed: 18, size: 2.4, life: [2, 5], front: 0 });
  if (isMine(cell)) shake(0.25);
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
  finishDivision(parent);
  startDivision(parent, child);
  addSplat({ x: event.x, y: event.y, radius: Math.max(55, child.radius * 1.4), color: event.color, strength: 0.1 });
  if (!isMine(parent)) return;
  shake(1);
  playSfx('split', 1);
}

function onMerge(event: WireEvent): void {
  const absorbed = state.cells.get(event.cellId);
  const survivor = state.cells.get(event.predatorId);
  if (!absorbed || !survivor || absorbed.id === survivor.id) {
    addSplat({ x: event.x, y: event.y, radius: 80, color: event.color, strength: 0.16 });
    return;
  }
  finishDivision(absorbed);
  finishDivision(survivor);
  const involvesMe = isMine(absorbed) || isMine(survivor);
  if (isMine(survivor) && !isMine(absorbed)) {
    recordMeal({ name: absorbed.name, color: absorbed.fluidColor, amount: absorbed.mass, bonus: 1 }, 0);
  }
  fuseCells(survivor, absorbed);
  removeCell(absorbed.id);
  addSplat({ x: event.x, y: event.y, radius: Math.max(50, absorbed.radius * 1.4), color: event.color, strength: 0.14 });
  if (!involvesMe) return;
  playSfx('merge', 1);
  shake(1.2);
}

function onSpit(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  cell.interior.drain(0.045);
  const color = cell.interior.averageColor();
  cell.membrane.cups.push({ x: event.x, y: event.y, radius: 10, life: 0.35, duration: 0.35 });
  let nearest = null;
  let nearestDistance = 90;
  for (const food of state.food.values()) {
    const distance = Math.hypot(food.x - event.x, food.y - event.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = food;
    }
  }
  if (nearest) Object.assign(nearest, { color, ejecta: true });
  state.spitTints.push({ x: event.x, y: event.y, color, life: 2.2 });
  addSplat({ x: event.x, y: event.y, radius: 42, color, strength: 0.1 });
  if (!isMine(cell)) return;
  playSfx('spit', 1);
  shake(0.45);
}

function takeNearbyCreature(event: WireEvent): CreatureVisual | undefined {
  let nearest: CreatureVisual | undefined;
  let best = 80;
  for (const creature of state.creatures.values()) {
    const distance = Math.hypot(creature.x - event.x, creature.y - event.y);
    if (distance < best) {
      best = distance;
      nearest = creature;
    }
  }
  if (nearest) state.creatures.delete(nearest.id);
  return nearest;
}

function onCreatureEaten(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  const creature = takeNearbyCreature(event);
  const kind = event.kind - EventKind.CreatureFirst;
  if (isMine(cell)) {
    const meal = { name: creatureName(kind), color: event.color, amount: event.amount, bonus: event.bonus };
    recordMeal(meal, 2.4);
  }
  const at = creature ?? { x: event.x, y: event.y, radius: CREATURE_SIZE, phase: 0, angle: 0 };
  const item = cell.organelles.make(
    OrganelleKind.Creature,
    toLocal(cell, at),
    at.radius,
    event.color,
    9 + Math.random() * 4,
  );
  Object.assign(item, { variety: kind, angle: at.angle, phase: at.phase });
  item.cup = { x: at.x, y: at.y, radius: at.radius, life: SWALLOW_TIME, duration: SWALLOW_TIME };
  cell.membrane.cups.push(item.cup);
  addSplat({ x: event.x, y: event.y, radius: 58, color: event.color, strength: 0.08 });
  if (!isMine(cell)) return;
  playSfx('eat', 1);
  shake(0.6);
}

function onInfection(event: WireEvent): void {
  const type = event.kind - EventKind.InfectionFirst;
  const info = INFECTIONS[type];
  const cell = state.cells.get(event.cellId);
  if (!info || !cell) return;
  const parasite = type === Infection.Parasite;
  const count = parasite ? 1 : 9;
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const at = { x: Math.cos(angle) * cell.radius * 0.6, y: Math.sin(angle) * cell.radius * 0.6 };
    const kind = parasite ? OrganelleKind.Parasite : OrganelleKind.Phage;
    cell.organelles.make(kind, at, parasite ? 7 : 2.6, event.color, info.duration);
  }
  if (!isMine(cell)) return;
  addEffect(type);
  showStatus(info.label, 3200);
  playSfx(info.good ? 'merge' : 'spit', 0.7);
  shake(0.5);
}

function onPop(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  addSplat({ x: event.x, y: event.y, radius: 120, color: event.color, strength: 0.22 });
  spawnBurst(event.x, event.y, event.color, { count: 14, spread: 14, speed: 90, size: 4, life: [2, 5], front: 0.6 });
  if (!cell || !isMine(cell)) return;
  recordMeal({ name: 'virus', color: event.color, amount: event.amount, bonus: 1 }, 0);
  showStatus('a virus burst your membrane', 2600);
  playSfx('death', 0.6);
  shake(2.2);
}

function onBurst(event: WireEvent): void {
  addSplat({ x: event.x, y: event.y, radius: 60, color: event.color, strength: 0.12 });
  spawnBurst(event.x, event.y, event.color, { count: 10, spread: 10, speed: 60, size: 3, life: [1.5, 4], front: 0.5 });
}

function onPipette(event: WireEvent): void {
  const gift = event.bonus > 0.5;
  rememberStrike(event.color, gift);
  const cell = state.cells.get(event.cellId);
  addSplat({ x: event.x, y: event.y, radius: 140, color: event.color, strength: 0.25 });
  if (!cell) return;
  if (gift) cell.interior.addDye(0, 0, event.color, 1.4);
  else cell.interior.drain(0.6);
  if (!isMine(cell)) return;
  recordMeal(
    {
      name: gift ? 'pipette injection' : 'pipette drew',
      color: event.color,
      amount: gift ? event.amount : -event.amount,
      bonus: 1,
    },
    0,
  );
  showStatus(
    gift
      ? `The pipette injected ${event.amount.toFixed(0)} µg into you`
      : `The pipette drew out ${event.amount.toFixed(0)} µg of you`,
    3600,
  );
  playSfx(gift ? 'merge' : 'death', 1);
  shake(gift ? 1 : 3);
}

function onSwallowed(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell || !isMine(cell)) return;
  showStatus('Swallowed! Split to tear your way out', 4200);
  playSfx('death', 0.8);
  shake(2.4);
}

function onBoost(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  const length = Math.hypot(cell.x - event.x, cell.y - event.y) || 1;
  const back = { x: (event.x - cell.x) / length, y: (event.y - cell.y) / length };
  const color = cell.interior.averageColor();
  for (let i = 0; i < 6; i += 1) {
    const reach = event.amount * (0.2 + i * 0.55);
    addSplat({
      x: event.x + back.x * reach,
      y: event.y + back.y * reach,
      radius: event.amount * (0.9 + i * 0.25),
      color,
      strength: 0.5 - i * 0.06,
    });
  }
  spawnBurst(event.x, event.y, color, {
    count: 18,
    spread: event.amount * 0.4,
    speed: 140,
    size: 4,
    life: [1.5, 4],
    front: 0.5,
  });
  cell.interior.drain(0.05);
  if (!isMine(cell)) return;
  playSfx('boost', 1);
  shake(1.6);
}

const INJECT_DELAY = 1800;

function onLevelUp(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  startInjection(cell.id, event.color);
  window.setTimeout(() => {
    if (!state.cells.has(cell.id)) return;
    cell.interior.addDye(0, 0, event.color, 1.2);
    cell.interior.addVortex(0.15, 0, 0.35, 2.4);
    cell.interior.addVortex(-0.15, 0, 0.35, -2.4);
    addSplat({ x: cell.center.x, y: cell.center.y, radius: cell.radius * 1.6, color: event.color, strength: 0.18 });
    spawnBurst(cell.center.x, cell.center.y, event.color, {
      count: 22,
      spread: cell.radius,
      speed: 120,
      size: 3,
      life: [1.5, 3.5],
      front: 0.4,
    });
  }, INJECT_DELAY);
  if (!isMine(cell)) return;
  const level = Math.round(event.amount);
  showStatus(`Level ${String(level)} · new DNA: ${ATTACKS[level - 1] ?? ''}`, 4200);
  playSfx('level', 1);
  shake(1.2);
}

function handlerFor(kind: number): ((event: WireEvent) => void) | undefined {
  if (kind >= EventKind.CreatureFirst && kind <= EventKind.CreatureLast) return onCreatureEaten;
  if (kind >= EventKind.InfectionFirst && kind <= EventKind.InfectionLast) return onInfection;
  return handlers[kind];
}

const handlers: Readonly<Record<number, (event: WireEvent) => void>> = {
  [EventKind.Eat]: onEat,
  [EventKind.Split]: onSplit,
  [EventKind.Merge]: onMerge,
  [EventKind.Spit]: onSpit,
  [EventKind.Pop]: onPop,
  [EventKind.Burst]: onBurst,
  [EventKind.Pipette]: onPipette,
  [EventKind.Swallowed]: onSwallowed,
  [EventKind.Boost]: onBoost,
  [EventKind.LevelUp]: onLevelUp,
  [EventKind.Attack]: onAttack,
  [EventKind.Hit]: onHit,
  [EventKind.Toxin]: onToxin,
  [EventKind.Spine]: onSpine,
};

export function processEvent(event: WireEvent): void {
  handlerFor(event.kind)?.(event);
  if (state.splats.length > MAX_SPLATS) state.splats = state.splats.slice(-MAX_SPLATS);
}
