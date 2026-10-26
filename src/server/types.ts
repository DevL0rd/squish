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
}

export interface Player {
  readonly id: number;
  readonly name: string;
  readonly hue: number;
  readonly bot: boolean;
  readonly ws: WebSocket | null;
  cells: Cell[];
  readonly target: Point;
  alive: boolean;
  graceUntil: number;
  respawnAt: number;
  lastSplit: number;
  lastEject: number;
  lastKiller: string | null;
  readonly wanderPhase: number;
}

export interface Food extends Point {
  readonly id: number;
  vx: number;
  vy: number;
  readonly mass: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly ejecta: boolean;
  readonly owner: number;
  readonly born: number;
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
}

export interface Client {
  readonly ws: WebSocket;
  player: Player | null;
  view: Point;
}

export interface Member {
  readonly player: Player;
  readonly cell: Cell;
}
