import { SkyTool } from '../../shared/protocol.ts';
import { encodeHazards } from '../../shared/hazard-codec.ts';
import type { Cell, Player } from '../types.ts';
import { sendJson } from '../transport.ts';
import { world } from '../world.ts';
import type { Boss } from './boss.ts';
import { Nematode } from './nematode.ts';
import { Oligochaete } from './oligochaete.ts';
import { Physarum } from './physarum.ts';
import { spotWires, startPipette, startPipettes, updatePipettes, pipetteActive } from './pipette.ts';
import { Spirostomum } from './spirostomum.ts';

const FIRST_BOSS = 120;
const BOSS_GAP: readonly [number, number] = [300, 480];
const FIRST_PIPETTE = 60;
const PIPETTE_GAP: readonly [number, number] = [110, 220];
const WARNING = 8;
const RAPID_BOSS_GAP: readonly [number, number] = [15, 25];
const RAPID_PIPETTE_GAP: readonly [number, number] = [20, 35];

const BOSSES: readonly { readonly make: () => Boss; readonly text: string }[] = [
  { make: () => new Nematode(), text: 'A leviathan nematode is thrashing into the culture' },
  { make: () => new Spirostomum(), text: 'A Spirostomum titan uncoils nearby. Watch for the shimmer' },
  { make: () => new Oligochaete(), text: 'A bristle worm is burrowing through. Avoid its slime' },
  { make: () => new Physarum(), text: 'A slime mold is creeping across the slide' },
];

let boss: Boss | null = null;
let nextBoss = FIRST_BOSS;
let nextPipette = FIRST_PIPETTE;
let pending: (typeof BOSSES)[number] | null = null;
let clock = 0;
let rapid = false;
let cycle = 0;

function announce(text: string, danger: boolean): void {
  for (const client of world.clients) sendJson(client.ws, { t: 'announce', text, danger });
}

function between(range: readonly [number, number]): number {
  return range[0] + Math.random() * (range[1] - range[0]);
}

function scheduleBoss(): void {
  if (boss || clock < nextBoss - WARNING) return;
  if (!pending) {
    const index = rapid ? cycle++ % BOSSES.length : Math.floor(Math.random() * BOSSES.length);
    pending = BOSSES[index] ?? null;
    if (pending) announce(pending.text, true);
    return;
  }
  if (clock < nextBoss) return;
  boss = pending.make();
  pending = null;
}

const TOOL_TEXT: Readonly<Record<number, string>> = {
  [SkyTool.Needle]: 'The lamp sharpens. Something is looking down at the slide',
  [SkyTool.Holder]: 'A holding pipette is lowering. Do not get caught',
  [SkyTool.Knife]: 'A glass microknife is being lowered. Stay out of its line',
};

function pickTool(): number {
  const roll = Math.random();
  if (roll < 0.5) return SkyTool.Needle;
  return roll < 0.75 ? SkyTool.Holder : SkyTool.Knife;
}

function schedulePipette(): void {
  if (pipetteActive() || clock < nextPipette) return;
  const tool = pickTool();
  if (startPipettes(tool)) announce(TOOL_TEXT[tool] ?? '', true);
  nextPipette = clock + between(rapid ? RAPID_PIPETTE_GAP : PIPETTE_GAP);
}

export function updateHazards(dt: number): void {
  clock += dt;
  scheduleBoss();
  schedulePipette();
  updatePipettes(dt);
  if (!boss) return;
  boss.update(dt);
  if (!boss.done()) return;
  boss = null;
  nextBoss = clock + between(rapid ? RAPID_BOSS_GAP : BOSS_GAP);
}

export function forceBoss(index: number): void {
  const chosen = BOSSES[index];
  if (!chosen) return;
  announce(chosen.text, true);
  boss = chosen.make();
  pending = null;
}

export function endBoss(): void {
  boss = null;
  pending = null;
  nextBoss = clock + between(rapid ? RAPID_BOSS_GAP : BOSS_GAP);
}

export function forcePipette(target: Player, tool: number): void {
  if (startPipette(tool, target)) announce(TOOL_TEXT[tool] ?? '', true);
}

export function toggleRapid(): boolean {
  rapid = !rapid;
  if (rapid) {
    nextBoss = Math.min(nextBoss, clock + WARNING);
    nextPipette = Math.min(nextPipette, clock + 5);
  }
  return rapid;
}

export function damageBoss(point: { x: number; y: number }, radius: number, amount: number): boolean {
  if (!boss?.touches(point, radius)) return false;
  boss.wound(amount);
  return true;
}

export function bossClosest(point: { x: number; y: number }): { x: number; y: number; gap: number } | null {
  return boss?.closest(point) ?? null;
}

export function woundBoss(amount: number): void {
  boss?.wound(amount);
}

export function bossPoint(): { x: number; y: number } | null {
  return boss?.wire().chains[0]?.[0] ?? null;
}

export function hazardSlowdown(cell: Cell): number {
  return boss ? boss.slowdown(cell.x, cell.y) : 1;
}

export function hazardPacket(): Uint8Array {
  return encodeHazards({ spots: spotWires(), boss: boss?.wire() ?? null });
}
