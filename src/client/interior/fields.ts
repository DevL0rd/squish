import { at, sampleGrid } from '../../shared/math.ts';

const PRESSURE_ITERATIONS = 6;

export function advect(
  n: number,
  velocity: { readonly u: Float32Array; readonly v: Float32Array },
  dt: number,
  pairs: readonly (readonly [Float32Array, Float32Array])[],
  decay: number,
): void {
  const { u, v } = velocity;
  for (let j = 1; j < n - 1; j += 1) {
    for (let i = 1; i < n - 1; i += 1) {
      const index = j * n + i;
      const gx = i - at(u, index) * dt * n * 0.5;
      const gy = j - at(v, index) * dt * n * 0.5;
      for (const [source, target] of pairs) target[index] = sampleGrid(source, n, gx, gy) * decay;
    }
  }
}

function computeDivergence(n: number, u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array): void {
  for (let j = 1; j < n - 1; j += 1) {
    for (let i = 1; i < n - 1; i += 1) {
      const index = j * n + i;
      div[index] = -0.5 * (at(u, index + 1) - at(u, index - 1) + at(v, index + n) - at(v, index - n));
      p[index] = 0;
    }
  }
}

function relax(n: number, p: Float32Array, div: Float32Array): void {
  for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration += 1) {
    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const index = j * n + i;
        p[index] = (at(div, index) + at(p, index - 1) + at(p, index + 1) + at(p, index - n) + at(p, index + n)) * 0.25;
      }
    }
  }
}

export function project(n: number, u: Float32Array, v: Float32Array, p: Float32Array, div: Float32Array): void {
  computeDivergence(n, u, v, p, div);
  relax(n, p, div);
  const half = (n - 1) / 2;
  for (let j = 1; j < n - 1; j += 1) {
    for (let i = 1; i < n - 1; i += 1) {
      const index = j * n + i;
      const damping = (i - half) ** 2 + (j - half) ** 2 > half ** 2 ? 0.9 : 1;
      u[index] = (at(u, index) - 0.5 * (at(p, index + 1) - at(p, index - 1))) * damping;
      v[index] = (at(v, index) - 0.5 * (at(p, index + n) - at(p, index - n))) * damping;
    }
  }
}
