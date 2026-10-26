import { clamp, lerp, smoothstep } from '../../shared/math.ts';
import { mixColor } from '../color.ts';
import { sampleClientFlow } from '../render/flow-field.ts';
import { inView, state, type CellVisual, type InteriorRecord, type MergeGhost } from '../state.ts';
import { updateCamera } from './camera.ts';
import { maintainDecor } from './decor.ts';
import { interiorFor, interiorTexture, refreshFluidColor, releaseRecord } from './interiors.ts';

const INTERIOR_TIMEOUT = 14000;

function ease(rate: number, dt: number): number {
  return 1 - Math.exp(-dt * rate);
}

function predictOwnCell(cell: CellVisual, dt: number): void {
  const dx = state.target.x - cell.tx;
  const dy = state.target.y - cell.ty;
  const distance = Math.hypot(dx, dy);
  if (distance <= 2) return;
  const step = Math.min(distance, Math.max(120, Math.hypot(cell.vx, cell.vy) * 1.05) * dt);
  cell.tx += (dx / distance) * step;
  cell.ty += (dy / distance) * step;
}

function moveCells(dt: number, now: number): void {
  const steering = state.joined && !state.dead && state.targetReady;
  for (const cell of state.cells.values()) {
    if (steering && cell.pid === state.me) predictOwnCell(cell, dt);
    cell.x = lerp(cell.x, cell.tx, ease(10.5, dt));
    cell.y = lerp(cell.y, cell.ty, ease(10.5, dt));
    cell.radius = lerp(cell.radius, cell.targetRadius, ease(6.2, dt));
    const record = state.interiors.get(cell.id);
    if (record) record.lastSeen = now;
  }
}

function moveCreatures(dt: number): void {
  for (const creature of state.creatures.values()) {
    creature.x = lerp(creature.x, creature.tx, ease(9, dt));
    creature.y = lerp(creature.y, creature.ty, ease(9, dt));
    let diff = creature.targetAngle - creature.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    creature.angle += diff * ease(5, dt);
  }
}

function deformMembranes(dt: number): void {
  const cells = [...state.cells.values()];
  for (const cell of cells) {
    const neighbors = cells.filter(
      (other) => other !== cell && Math.hypot(other.x - cell.x, other.y - cell.y) < (cell.radius + other.radius) * 1.35,
    );
    cell.soft.update(dt, cell, neighbors, sampleClientFlow);
  }
}

function stepInterior(record: InteriorRecord, cell: CellVisual, dt: number): void {
  const simulated = record.interior.step(dt, cell);
  if (simulated || record.interior.dirty) interiorTexture(record);
  record.colorTimer += dt;
  if (record.colorTimer <= 0.18) return;
  const average = record.interior.averageColor();
  record.fluidColor = mixColor(record.fluidColor ?? average, average, 0.25);
  record.colorTimer = 0;
}

function simulateInteriors(dt: number, now: number): void {
  for (const cell of state.cells.values()) {
    const visible = inView(cell, 0.75, cell.radius * 3);
    if (visible || cell.pid === state.me) stepInterior(interiorFor(cell), cell, dt);
  }
  for (const [id, record] of state.interiors) {
    if (now - record.lastSeen <= INTERIOR_TIMEOUT) continue;
    releaseRecord(record);
    state.interiors.delete(id);
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
  }
}

function advanceGhost(ghost: MergeGhost, survivor: CellVisual, dt: number): boolean {
  ghost.life -= dt;
  const progress = smoothstep(clamp(1 - ghost.life / ghost.maxLife, 0, 1));
  const { cell, record } = ghost;
  cell.x = lerp(ghost.startX, survivor.x, progress);
  cell.y = lerp(ghost.startY, survivor.y, progress);
  cell.radius = lerp(ghost.startRadius, survivor.radius * 0.28, progress);
  cell.vx = survivor.vx;
  cell.vy = survivor.vy;
  cell.soft.update(dt, cell, [], sampleClientFlow);
  const simulated = record.interior.step(dt, cell);
  if (record.texture && (simulated || record.interior.dirty)) interiorTexture(record);
  record.colorTimer += dt;
  if (record.colorTimer > 0.16) {
    refreshFluidColor(record);
    record.colorTimer = 0;
  }
  const host = interiorFor(survivor);
  const spread = clamp(ghost.startRadius / Math.max(survivor.radius, 1), 0.1, 0.95);
  const scale = Math.max(survivor.radius, 1);
  ghost.mergeTimer += dt;
  if (ghost.mergeTimer > 0.09) {
    host.interior.mergeFrom(
      record.interior,
      (cell.x - survivor.x) / scale,
      (cell.y - survivor.y) / scale,
      0.12,
      spread,
    );
    ghost.mergeTimer = 0;
  }
  if (ghost.life > 0) return true;
  host.interior.mergeFrom(record.interior, 0, 0, 1.1, spread);
  host.interior.transferFoodFrom(record.interior, 0, 0, spread);
  refreshFluidColor(host);
  interiorTexture(host);
  return false;
}

function updateMergeGhosts(dt: number): void {
  state.mergeGhosts = state.mergeGhosts.filter((ghost) => {
    const survivor = state.cells.get(ghost.survivorId);
    const alive = survivor ? advanceGhost(ghost, survivor, dt) : false;
    if (!alive) releaseRecord(ghost.record);
    return alive;
  });
}

export function updateSimulation(dt: number): void {
  const now = performance.now();
  moveCells(dt, now);
  moveCreatures(dt);
  deformMembranes(dt);
  simulateInteriors(dt, now);
  fadeSpitTints(dt);
  moveFood(dt);
  updateMergeGhosts(dt);
  maintainDecor(dt);
  updateCamera(dt);
}
