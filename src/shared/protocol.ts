import type { Rgb } from './math.ts';

export const Packet = { Snapshot: 1, Food: 2, Creature: 3, Hazard: 4 } as const;

export const BossKind = { None: 0, Nematode: 1, Spirostomum: 2, Oligochaete: 3, Physarum: 4 } as const;

export const SpotPhase = { Roam: 0, Focus: 1, Strike: 2, Fade: 3 } as const;

export const EventKind = {
  Eat: 1,
  Split: 3,
  Merge: 4,
  Spit: 5,
  CreatureFirst: 6,
  CreatureLast: 19,
  InfectionFirst: 20,
  InfectionLast: 24,
  Pop: 25,
  Burst: 26,
  Pipette: 27,
  Swallowed: 28,
  Boost: 29,
  LevelUp: 30,
  Attack: 31,
  Hit: 32,
  Toxin: 33,
} as const;

export const ObstacleKind = { Grain: 0, Fiber: 1, Bubble: 2 } as const;

export interface ObstacleShape {
  readonly id: number;
  readonly kind: number;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly seed: number;
}

export type ObstacleDrift = readonly [number, number, number, number];

export const CreatureState = {
  Swim: 0,
  Tumble: 1,
  Flee: 2,
  Hunt: 3,
  Feed: 4,
  Contract: 5,
  Divide: 6,
  Latch: 7,
  Reverse: 8,
} as const;

export const FoodVariety = { Algae: 0, Plant: 1, Detritus: 2, Pollen: 3, Vesicle: 4 } as const;

export interface InfectionInfo {
  readonly label: string;
  readonly duration: number;
  readonly good: boolean;
}

export const Infection = { Parasite: 0, Swift: 1, Bloom: 2, Sluggish: 3, Lysis: 4 } as const;

export const INFECTIONS: readonly InfectionInfo[] = [
  { label: 'Bdellovibrio is eating you from inside', duration: 16, good: false },
  { label: 'Phage injection: faster', duration: 12, good: true },
  { label: 'Phage injection: growing', duration: 12, good: true },
  { label: 'Phage injection: sluggish, slower', duration: 10, good: false },
  { label: 'Phage injection: leaking mass', duration: 10, good: false },
];

export const MAX_NAME = 16;

export interface RosterEntry {
  readonly id: number;
  readonly name: string;
  readonly hue: number;
  readonly bot: boolean;
  readonly alive: boolean;
}

export const AdminAction = {
  Boss: 0,
  EndBoss: 1,
  Pipette: 2,
  Rapid: 3,
  Creature: 4,
  Food: 5,
  Infect: 6,
  Mass: 7,
  Teleport: 8,
  Visit: 9,
} as const;

export const ATTACKS = [
  'Vesicle spit',
  'Trichocyst volley',
  'Toxicyst dart',
  'Osmotic pulse',
  'Lysosome bomb',
] as const;

export const BOSS_NAMES = ['Nematode', 'Spirostomum', 'Bristle worm', 'Slime mold'] as const;

export interface AdminCatalog {
  readonly species: readonly string[];
}

export type ClientMessage =
  | { readonly t: 'join'; readonly name: string; readonly hue: number }
  | { readonly t: 'respawn' }
  | { readonly t: 'view'; readonly x: number; readonly y: number }
  | { readonly t: 'input'; readonly x: number; readonly y: number }
  | { readonly t: 'split' }
  | { readonly t: 'eject' }
  | { readonly t: 'boost' }
  | { readonly t: 'admin'; readonly action: number; readonly arg: number };

export type ServerMessage =
  | {
      readonly t: 'welcome';
      readonly id: number;
      readonly name: string;
      readonly hue: number;
      readonly world: number;
      readonly slots: number;
      readonly admin: AdminCatalog | null;
    }
  | { readonly t: 'roster'; readonly players: readonly RosterEntry[] }
  | { readonly t: 'dead'; readonly by: string }
  | { readonly t: 'respawned' }
  | { readonly t: 'boost'; readonly charge: number }
  | { readonly t: 'progress'; readonly level: number; readonly defense: number }
  | { readonly t: 'full' }
  | { readonly t: 'announce'; readonly text: string; readonly danger: boolean }
  | { readonly t: 'obstacles'; readonly items: readonly ObstacleShape[] }
  | { readonly t: 'drift'; readonly items: readonly ObstacleDrift[] };

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
  readonly amount: number;
  readonly bonus: number;
  readonly cellId: number;
  readonly predatorId: number;
  readonly x: number;
  readonly y: number;
  readonly color: Rgb;
}

export interface WireFood {
  readonly id: number;
  readonly variety: number;
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
  readonly state: number;
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

export interface WireSpot {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly phase: number;
  readonly progress: number;
  readonly target: number;
}

export interface WireJoint {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

export interface WireBoss {
  readonly kind: number;
  readonly state: number;
  readonly progress: number;
  readonly health: number;
  readonly chains: readonly (readonly WireJoint[])[];
}

export interface HazardPacket {
  readonly spot: WireSpot | null;
  readonly boss: WireBoss | null;
}
