import { at, clamp, type Rgb } from '../../shared/math.ts';
import { vividColor } from '../color.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import type { ShaderProgram } from '../gl/program.ts';
import { programs } from '../gl/programs.ts';
import { screen, screenTargets } from '../gl/screen.ts';
import { bindTarget } from '../gl/targets.ts';
import { inView, state, type CellVisual, type InteriorRecord } from '../state.ts';
import { cellFluidColor, ensureTexture, interiorFor } from '../world/interiors.ts';
import { setScreen, setView } from './view.ts';

const HARMONICS = 7;
const MAX_INTERIOR_ITEMS = 8;
const MAX_BRIDGES = 12;

const shapeData = new Float32Array(HARMONICS * 4);
const shapeDataA = new Float32Array(HARMONICS * 4);
const shapeDataB = new Float32Array(HARMONICS * 4);
const foodData = new Float32Array(MAX_INTERIOR_ITEMS * 4);
const foodColors = new Float32Array(MAX_INTERIOR_ITEMS * 3);
const organelleData = new Float32Array(MAX_INTERIOR_ITEMS * 4);

function fillShape(cell: CellVisual, target: Float32Array): void {
  const { soft } = cell;
  const count = Math.min(soft.count, 64);
  const inv = 1 / count;
  target.fill(0);
  for (let i = 0; i < count; i += 1) {
    const radius = Math.hypot(at(soft.px, i), at(soft.py, i));
    const angle = i * inv * Math.PI * 2;
    target[0] = at(target, 0) + radius * inv;
    for (let k = 1; k < HARMONICS; k += 1) {
      target[k * 4] = at(target, k * 4) + radius * Math.cos(k * angle) * 2 * inv;
      target[k * 4 + 1] = at(target, k * 4 + 1) + radius * Math.sin(k * angle) * 2 * inv;
    }
  }
}

function shapeExtent(): number {
  let extent = at(shapeData, 0);
  for (let k = 1; k < HARMONICS; k += 1) extent += Math.hypot(at(shapeData, k * 4), at(shapeData, k * 4 + 1));
  return extent;
}

function uploadInterior(program: ShaderProgram, record: InteriorRecord, color: Rgb): void {
  const sprites = record.interior.food.sprites();
  foodData.fill(0);
  foodColors.fill(0);
  sprites.forEach((item, i) => {
    foodData.set([item.x, item.y, item.size, item.alpha], i * 4);
    foodColors.set(item.color, i * 3);
  });
  const organelles = record.interior.organelles.slice(0, MAX_INTERIOR_ITEMS);
  organelleData.fill(0);
  organelles.forEach((item, i) => {
    organelleData.set([item.x, item.y, item.radius, item.type], i * 4);
  });
  program
    .int('uFoodCount', sprites.length)
    .vec4s('uFood', foodData)
    .vec3s('uFoodColor', foodColors)
    .int('uOrganelleCount', organelles.length)
    .vec4s('uOrganelle', organelleData)
    .vec3('uOrganelleColor', [color[0] * 0.45 + 0.16, color[1] * 0.45 + 0.2, color[2] * 0.45 + 0.2]);
}

interface Membrane {
  readonly cell: CellVisual;
  readonly record: InteriorRecord;
  readonly color: Rgb;
  readonly opacity: number;
}

function drawMembrane(program: ShaderProgram, membrane: Membrane): void {
  const { cell, record, color } = membrane;
  bindTexture(1, ensureTexture(record));
  program
    .float('uRadius', cell.radius)
    .vec3('uColor', color)
    .float('uSeed', (cell.id % 997) * 0.137)
    .float('uOpacity', membrane.opacity);
  uploadInterior(program, record, color);
  fillShape(cell, shapeData);
  program
    .vec2('uCenter', cell.soft.cx, cell.soft.cy)
    .float('uExtent', shapeExtent() * 1.03 + 2)
    .vec4s('uShape', shapeData);
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  drawQuad();
}

function prepareCellProgram(time: number): ShaderProgram {
  bindTexture(0, screenTargets().base.texture);
  return setScreen(setView(programs.cell)).float('uTime', time).int('uBackground', 0).int('uInterior', 1);
}

export function drawCellBodies(time: number): void {
  bindTarget(screenTargets().cells, screen.width, screen.height);
  const program = prepareCellProgram(time);
  const cells = [...state.cells.values()].sort((a, b) => a.radius - b.radius);
  for (const cell of cells) {
    if (!inView(cell, 0.7, cell.radius * 1.4)) continue;
    const record = interiorFor(cell);
    const color = vividColor(record.fluidColor ?? cellFluidColor(cell));
    drawMembrane(program, { cell, record, color, opacity: 1 });
  }
  gl.disable(gl.BLEND);
}

export function drawMergeGhosts(time: number): void {
  if (!state.mergeGhosts.length) return;
  const program = prepareCellProgram(time);
  for (const ghost of state.mergeGhosts) {
    const { record } = ghost;
    const color = vividColor(record.fluidColor ?? record.interior.averageColor());
    drawMembrane(program, { cell: ghost.cell, record, color, opacity: clamp(ghost.life / ghost.maxLife, 0, 1) });
  }
  gl.disable(gl.BLEND);
}

function bridgePairs(): [CellVisual, CellVisual][] {
  const cells = [...state.cells.values()];
  const pairs: [CellVisual, CellVisual][] = [];
  for (let i = 0; i < cells.length && pairs.length < MAX_BRIDGES; i += 1) {
    const a = cells[i];
    for (let j = i + 1; a && j < cells.length && pairs.length < MAX_BRIDGES; j += 1) {
      const b = cells[j];
      if (b && Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius + 20) pairs.push([a, b]);
    }
  }
  return pairs;
}

function bridgeColor(record: InteriorRecord): Rgb {
  return vividColor(record.fluidColor ?? record.interior.averageColor());
}

function drawBridge(program: ShaderProgram, a: CellVisual, b: CellVisual): void {
  const recordA = interiorFor(a);
  const recordB = interiorFor(b);
  bindTexture(1, ensureTexture(recordA));
  bindTexture(2, ensureTexture(recordB));
  const gap = Math.hypot(a.x - b.x, a.y - b.y) - a.radius - b.radius;
  fillShape(a, shapeDataA);
  fillShape(b, shapeDataB);
  program
    .vec2('uCenterA', a.soft.cx, a.soft.cy)
    .vec2('uCenterB', b.soft.cx, b.soft.cy)
    .float('uRadiusA', a.radius)
    .float('uRadiusB', b.radius)
    .vec3('uColorA', bridgeColor(recordA))
    .vec3('uColorB', bridgeColor(recordB))
    .float('uOpacity', clamp(1 - gap / 16, 0, 1))
    .vec4s('uShapeA', shapeDataA)
    .vec4s('uShapeB', shapeDataB);
  drawQuad();
}

export function drawFusionBridges(time: number): void {
  const pairs = bridgePairs();
  if (!pairs.length) return;
  bindTexture(0, screenTargets().base.texture);
  const program = setScreen(setView(programs.fusion))
    .float('uTime', time)
    .int('uBackground', 0)
    .int('uInteriorA', 1)
    .int('uInteriorB', 2);
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const [a, b] of pairs) drawBridge(program, a, b);
  gl.disable(gl.BLEND);
}
