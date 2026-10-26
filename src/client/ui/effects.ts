import { INFECTIONS } from '../../shared/protocol.ts';
import { effectsBox } from '../dom.ts';

const SHORT = ['Bdellovibrio inside', 'Faster', 'Growing', 'Sluggish', 'Leaking'];

interface Active {
  readonly label: string;
  readonly good: boolean;
  readonly until: number;
}

let active: Active[] = [];

export function addEffect(type: number): void {
  const info = INFECTIONS[type];
  if (!info) return;
  active.push({ label: SHORT[type] ?? info.label, good: info.good, until: performance.now() + info.duration * 1000 });
}

export function clearEffects(): void {
  active = [];
  effectsBox.replaceChildren();
}

function pill(effect: Active, now: number): HTMLElement {
  const element = document.createElement('div');
  element.className = `effect ${effect.good ? 'good' : 'bad'}`;
  const mark = document.createElement('span');
  mark.className = 'mark';
  const label = document.createElement('span');
  label.textContent = effect.label;
  const time = document.createElement('span');
  time.className = 'effect-time';
  time.textContent = `${Math.ceil((effect.until - now) / 1000)}s`;
  element.append(mark, label, time);
  return element;
}

export function updateEffects(): void {
  const now = performance.now();
  active = active.filter((effect) => effect.until > now);
  effectsBox.replaceChildren(...active.map((effect) => pill(effect, now)));
}
