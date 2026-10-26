import { clamp, WORLD } from '../../shared/math.ts';
import { randomRange, vividColor, worldColorAt } from '../color.ts';
import { coarsePointer } from '../dom.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { bindTarget, divergenceTarget, dye, fluidSize, pressure, velocity, type PingPong } from '../gl/targets.ts';
import { inView, state, type CellVisual } from '../state.ts';
import { cellFluidColor } from '../world/interiors.ts';
import { readFlowField } from './flow-field.ts';

export const MAX_SPLATS = 28;
const TEXEL = 1 / fluidSize;
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
  splatData.set([write.x / WORLD, write.y / WORLD, write.radius, write.strength], index * 4);
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
      const x = Math.random() * WORLD;
      const y = Math.random() * WORLD;
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
  const color = vividColor(cellFluidColor(cell));
  const intensity = 0.012 * clamp(0.3 + speed / 700, 0.4, 1) * clamp(42 / cell.radius, 0.18, 1);
  const offset = Math.min(cell.radius * 0.5, 24);
  return {
    x: cell.x - (cell.vx / speed) * offset,
    y: cell.y - (cell.vy / speed) * offset,
    radius: Math.max(0.0011, Math.min(cell.radius * 0.85, 44) / WORLD),
    strength: 0.82,
    vx: cell.vx * (fluidSize / WORLD) * 0.5,
    vy: cell.vy * (fluidSize / WORLD) * 0.5,
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
  }
  for (const burst of state.splats) {
    if (count >= MAX_SPLATS) break;
    const { color } = burst;
    writeSplat(count++, {
      x: burst.x,
      y: burst.y,
      radius: Math.max(0.0022, burst.radius / WORLD),
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
