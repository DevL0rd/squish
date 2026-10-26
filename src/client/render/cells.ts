import { at, clamp } from '../../shared/math.ts';
import type { CellVisual } from '../cell/cell.ts';
import { interiorScale } from '../cell/cell.ts';
import type { Ring } from '../cell/geometry.ts';
import { OrganelleKind, type Organelle } from '../cell/organelles.ts';
import { vividColor } from '../color.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { InstanceBatch } from '../gl/instances.ts';
import type { ShaderProgram } from '../gl/program.ts';
import { programs } from '../gl/programs.ts';
import { backdrop, screen, screenTargets } from '../gl/screen.ts';
import { bindTarget } from '../gl/targets.ts';
import { MAX_RENDER_POINTS } from '../shaders/cell.ts';
import { inView, state } from '../state.ts';
import { isHidden } from '../world/division.ts';
import { interiorTexture } from '../world/textures.ts';
import { setScreen, setView } from './view.ts';

const points = new Float32Array(MAX_RENDER_POINTS * 2);
const organelles = new InstanceBatch(3, 12000);
const meals = new InstanceBatch(3, 1024);
const prey = new InstanceBatch(3, 256);

function subdivide(ring: Ring): number {
  const count = Math.min(ring.x.length, MAX_RENDER_POINTS / 2);
  for (let i = 0; i < count; i += 1) {
    const prev = (i + count - 1) % count;
    const next = (i + 1) % count;
    const after = (i + 2) % count;
    points[i * 4] = at(ring.x, i);
    points[i * 4 + 1] = at(ring.y, i);
    points[i * 4 + 2] = (-at(ring.x, prev) + 9 * at(ring.x, i) + 9 * at(ring.x, next) - at(ring.x, after)) / 16;
    points[i * 4 + 3] = (-at(ring.y, prev) + 9 * at(ring.y, i) + 9 * at(ring.y, next) - at(ring.y, after)) / 16;
  }
  return count * 2;
}

function extent(cell: CellVisual): number {
  const { membrane, center } = cell;
  let reach = 0;
  for (let i = 0; i < membrane.count; i += 1) {
    reach = Math.max(reach, Math.hypot(at(membrane.x, i) - center.x, at(membrane.y, i) - center.y));
  }
  return reach + cell.radius * 0.25 + (state.camera.height / screen.height) * 14;
}

function drawBody(program: ShaderProgram, cell: CellVisual): void {
  bindTexture(1, interiorTexture(cell));
  const count = subdivide(cell.membrane);
  program
    .vec2s('uPoints', points)
    .int('uCount', count)
    .vec2('uCenter', cell.center.x, cell.center.y)
    .float('uExtent', extent(cell))
    .float('uRadius', cell.radius)
    .float('uScale', interiorScale(cell))
    .vec3('uColor', vividColor(cell.fluidColor))
    .float('uSeed', (cell.id % 997) * 0.137)
    .float('uOpacity', 1);
  drawQuad();
}

function visibleCells(): CellVisual[] {
  return [...state.cells.values()]
    .filter((cell) => !isHidden(cell) && inView(cell, 0.7, cell.radius * 1.6))
    .sort((a, b) => a.radius - b.radius);
}

export function drawCellBodies(time: number): void {
  bindTarget(screenTargets().cells, screen.width, screen.height);
  bindTexture(0, backdrop());
  const program = setScreen(setView(programs.cell)).float('uTime', time).int('uBackground', 0).int('uInterior', 1);
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const cell of visibleCells()) drawBody(program, cell);
  gl.disable(gl.BLEND);
}

function batchFor(kind: number): InstanceBatch {
  if (kind === OrganelleKind.Food) return meals;
  return kind === OrganelleKind.Creature ? prey : organelles;
}

function instance(item: Organelle, x: number, y: number, fade: number): number[] {
  const [r, g, b] = item.color;
  const px = x + item.x;
  const py = y + item.y;
  if (item.kind === OrganelleKind.Food) {
    return [px, py, item.radius * 2.1, item.phase, r, g, b, fade, item.variety, 0, 0, 0];
  }
  if (item.kind === OrganelleKind.Creature) {
    return [px, py, item.radius * 2.4, item.variety, r, g, b, item.angle, item.phase + state.time, fade, 0, 0];
  }
  return [px, py, item.radius, item.kind, r, g, b, fade, item.phase, 0, 0, 0];
}

function queueOrganelles(cell: CellVisual): boolean {
  const { x, y } = cell.center;
  for (const item of cell.organelles.items) {
    const fade = Number.isFinite(item.maxLife) ? clamp(item.life / Math.min(item.maxLife, 1.5), 0, 1) : 1;
    if (!batchFor(item.kind).add(instance(item, x, y, fade))) return false;
  }
  return true;
}

export function drawOrganelles(time: number): void {
  for (const batch of [organelles, meals, prey]) batch.begin();
  for (const cell of visibleCells()) {
    if (!queueOrganelles(cell)) break;
  }
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  if (organelles.count) {
    setView(programs.organelle).float('uTime', time);
    organelles.draw();
  }
  if (meals.count) {
    setView(programs.food).float('uTime', time);
    meals.draw();
  }
  if (prey.count) {
    setView(programs.creature);
    prey.draw();
  }
  gl.disable(gl.BLEND);
}
