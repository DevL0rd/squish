import type { BotMind } from './bots/mind.ts';
import type { WebSocket } from 'ws';
import type { Rgb } from '../shared/math.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Cell extends Point {
  readonly id: number;
  vx: number;
  vy: number;
  mass: number;
  radius: number;
  mergeAt: number;
  boostX: number;
  boostY: number;
  parasites: number[];
  digesting: number;
  pigment: Rgb;
  gut: number;
  wounds: number;
  heldUntil: number;
}

export interface Player {
  readonly id: number;
  readonly name: string;
  readonly hue: number;
  readonly bot: boolean;
  readonly admin: boolean;
  readonly mind: BotMind | null;
  readonly ws: WebSocket | null;
  cells: Cell[];
  readonly target: Point;
  alive: boolean;
  graceUntil: number;
  respawnAt: number;
  lastSplit: number;
  lastEject: number;
  lastKiller: string | null;
  effects: Effect[];
  boost: number;
  level: number;
  defense: number;
  readonly wanderPhase: number;
}

interface Effect {
  readonly type: number;
  readonly until: number;
}

export interface Food extends Point {
  readonly id: number;
  readonly variety: number;
  vx: number;
  vy: number;
  readonly mass: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly ejecta: boolean;
  readonly owner: number;
  readonly born: number;
  flowX: number;
  flowY: number;
}

export interface Creature extends Point {
  readonly id: number;
  readonly kind: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  phase: number;
  energy: number;
  color: Rgb;
  state: number;
  stateUntil: number;
  heading: number;
  divideAt: number;
  hostId: number;
  latchAngle: number;
  baseRadius: number;
  feeds: number;
}

export interface Client {
  readonly ws: WebSocket;
  readonly local: boolean;
  player: Player | null;
  view: Point;
}

export interface Member {
  readonly player: Player;
  readonly cell: Cell;
}
