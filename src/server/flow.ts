import { at, sampleGrid, WORLD } from '../shared/math.ts';
import { FLOW_N } from './config.ts';
import type { Cell, Point } from './types.ts';

const FLOW_CELL = WORLD / FLOW_N;
const SIZE = FLOW_N * FLOW_N;
const PRESSURE_ITERATIONS = 6;

let u = new Float32Array(SIZE);
let v = new Float32Array(SIZE);
let u2 = new Float32Array(SIZE);
let v2 = new Float32Array(SIZE);
let pressure = new Float32Array(SIZE);
let pressure2 = new Float32Array(SIZE);
const divergence = new Float32Array(SIZE);
let flowTime = 0;

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
      u[index] = at(u, index) + cell.vx * 0.006 * falloff;
      v[index] = at(v, index) + cell.vy * 0.006 * falloff;
    }
  }
}

function addAmbientCurrent(): void {
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    const y = (j / FLOW_N) * Math.PI * 2;
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const x = (i / FLOW_N) * Math.PI * 2;
      const index = j * FLOW_N + i;
      u[index] = at(u, index) + Math.sin(y * 1.7 + flowTime * 0.18) * 0.32 + Math.cos(x * 2.3 - flowTime * 0.11) * 0.22;
      v[index] = at(v, index) + Math.cos(x * 1.9 - flowTime * 0.15) * 0.3 + Math.sin(y * 2.1 + flowTime * 0.09) * 0.2;
    }
  }
}

function advect(dt: number): void {
  for (let j = 0; j < FLOW_N; j += 1) {
    for (let i = 0; i < FLOW_N; i += 1) {
      const index = j * FLOW_N + i;
      const gx = i - (at(u, index) * dt) / FLOW_CELL;
      const gy = j - (at(v, index) * dt) / FLOW_CELL;
      u2[index] = sampleGrid(u, FLOW_N, gx, gy) * 0.992;
      v2[index] = sampleGrid(v, FLOW_N, gx, gy) * 0.992;
    }
  }
  [u, u2] = [u2, u];
  [v, v2] = [v2, v];
}

function computeDivergence(): void {
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      divergence[index] = -0.5 * (at(u, index + 1) - at(u, index - 1) + at(v, index + FLOW_N) - at(v, index - FLOW_N));
      pressure[index] = 0;
    }
  }
}

function relaxPressure(): void {
  for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration += 1) {
    for (let j = 1; j < FLOW_N - 1; j += 1) {
      for (let i = 1; i < FLOW_N - 1; i += 1) {
        const index = j * FLOW_N + i;
        const neighbors =
          at(pressure, index - 1) +
          at(pressure, index + 1) +
          at(pressure, index - FLOW_N) +
          at(pressure, index + FLOW_N);
        pressure2[index] = (at(divergence, index) + neighbors) * 0.25;
      }
    }
    [pressure, pressure2] = [pressure2, pressure];
  }
}

function subtractGradient(): void {
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      u[index] = at(u, index) - 0.5 * (at(pressure, index + 1) - at(pressure, index - 1));
      v[index] = at(v, index) - 0.5 * (at(pressure, index + FLOW_N) - at(pressure, index - FLOW_N));
    }
  }
}

export function updateFlow(dt: number, cells: Iterable<Cell>): void {
  flowTime += dt;
  for (const cell of cells) stirCell(cell);
  addAmbientCurrent();
  advect(dt);
  computeDivergence();
  relaxPressure();
  subtractGradient();
}
