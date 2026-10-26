import { blend, bindTexture, gl } from '../gl/context.ts';
import { InstanceBatch } from '../gl/instances.ts';
import type { ShaderProgram } from '../gl/program.ts';
import { programs } from '../gl/programs.ts';
import { screenTargets } from '../gl/screen.ts';
import { vividColor } from '../color.ts';
import { inView, state } from '../state.ts';
import { bubbles, debris } from '../world/decor.ts';
import { cellFluidColor } from '../world/interiors.ts';
import { setScreen, setView } from './view.ts';

const shadows = new InstanceBatch(2, 1024);
const halos = new InstanceBatch(2, 1024);
const food = new InstanceBatch(2, 2048);
const bubbleBatch = new InstanceBatch(1, 128);
const debrisBatch = new InstanceBatch(2, 512);
const creatures = new InstanceBatch(3, 128);

function flush(batch: InstanceBatch, program: ShaderProgram, additive: boolean): void {
  if (!batch.count) return;
  if (additive) blend(gl.ONE, gl.ONE);
  else blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  setView(program);
  batch.draw();
  gl.disable(gl.BLEND);
}

export function drawShadows(): void {
  shadows.begin();
  for (const cell of state.cells.values()) {
    if (!inView(cell, 0.75, cell.radius * 2)) continue;
    if (!shadows.add([cell.x, cell.y, cell.radius * 1.7, 1, 0, 0, 0, 1])) break;
  }
  flush(shadows, programs.shadow, false);
}

export function drawHalos(): void {
  halos.begin();
  for (const cell of state.cells.values()) {
    if (!inView(cell, 0.75, cell.radius * 2)) continue;
    const color = vividColor(cellFluidColor(cell));
    if (!halos.add([cell.x, cell.y, cell.radius * 2, 0.34, color[0], color[1], color[2], 0.3])) break;
  }
  flush(halos, programs.halo, true);
}

export function drawCreatures(time: number): void {
  creatures.begin();
  for (const creature of state.creatures.values()) {
    if (!inView(creature, 0.62, 60)) continue;
    const { x, y, radius, kind, color, angle, phase } = creature;
    if (!creatures.add([x, y, radius * 2.1, kind, color[0], color[1], color[2], angle, phase + time, 0, 0, 0])) break;
  }
  flush(creatures, programs.creature, false);
}

export function drawFood(time: number): void {
  food.begin();
  for (const item of state.food.values()) {
    if (item.alpha < 0.015 || !inView(item, 0.65, 80)) continue;
    const { color } = item;
    if (!food.add([item.x, item.y, item.radius * 2.1, item.phase, color[0], color[1], color[2], 1])) break;
  }
  programs.food.use().float('uTime', time);
  flush(food, programs.food, false);
}

export function drawDebris(front: boolean, time: number): void {
  debrisBatch.begin();
  for (const particle of debris) {
    if (particle.front !== front || !inView(particle, 0.7, 100)) continue;
    const { color } = particle;
    const values = [particle.x, particle.y, particle.size, particle.type, color[0], color[1], color[2], particle.seed];
    if (!debrisBatch.add(values)) break;
  }
  programs.debris.use().float('uTime', time);
  flush(debrisBatch, programs.debris, false);
}

export function drawBubbles(front: boolean): void {
  bubbleBatch.begin();
  for (const bubble of bubbles) {
    if (bubble.front !== front || !inView(bubble, 0.7, 80)) continue;
    if (!bubbleBatch.add([bubble.x, bubble.y, bubble.size, bubble.seed])) break;
  }
  bindTexture(0, screenTargets().base.texture);
  setScreen(programs.bubble.use().int('uBackground', 0));
  flush(bubbleBatch, programs.bubble, false);
}
