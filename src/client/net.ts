import { ByteReader } from '../shared/bytes.ts';
import { decodeCreatures, decodeFood, decodeSnapshot } from '../shared/codec.ts';
import {
  Packet,
  type ClientMessage,
  type CreaturePacket,
  type FoodPacket,
  type RosterEntry,
  type ServerMessage,
  type Snapshot,
} from '../shared/protocol.ts';

export interface NetHandlers {
  readonly onOpen: () => void;
  readonly onClose: () => void;
  readonly onWelcome: (message: Extract<ServerMessage, { t: 'welcome' }>) => void;
  readonly onRoster: (players: readonly RosterEntry[]) => void;
  readonly onSnapshot: (snapshot: Snapshot) => void;
  readonly onFood: (packet: FoodPacket) => void;
  readonly onCreature: (packet: CreaturePacket) => void;
  readonly onDead: (by: string) => void;
  readonly onRespawned: () => void;
  readonly onFull: () => void;
}

interface Identity {
  readonly name: string;
  readonly hue: number;
}

export class Net {
  private readonly handlers: NetHandlers;
  private ws: WebSocket | null = null;
  private everJoined = false;
  private pendingJoin = false;
  private identity: Identity | null = null;
  private retry = 0;
  private closedByUs = false;

  constructor(handlers: NetHandlers) {
    this.handlers = handlers;
    this.connect();
  }

  private connect(): void {
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${scheme}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    ws.addEventListener('open', () => {
      this.onOpen();
    });
    ws.addEventListener('message', (event: MessageEvent<string | ArrayBuffer>) => {
      if (typeof event.data === 'string') this.handleText(event.data);
      else this.handleBinary(event.data);
    });
    ws.addEventListener('close', () => {
      this.onClose();
    });
    this.ws = ws;
  }

  private onOpen(): void {
    this.retry = 0;
    this.handlers.onOpen();
    if ((this.pendingJoin || this.everJoined) && this.identity) {
      this.send({ t: 'join', name: this.identity.name, hue: this.identity.hue });
    }
  }

  private onClose(): void {
    this.handlers.onClose();
    if (this.closedByUs) return;
    const delay = Math.min(8000, 800 + this.retry * 1200);
    this.retry += 1;
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private handleText(text: string): void {
    let message: ServerMessage;
    try {
      message = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    this.dispatch(message);
  }

  private dispatch(message: ServerMessage): void {
    switch (message.t) {
      case 'welcome':
        this.everJoined = true;
        this.pendingJoin = false;
        this.identity = { name: message.name, hue: message.hue };
        this.handlers.onWelcome(message);
        return;
      case 'roster':
        this.handlers.onRoster(message.players);
        return;
      case 'dead':
        this.handlers.onDead(message.by);
        return;
      case 'respawned':
        this.handlers.onRespawned();
        return;
      case 'full':
        this.pendingJoin = false;
        this.handlers.onFull();
        return;
    }
  }

  private handleBinary(buffer: ArrayBuffer): void {
    const reader = new ByteReader(new DataView(buffer));
    const type = reader.u8();
    if (type === Packet.Snapshot) this.handlers.onSnapshot(decodeSnapshot(reader));
    else if (type === Packet.Food) this.handlers.onFood(decodeFood(reader));
    else if (type === Packet.Creature) this.handlers.onCreature(decodeCreatures(reader));
  }

  private send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  join(name: string, hue: number): void {
    this.identity = { name, hue };
    this.pendingJoin = true;
    this.send({ t: 'join', name, hue });
  }

  input(x: number, y: number): void {
    this.send({ t: 'input', x: Math.round(x), y: Math.round(y) });
  }

  view(x: number, y: number): void {
    this.send({ t: 'view', x: Math.round(x), y: Math.round(y) });
  }

  split(): void {
    this.send({ t: 'split' });
  }

  eject(): void {
    this.send({ t: 'eject' });
  }

  respawn(): void {
    this.send({ t: 'respawn' });
  }

  close(): void {
    this.closedByUs = true;
    this.ws?.close();
  }
}
