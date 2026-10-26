import { BossKind, type WireBoss, type WireSpot } from '../../shared/protocol.ts';
import { eventBanner } from '../dom.ts';
import { ownCells } from '../state.ts';
import { hazardView } from '../world/hazards.ts';

const INTERVAL = 250;

interface Status {
  readonly name: string;
  readonly health: number | null;
  readonly at: { readonly x: number; readonly y: number } | null;
}

const BOSS_NAMES: Readonly<Record<number, string>> = {
  [BossKind.Nematode]: 'Leviathan nematode',
  [BossKind.Spirostomum]: 'Spirostomum titan',
  [BossKind.Oligochaete]: 'Bristle worm',
  [BossKind.Physarum]: 'Slime mold',
};

function bossStatus(boss: WireBoss): Status | null {
  const name = BOSS_NAMES[boss.kind];
  return name ? { name, health: boss.health, at: boss.chains[0]?.[0] ?? null } : null;
}

function spotStatus(spot: WireSpot): Status {
  return { name: 'Micropipette', health: null, at: spot };
}

function distanceText(at: Status['at']): { text: string; angle: number } | null {
  const me = ownCells()[0];
  if (!at || !me) return null;
  const dx = at.x - me.x;
  const dy = at.y - me.y;
  const distance = Math.hypot(dx, dy);
  const text = distance < 1000 ? `${String(Math.round(distance))} µm` : `${(distance / 1000).toFixed(1)} mm`;
  return { text, angle: Math.atan2(dy, dx) };
}

function row(status: Status): HTMLElement {
  const element = document.createElement('div');
  element.className = 'event-row';
  const name = document.createElement('span');
  name.className = 'event-name';
  name.textContent = status.name;
  element.append(name);
  const where = distanceText(status.at);
  if (where) {
    const label = document.createElement('span');
    label.className = 'event-where';
    const arrow = document.createElement('i');
    arrow.textContent = '→';
    arrow.style.transform = `rotate(${String(where.angle)}rad)`;
    label.append(arrow, ` ${where.text}`);
    element.append(label);
  }
  if (status.health !== null) {
    const bar = document.createElement('span');
    bar.className = 'event-bar';
    bar.style.setProperty('--fill', String(Math.max(0, Math.min(1, status.health))));
    element.append(bar);
  }
  return element;
}

let last = 0;

export function updateEventBanner(): void {
  const now = performance.now();
  if (now - last < INTERVAL) return;
  last = now;
  const view = hazardView();
  const statuses = [view.boss ? bossStatus(view.boss) : null, view.spot ? spotStatus(view.spot) : null].filter(
    (item): item is Status => item !== null,
  );
  eventBanner.hidden = statuses.length === 0;
  eventBanner.replaceChildren(...statuses.map(row));
}
