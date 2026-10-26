import { gl } from './gl/context.ts';

interface TimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

const WINDOW = 1000;
const timer = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
const window_ = { start: performance.now(), frames: 0, busy: 0, worst: 0, stages: new Map<string, number>() };
let frameStart = 0;
let query: WebGLQuery | null = null;
let gpuMs: number | null = null;

export interface PerfSnapshot {
  readonly fps: number;
  readonly cpuMs: number;
  readonly worstMs: number;
  readonly gpuMs: number | null;
  readonly stages: readonly [string, number][];
}

let snapshot: PerfSnapshot = { fps: 0, cpuMs: 0, worstMs: 0, gpuMs: null, stages: [] };

export function beginFrame(): void {
  frameStart = performance.now();
}

export function stage<T>(name: string, work: () => T): T {
  const start = performance.now();
  const result = work();
  window_.stages.set(name, (window_.stages.get(name) ?? 0) + performance.now() - start);
  return result;
}

function pollGpu(): void {
  if (!timer || !query) return;
  if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return;
  const disjoint = Boolean(gl.getParameter(timer.GPU_DISJOINT_EXT));
  if (!disjoint) gpuMs = Number(gl.getQueryParameter(query, gl.QUERY_RESULT)) / 1e6;
  gl.deleteQuery(query);
  query = null;
}

export function gpuStage(work: () => void): void {
  pollGpu();
  if (!timer || query) {
    work();
    return;
  }
  query = gl.createQuery();
  gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
  work();
  gl.endQuery(timer.TIME_ELAPSED_EXT);
}

function roll(now: number): void {
  const frames = Math.max(1, window_.frames);
  snapshot = {
    fps: (window_.frames * 1000) / (now - window_.start),
    cpuMs: window_.busy / frames,
    worstMs: window_.worst,
    gpuMs: timer ? gpuMs : null,
    stages: [...window_.stages].map(([name, total]) => [name, total / frames]),
  };
  Object.assign(window_, { start: now, frames: 0, busy: 0, worst: 0, stages: new Map<string, number>() });
}

export function endFrame(): void {
  const now = performance.now();
  const spent = now - frameStart;
  window_.frames += 1;
  window_.busy += spent;
  window_.worst = Math.max(window_.worst, spent);
  if (now - window_.start >= WINDOW) roll(now);
}

export function perf(): PerfSnapshot {
  return snapshot;
}
