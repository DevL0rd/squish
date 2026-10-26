import { adminPanel, fpsMeter } from '../dom.ts';
import type { Net, ServerStats } from '../net.ts';
import { perf } from '../perf.ts';
import { state } from '../state.ts';
import { debris } from '../world/decor.ts';
import { settings } from './settings.ts';

const INTERVAL = 250;
const PROBE_INTERVAL = 2000;

let server: ServerStats | null = null;
let ping: number | null = null;
let last = 0;
let lastProbe = 0;
let readout: HTMLPreElement | null = null;

export function receiveStats(stats: ServerStats): void {
  server = stats;
}

export function receiveEcho(at: number): void {
  ping = performance.now() - at;
}

function details(): string {
  const snapshot = perf();
  const lines = [
    `frame  ${snapshot.cpuMs.toFixed(2)} ms cpu · worst ${snapshot.worstMs.toFixed(1)} ms`,
    `gpu    ${snapshot.gpuMs === null ? 'n/a' : `${snapshot.gpuMs.toFixed(2)} ms`}`,
    ...snapshot.stages.map(([name, ms]) => `  ${name.padEnd(9)} ${ms.toFixed(2)} ms`),
    `cells ${String(state.cells.size)} · food ${String(state.food.size)} · creatures ${String(state.creatures.size)}`,
    `debris ${String(debris.length)} · zoom ${state.zoom.value.toFixed(2)}`,
    `ping   ${ping === null ? '…' : `${ping.toFixed(0)} ms`}`,
  ];
  if (server) {
    lines.push(
      `server ${server.tickMs.toFixed(2)} ms/tick · worst ${server.tickMax.toFixed(1)} ms`,
      `net    ${(server.bytesPerSecond / 1024).toFixed(1)} KB/s out · ${String(server.clients)} clients`,
    );
  }
  return lines.join('\n');
}

function ensureReadout(): HTMLPreElement {
  if (readout?.isConnected) return readout;
  readout = document.createElement('pre');
  readout.className = 'perf-readout';
  adminPanel.prepend(readout);
  return readout;
}

export function updatePerfHud(net: Net, admin: boolean): void {
  const now = performance.now();
  if (now - last < INTERVAL) return;
  last = now;
  fpsMeter.hidden = !settings().fps;
  fpsMeter.textContent = `${perf().fps.toFixed(0)} fps · ${perf().cpuMs.toFixed(1)} ms`;
  if (!admin || adminPanel.hidden) return;
  ensureReadout().textContent = details();
  if (now - lastProbe > PROBE_INTERVAL) {
    lastProbe = now;
    net.probe();
  }
}
