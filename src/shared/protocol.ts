import type { Rgb } from './math.ts';

export const Packet = { Snapshot: 1, Food: 2, Creature: 3 } as const;

export const EventKind = { Eat: 1, Split: 3, Merge: 4, Spit: 5, CreatureFirst: 6, CreatureLast: 12 } as const;

export const MAX_NAME = 16;

export interface RosterEntry {
  readonly id: number;
  readonly name: string;
  readonly hue: number;
  readonly bot: boolean;
  readonly alive: boolean;
}

export type ClientMessage =
  | { readonly t: 'join'; readonly name: string; readonly hue: number }
  | { readonly t: 'respawn' }
  | { readonly t: 'view'; readonly x: number; readonly y: number }
  | { readonly t: 'input'; readonly x: number; readonly y: number }
  | { readonly t: 'split' }
  | { readonly t: 'eject' };

export type ServerMessage =
  | {
      readonly t: 'welcome';
      readonly id: number;
      readonly name: string;
      readonly hue: number;
      readonly world: number;
      readonly slots: number;
    }
  | { readonly t: 'roster'; readonly players: readonly RosterEntry[] }
  | { readonly t: 'dead'; readonly by: string }
  | { readonly t: 'respawned' }
  | { readonly t: 'full' };

export interface WireCell {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly mass: number;
  readonly vx: number;
  readonly vy: number;
  readonly mergeReady: boolean;
}

export interface WirePlayer {
  readonly id: number;
  readonly cells: readonly WireCell[];
}

export interface WireEvent {
  readonly kind: number;
  readonly cellId: number;
  readonly predatorId: number;
  readonly x: number;
  readonly y: number;
  readonly color: Rgb;
}

export interface WireFood {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly ejecta: boolean;
}

export interface WireCreature {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly kind: number;
  readonly angle: number;
  readonly color: Rgb;
  readonly phase: number;
}

export interface Snapshot {
  readonly tick: number;
  readonly players: readonly WirePlayer[];
  readonly events: readonly WireEvent[];
}

export interface FoodPacket {
  readonly tick: number;
  readonly food: readonly WireFood[];
}

export interface CreaturePacket {
  readonly tick: number;
  readonly creatures: readonly WireCreature[];
}
