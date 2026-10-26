import { sampleGrid, WORLD } from '../shared/math.ts';
import { FLOW_N } from './config.ts';
import type { Cell, Point } from './types.ts';

const FLOW_CELL = WORLD / FLOW_N;
const SIZE = FLOW_N * FLOW_N;
const PRESSURE_ITERATIONS = 4;
const STEP = 1 / 15;
const TICKS_PER_STEP = STEP * 30;
const DAMPING = Math.pow(0.992, TICKS_PER_STEP);

let u = new Float32Array(SIZE);
let v = new Float32Array(SIZE);
let u2 = new Float32Array(SIZE);
let v2 = new Float32Array(SIZE);
let pressure = new Float32Array(SIZE);
let pressure2 = new Float32Array(SIZE);
const divergence = new Float32Array(SIZE);
let flowTime = 0;
let pending = 0;
const rowA = new Float32Array(FLOW_N);
const rowB = new Float32Array(FLOW_N);
const colA = new Float32Array(FLOW_N);
const colB = new Float32Array(FLOW_N);

export function flowAt(point: Point): Point {
  const gx = point.x / FLOW_CELL;
  const gy = point.y / FLOW_CELL;
  return { x: sampleGrid(u, FLOW_N, gx, gy), y: sampleGrid(v, FLOW_N, gx, gy) };
}

function stirCell(cell: Cell): void {
  const gx = cell.x / FLOW_CELL;
  const gy = cell.y / FLOW_CELL;
  const radius = Math.max(2.2, (cell.radius / FLOW_CELL) * 1.8);
  const lowX = Math.max(1, Math.floor(gx - radius));
  const highX = Math.min(FLOW_N - 2, Math.ceil(gx + radius));
  const lowY = Math.max(1, Math.floor(gy - radius));
  const highY = Math.min(FLOW_N - 2, Math.ceil(gy + radius));
  for (let j = lowY; j <= highY; j += 1) {
    const dy = (j - gy) / radius;
    for (let i = lowX; i <= highX; i += 1) {
      const dx = (i - gx) / radius;
      const falloff = Math.exp(-(dx * dx + dy * dy) * 2.4);
      const index = j * FLOW_N + i;
      u[index] = (u[index] ?? 0) + cell.vx * 0.006 * TICKS_PER_STEP * falloff;
      v[index] = (v[index] ?? 0) + cell.vy * 0.006 * TICKS_PER_STEP * falloff;
    }
  }
}

function ambientTerms(): void {
  for (let k = 0; k < FLOW_N; k += 1) {
    const angle = (k / FLOW_N) * Math.PI * 2;
    rowA[k] = Math.sin(angle * 1.7 + flowTime * 0.18) * 0.32 * TICKS_PER_STEP;
    rowB[k] = Math.sin(angle * 2.1 + flowTime * 0.09) * 0.2 * TICKS_PER_STEP;
    colA[k] = Math.cos(angle * 2.3 - flowTime * 0.11) * 0.22 * TICKS_PER_STEP;
    colB[k] = Math.cos(angle * 1.9 - flowTime * 0.15) * 0.3 * TICKS_PER_STEP;
  }
}

function addAmbientCurrent(): void {
  ambientTerms();
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    const pushU = rowA[j] ?? 0;
    const pushV = rowB[j] ?? 0;
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      u[index] = (u[index] ?? 0) + pushU + (colA[i] ?? 0);
      v[index] = (v[index] ?? 0) + pushV + (colB[i] ?? 0);
    }
  }
}

function carry(index: number, gx: number, gy: number): void {
  const cx = Math.min(Math.max(gx, 0), FLOW_N - 1.001);
  const cy = Math.min(Math.max(gy, 0), FLOW_N - 1.001);
  const x0 = cx | 0;
  const y0 = cy | 0;
  const fx = cx - x0;
  const fy = cy - y0;
  const a = y0 * FLOW_N + x0;
  const w00 = (1 - fx) * (1 - fy) * DAMPING;
  const w10 = fx * (1 - fy) * DAMPING;
  const w01 = (1 - fx) * fy * DAMPING;
  const w11 = fx * fy * DAMPING;
  u2[index] = (u[a] ?? 0) * w00 + (u[a + 1] ?? 0) * w10 + (u[a + FLOW_N] ?? 0) * w01 + (u[a + FLOW_N + 1] ?? 0) * w11;
  v2[index] = (v[a] ?? 0) * w00 + (v[a + 1] ?? 0) * w10 + (v[a + FLOW_N] ?? 0) * w01 + (v[a + FLOW_N + 1] ?? 0) * w11;
}

function advect(dt: number): void {
  for (let j = 0; j < FLOW_N; j += 1) {
    for (let i = 0; i < FLOW_N; i += 1) {
      const index = j * FLOW_N + i;
      const gx = i - ((u[index] ?? 0) * dt) / FLOW_CELL;
      const gy = j - ((v[index] ?? 0) * dt) / FLOW_CELL;
      carry(index, gx, gy);
    }
  }
  [u, u2] = [u2, u];
  [v, v2] = [v2, v];
}

function computeDivergence(): void {
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      divergence[index] =
        -0.5 * ((u[index + 1] ?? 0) - (u[index - 1] ?? 0) + (v[index + FLOW_N] ?? 0) - (v[index - FLOW_N] ?? 0));
    }
  }
}

function relaxPressure(): void {
  for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration += 1) {
    for (let j = 1; j < FLOW_N - 1; j += 1) {
      for (let i = 1; i < FLOW_N - 1; i += 1) {
        const index = j * FLOW_N + i;
        const neighbors =
          (pressure[index - 1] ?? 0) +
          (pressure[index + 1] ?? 0) +
          (pressure[index - FLOW_N] ?? 0) +
          (pressure[index + FLOW_N] ?? 0);
        pressure2[index] = ((divergence[index] ?? 0) + neighbors) * 0.25;
      }
    }
    [pressure, pressure2] = [pressure2, pressure];
  }
}

function subtractGradient(): void {
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      u[index] = (u[index] ?? 0) - 0.5 * ((pressure[index + 1] ?? 0) - (pressure[index - 1] ?? 0));
      v[index] = (v[index] ?? 0) - 0.5 * ((pressure[index + FLOW_N] ?? 0) - (pressure[index - FLOW_N] ?? 0));
    }
  }
}

export function updateFlow(dt: number, cells: Iterable<Cell>): void {
  pending += dt;
  if (pending < STEP) return;
  pending -= STEP;
  flowTime += STEP;
  for (const cell of cells) stirCell(cell);
  addAmbientCurrent();
  advect(STEP);
  computeDivergence();
  relaxPressure();
  subtractGradient();
}
