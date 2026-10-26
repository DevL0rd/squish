import { settings } from './ui/settings.ts';

const channel = new MessageChannel();
let pending: (() => void) | null = null;
let last = 0;

channel.port1.onmessage = () => {
  const run = pending;
  pending = null;
  run?.();
};

function interval(): number {
  const limit = settings().frameLimit;
  return limit === 'off' ? 0 : 1000 / Number(limit);
}

function due(now: number): boolean {
  return now - last >= interval() - 0.5;
}

function onVsync(run: () => void): void {
  requestAnimationFrame((now) => {
    if (!due(now)) {
      onVsync(run);
      return;
    }
    last = now;
    run();
  });
}

function unsynced(run: () => void): void {
  const wait = Math.max(0, interval() - (performance.now() - last));
  const fire = (): void => {
    last = performance.now();
    run();
  };
  if (wait > 1) {
    window.setTimeout(fire, wait);
    return;
  }
  pending = fire;
  channel.port2.postMessage(0);
}

export function nextFrame(run: () => void): void {
  if (settings().vsync || document.hidden) onVsync(run);
  else unsynced(run);
}
