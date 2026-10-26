import { lerp } from '../../shared/math.ts';
import { carryMembrane, stepInterior, stepMembrane, type CellVisual } from '../cell/cell.ts';
import { contactPlanes } from '../cell/contacts.ts';
import { canvas } from '../dom.ts';
import { growStep, inView, state } from '../state.ts';
import { updateCamera } from './camera.ts';
import { maintainDecor } from './decor.ts';
import { updateParallax } from './parallax.ts';
import { cleaveOf, divisionPairs, holdsRadius, isHidden, updateDivisions } from './division.ts';
import { pinchOf, type Round } from '../cell/membrane-limits.ts';
import { driftObstacles, obstacleWalls } from './obstacles.ts';
import { uploadInterior } from './textures.ts';

function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-dt * rate);
}

function moveCells(dt: number): void {
  for (const cell of state.cells.values()) {
    cell.x = lerp(cell.x, cell.tx, ease(10.5, dt));
    cell.y = lerp(cell.y, cell.ty, ease(10.5, dt));
    if (!holdsRadius(cell)) cell.radius = lerp(cell.radius, cell.targetRadius, ease(2.5, dt));
  }
}

function moveCreatures(dt: number): void {
  for (const creature of state.creatures.values()) {
    creature.x = lerp(creature.x, creature.tx, ease(9, dt));
    creature.y = lerp(creature.y, creature.ty, ease(9, dt));
    const diff = Math.atan2(
      Math.sin(creature.targetAngle - creature.angle),
      Math.cos(creature.targetAngle - creature.angle),
    );
    creature.angle += diff * ease(5, dt);
    creature.grow = growStep(creature.grow, dt);
  }
}

function active(cell: CellVisual): boolean {
  return cell.pid === state.me || inView(cell, 0.75, cell.radius * 3);
}

const RIGID_PIXELS = 5;
const COARSE_PIXELS = 18;
const FLUID_PIXELS = 14;

function pixels(cell: CellVisual): number {
  return (cell.radius * canvas.clientWidth) / Math.max(state.camera.width, 1);
}

const PINCH_COOLDOWN = 1000;
const pinches: { cell: number; x: number; y: number; share: number }[] = [];
let lastPinch = 0;

function notePinch(cell: CellVisual): void {
  const now = performance.now();
  if (now - lastPinch < PINCH_COOLDOWN || cleaveOf(cell)) return;
  const pinch = pinchOf(cell.membrane);
  if (!pinch) return;
  lastPinch = now;
  pinches.push({ cell: cell.id, ...pinch });
}

export function takePinches(): { cell: number; x: number; y: number; share: number }[] {
  return pinches.splice(0, pinches.length);
}

function stepMembranes(dt: number): void {
  const cells: CellVisual[] = [];
  for (const cell of state.cells.values()) {
    if (isHidden(cell)) continue;
    const dividing = cleaveOf(cell) !== null;
    if (dividing || (active(cell) && pixels(cell) >= RIGID_PIXELS)) cells.push(cell);
    else carryMembrane(cell);
  }
  stepActive(cells, dt);
  updateDivisions(state.cells);
}

const EDIBLE_RATIO = 1.35;

function roundsNear(cell: CellVisual): Round[] {
  const rounds: Round[] = [];
  const blocks = (item: { x: number; y: number; radius: number }): boolean =>
    item.radius * EDIBLE_RATIO >= cell.radius &&
    Math.hypot(item.x - cell.x, item.y - cell.y) < cell.radius * 1.5 + item.radius;
  for (const item of state.food.values()) if (blocks(item)) rounds.push(item);
  for (const item of state.creatures.values()) if (blocks(item)) rounds.push(item);
  return rounds;
}

function stepActive(cells: readonly CellVisual[], dt: number): void {
  const planes = contactPlanes(cells, divisionPairs());
  for (const cell of cells) {
    const walls = obstacleWalls(cell, cell.radius);
    const substeps = pixels(cell) < COARSE_PIXELS ? 1 : 3;
    const rounds = roundsNear(cell);
    stepMembrane(cell, dt, { planes: planes.get(cell) ?? [], walls, rounds, cleave: cleaveOf(cell), substeps });
    if ((walls.length || rounds.length) && cell.pid === state.me) notePinch(cell);
  }
}

function stepInteriors(dt: number): void {
  for (const cell of state.cells.values()) {
    if (isHidden(cell) || !active(cell) || pixels(cell) < FLUID_PIXELS) continue;
    if (stepInterior(cell, dt)) uploadInterior(cell);
  }
}

function fadeSpitTints(dt: number): void {
  state.spitTints = state.spitTints.filter((tint) => {
    tint.life -= dt;
    if (tint.life <= 0) return false;
    for (const food of state.food.values()) {
      if (food.ejecta && Math.hypot(food.x - tint.x, food.y - tint.y) < 130) food.color = tint.color;
    }
    return true;
  });
}

function moveFood(dt: number): void {
  for (const food of state.food.values()) {
    food.x = lerp(food.x, food.tx, ease(8, dt));
    food.y = lerp(food.y, food.ty, ease(8, dt));
    food.radius = lerp(food.radius, food.targetRadius, ease(7, dt));
    food.alpha = lerp(food.alpha, food.targetAlpha, ease(8, dt));
    food.grow = growStep(food.grow, dt);
  }
}

export function updateSimulation(dt: number): void {
  moveCells(dt);
  driftObstacles(dt);
  moveCreatures(dt);
  stepMembranes(dt);
  stepInteriors(dt);
  fadeSpitTints(dt);
  moveFood(dt);
  maintainDecor(dt);
  updateParallax(dt);
  updateCamera(dt);
}
