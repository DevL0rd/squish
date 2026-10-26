import { at, clamp } from '../../shared/math.ts';
import { FLUID_SPAN, fluidWindow, toFluid } from './fluid-window.ts';
import { randomRange, vividColor, worldColorAt } from '../color.ts';
import { coarsePointer } from '../dom.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { bindTarget, divergenceTarget, dye, fluidSize, pressure, velocity, type PingPong } from '../gl/targets.ts';
import type { CellVisual } from '../cell/cell.ts';
import { inView, state } from '../state.ts';
import { readFlowField } from './flow-field.ts';

export const MAX_SPLATS = 28;
const TEXEL = 1 / fluidSize;
const WAKE_DYE = 0.09;
const BLEED_DYE = 0.03;
const PRESSURE_ITERATIONS = coarsePointer ? 8 : 10;

const splatData = new Float32Array(MAX_SPLATS * 4);
const splatVelocity = new Float32Array(MAX_SPLATS * 2);
const splatColor = new Float32Array(MAX_SPLATS * 3);

interface SplatWrite {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly strength: number;
  readonly vx: number;
  readonly vy: number;
  readonly color: readonly [number, number, number];
}

function writeSplat(index: number, write: SplatWrite): void {
  const [u, v] = toFluid(write.x, write.y);
  splatData.set([u, v, write.radius, write.strength], index * 4);
  splatVelocity.set([write.vx, write.vy], index * 2);
  splatColor.set(write.color, index * 3);
}

function splat(field: PingPong, mode: number, count: number): void {
  if (!count) return;
  bindTarget(field.read, fluidSize, fluidSize);
  blend(gl.ONE, gl.ONE);
  programs.splat
    .use()
    .int('uMode', mode)
    .int('uCount', count)
    .vec4s('uSplats', splatData)
    .vec2s('uSplatVelocity', splatVelocity)
    .vec3s('uSplatColor', splatColor);
  drawQuad();
  gl.disable(gl.BLEND);
}

function splatBoth(count: number): void {
  splat(velocity, 0, count);
  splat(dye, 1, count);
}

export function seedFluid(): void {
  for (let pass = 0; pass < 8; pass += 1) {
    for (let i = 0; i < MAX_SPLATS; i += 1) {
      const x = fluidWindow.x + Math.random() * FLUID_SPAN;
      const y = fluidWindow.y + Math.random() * FLUID_SPAN;
      const color = worldColorAt(x, y, 0.82, 0.5);
      writeSplat(i, {
        x,
        y,
        radius: randomRange(0.012, 0.045),
        strength: randomRange(0.25, 0.75),
        vx: randomRange(-22, 22),
        vy: randomRange(-22, 22),
        color: [color[0] * 0.035, color[1] * 0.035, color[2] * 0.035],
      });
    }
    splatBoth(MAX_SPLATS);
  }
}

function wakeSplat(cell: CellVisual): SplatWrite | null {
  const speed = Math.hypot(cell.vx, cell.vy);
  if (speed < 7) return null;
  const color = vividColor(cell.fluidColor);
  const intensity = WAKE_DYE * clamp(0.3 + speed / 700, 0.4, 1) * clamp(42 / cell.radius, 0.18, 1);
  const offset = Math.min(cell.radius * 0.5, 24);
  return {
    x: cell.x - (cell.vx / speed) * offset,
    y: cell.y - (cell.vy / speed) * offset,
    radius: Math.max(0.0011, Math.min(cell.radius * 0.85, 44) / FLUID_SPAN),
    strength: 0.82,
    vx: cell.vx * (fluidSize / FLUID_SPAN) * 0.5,
    vy: cell.vy * (fluidSize / FLUID_SPAN) * 0.5,
    color: [color[0] * intensity, color[1] * intensity, color[2] * intensity],
  };
}

function bleedSplat(cell: CellVisual): SplatWrite {
  const { membrane } = cell;
  const index = Math.floor(Math.random() * membrane.count);
  const x = at(membrane.x, index);
  const y = at(membrane.y, index);
  const length = Math.hypot(x - cell.center.x, y - cell.center.y) || 1;
  const push = (fluidSize / FLUID_SPAN) * 18;
  const color = vividColor(cell.fluidColor);
  const intensity = BLEED_DYE * (cell.mass > 180 ? 2.2 : 1);
  return {
    x,
    y,
    radius: Math.max(0.0008, (cell.radius * 0.3) / FLUID_SPAN),
    strength: 0.6,
    vx: ((x - cell.center.x) / length) * push,
    vy: ((y - cell.center.y) / length) * push,
    color: [color[0] * intensity, color[1] * intensity, color[2] * intensity],
  };
}

function buildSplats(): number {
  const { camera } = state;
  const distance = (cell: CellVisual): number => Math.hypot(cell.x - camera.x, cell.y - camera.y);
  const nearby = [...state.cells.values()]
    .filter((cell) => inView(cell, 0.75, cell.radius * 4))
    .sort((a, b) => distance(a) - distance(b));
  let count = 0;
  for (const cell of nearby) {
    if (count >= MAX_SPLATS) break;
    const wake = wakeSplat(cell);
    if (wake) writeSplat(count++, wake);
    if (count < MAX_SPLATS) writeSplat(count++, bleedSplat(cell));
  }
  for (const burst of state.splats) {
    if (count >= MAX_SPLATS) break;
    const { color } = burst;
    writeSplat(count++, {
      x: burst.x,
      y: burst.y,
      radius: Math.max(0.0022, burst.radius / FLUID_SPAN),
      strength: burst.strength,
      vx: 0,
      vy: 0,
      color: [color[0] * 0.22, color[1] * 0.22, color[2] * 0.22],
    });
  }
  state.splats = [];
  return count;
}

function runPass(target: PingPong): void {
  bindTarget(target.write, fluidSize, fluidSize);
  drawQuad();
  target.swap();
}

function project(): void {
  bindTarget(divergenceTarget, fluidSize, fluidSize);
  bindTexture(0, velocity.read.texture);
  programs.divergence.use().int('uVelocity', 0).vec2('uTexel', TEXEL, TEXEL);
  drawQuad();
  programs.pressure.use().int('uDivergence', 0).int('uPressure', 1).vec2('uTexel', TEXEL, TEXEL);
  bindTexture(0, divergenceTarget.texture);
  for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration += 1) {
    bindTexture(1, pressure.read.texture);
    runPass(pressure);
  }
  bindTexture(0, velocity.read.texture);
  bindTexture(1, pressure.read.texture);
  programs.gradient.use().int('uVelocity', 0).int('uPressure', 1).vec2('uTexel', TEXEL, TEXEL);
  runPass(velocity);
}

function advectDye(dt: number): void {
  bindTexture(0, velocity.read.texture);
  bindTexture(1, dye.read.texture);
  programs.advect
    .use()
    .int('uVelocity', 0)
    .int('uSource', 1)
    .vec2('uTexel', TEXEL, TEXEL)
    .float('uDt', dt)
    .float('uDissipation', 0.997);
  runPass(dye);
}

export function stepFluid(dt: number): void {
  splatBoth(buildSplats());
  gl.disable(gl.BLEND);
  project();
  advectDye(dt);
  readFlowField(dt);
}
