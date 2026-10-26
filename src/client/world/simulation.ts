import { lerp } from '../../shared/math.ts';
import { stepInterior, stepMembrane } from '../cell/cell.ts';
import { contactPlanes } from '../cell/contacts.ts';
import { growStep, inView, state } from '../state.ts';
import { updateCamera } from './camera.ts';
import { maintainDecor } from './decor.ts';
import { cleaveOf, divisionPairs, holdsRadius, isHidden, updateDivisions } from './division.ts';
import { driftObstacles, obstaclePlanes } from './obstacles.ts';
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

function stepMembranes(dt: number): void {
  const cells = [...state.cells.values()].filter((cell) => !isHidden(cell));
  const planes = contactPlanes(cells, divisionPairs());
  for (const cell of cells) {
    const own = [...(planes.get(cell) ?? []), ...obstaclePlanes(cell, cell.radius)];
    stepMembrane(cell, dt, own, cleaveOf(cell));
  }
  updateDivisions(state.cells);
}

function stepInteriors(dt: number): void {
  for (const cell of state.cells.values()) {
    if (isHidden(cell) || (!inView(cell, 0.75, cell.radius * 3) && cell.pid !== state.me)) continue;
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
  updateCamera(dt);
}
