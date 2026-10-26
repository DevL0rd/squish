import type { WireEvent } from '../../shared/protocol.ts';
import { playSfx } from '../audio.ts';
import type { Sfx } from '../sounds.ts';
import { addSplat, isMine, shake, state } from '../state.ts';
import { addShot, Weapon } from './attacks.ts';
import { spawnBurst } from './decor.ts';

const SOUND: Readonly<Record<number, Sfx>> = {
  [Weapon.Volley]: 'volley',
  [Weapon.Dart]: 'dart',
  [Weapon.Pulse]: 'pulse',
  [Weapon.Bomb]: 'bomb',
};

const KICK: Readonly<Record<number, number>> = {
  [Weapon.Volley]: 0.4,
  [Weapon.Dart]: 0.7,
  [Weapon.Pulse]: 1.6,
  [Weapon.Bomb]: 0.6,
};

export function onAttack(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  if (!cell) return;
  const color = cell.interior.averageColor();
  addShot(event.predatorId, { x: cell.center.x, y: cell.center.y }, { x: event.x, y: event.y }, event.amount, color);
  cell.interior.drain(0.03);
  if (event.predatorId === Weapon.Pulse) {
    addSplat({ x: cell.center.x, y: cell.center.y, radius: cell.radius * 2.2, color, strength: 0.2 });
  }
  const sound = SOUND[event.predatorId];
  const distance = Math.hypot(cell.center.x - state.camera.x, cell.center.y - state.camera.y);
  const level = isMine(cell) ? 1 : Math.max(0, 1 - distance / state.camera.width) * 0.5;
  if (sound && level > 0.02) playSfx(sound, level);
  if (isMine(cell)) shake(KICK[event.predatorId] ?? 0.5);
}

export function onHit(event: WireEvent): void {
  const cell = state.cells.get(event.cellId);
  addSplat({ x: event.x, y: event.y, radius: 46 + event.amount * 120, color: event.color, strength: 0.18 });
  spawnBurst(event.x, event.y, event.color, { count: 8, spread: 10, speed: 110, size: 3, life: [1, 2.5], front: 0.6 });
  if (!cell) return;
  cell.membrane.cups.push({ x: event.x, y: event.y, radius: 14 + event.amount * 40, life: 0.4, duration: 0.4 });
  if (!isMine(cell)) return;
  playSfx('hit', Math.min(1, 0.4 + event.amount * 2));
  shake(0.8 + event.amount * 3);
}

export function onToxin(event: WireEvent): void {
  addShot(Weapon.Toxin, { x: event.x, y: event.y }, { x: event.x, y: event.y }, event.amount, event.color);
  const distance = Math.hypot(event.x - state.camera.x, event.y - state.camera.y);
  if (distance < state.camera.width) playSfx('bomb', 1 - distance / state.camera.width);
}

export function onSpine(event: WireEvent): void {
  const virus = state.creatures.get(event.predatorId);
  const from = virus ? { x: virus.x, y: virus.y } : { x: event.x, y: event.y };
  addShot(Weapon.Spine, from, { x: event.x, y: event.y }, event.amount, event.color);
  const distance = Math.hypot(from.x - state.camera.x, from.y - state.camera.y);
  if (distance < state.camera.width) playSfx('dart', 0.6 * (1 - distance / state.camera.width));
}
