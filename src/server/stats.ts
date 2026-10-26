import { sendJson } from './transport.ts';
import { world } from './world.ts';

const totals = { ticks: 0, tickMs: 0, tickMax: 0, bytes: 0, since: performance.now() };

export function countBytes(size: number): void {
  totals.bytes += size;
}

export function recordTick(ms: number): void {
  totals.ticks += 1;
  totals.tickMs += ms;
  totals.tickMax = Math.max(totals.tickMax, ms);
}

export function reportStats(): void {
  const seconds = Math.max(0.001, (performance.now() - totals.since) / 1000);
  const stats = {
    t: 'stats' as const,
    tickMs: totals.ticks ? totals.tickMs / totals.ticks : 0,
    tickMax: totals.tickMax,
    bytesPerSecond: totals.bytes / seconds,
    clients: world.clients.size,
    food: world.foods.size,
    creatures: world.creatures.size,
  };
  for (const client of world.clients) if (client.player?.admin) sendJson(client.ws, stats);
  Object.assign(totals, { ticks: 0, tickMs: 0, tickMax: 0, bytes: 0, since: performance.now() });
}
