import type { ByteReader } from './bytes.ts';
import { ByteWriter } from './bytes.ts';
import { clamp, TAU, type Rgb } from './math.ts';
import {
  Packet,
  type CreaturePacket,
  type FoodPacket,
  type Snapshot,
  type WireCell,
  type WireCreature,
  type WireEvent,
  type WireFood,
  type WirePlayer,
} from './protocol.ts';

const CELL_BYTES = 19;
const EVENT_BYTES = 15;
const FOOD_BYTES = 12;
const CREATURE_BYTES = 14;

interface CellSource {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly mass: number;
  readonly vx: number;
  readonly vy: number;
  readonly mergeAt: number;
}

interface PlayerSource {
  readonly id: number;
  readonly cells: readonly CellSource[];
}

interface FoodSource {
  readonly id: number;
  readonly variety: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly color: Rgb;
  readonly ejecta: boolean;
}

interface CreatureSource {
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

function coordinate(value: number): number {
  return clamp(Math.round(value), 0, 65535);
}

function writeRgb(writer: ByteWriter, color: Rgb): void {
  writer.u8(color[0]);
  writer.u8(color[1]);
  writer.u8(color[2]);
}

function writeCell(writer: ByteWriter, cell: CellSource, now: number): void {
  writer.u16(cell.id);
  writer.u16(coordinate(cell.x));
  writer.u16(coordinate(cell.y));
  writer.f32(cell.mass);
  writer.f32(cell.vx);
  writer.f32(cell.vy);
  writer.u8(cell.mergeAt > now ? 0 : 1);
}

function writeEvent(writer: ByteWriter, event: WireEvent): void {
  writer.u16(event.cellId);
  writer.u16(event.predatorId);
  writer.u16(coordinate(event.x));
  writer.u16(coordinate(event.y));
  writeRgb(writer, event.color);
  writer.u8(event.kind);
  writer.u16(clamp(Math.round(event.amount * 10), 0, 65535));
  writer.u8(clamp(Math.round(event.bonus * 50), 0, 255));
}

export function encodeSnapshot(
  tick: number,
  players: readonly PlayerSource[],
  events: readonly WireEvent[],
  now: number,
): Uint8Array {
  const cellCount = players.reduce((total, player) => total + player.cells.length, 0);
  const writer = new ByteWriter(6 + players.length * 3 + cellCount * CELL_BYTES + events.length * EVENT_BYTES);
  writer.u8(Packet.Snapshot);
  writer.u16(tick & 0xffff);
  writer.u8(players.length);
  for (const player of players) {
    writer.u16(player.id);
    writer.u8(player.cells.length);
    for (const cell of player.cells) writeCell(writer, cell, now);
  }
  writer.u16(events.length);
  for (const event of events) writeEvent(writer, event);
  return writer.bytes();
}

export function encodeFood(tick: number, food: readonly FoodSource[]): Uint8Array {
  const writer = new ByteWriter(5 + food.length * FOOD_BYTES);
  writer.u8(Packet.Food);
  writer.u16(tick & 0xffff);
  writer.u16(food.length);
  for (const item of food) {
    writer.u16(item.id);
    writer.u16(coordinate(item.x));
    writer.u16(coordinate(item.y));
    writer.u8(clamp(Math.round(item.radius), 1, 255));
    writeRgb(writer, item.color);
    writer.u8(item.ejecta ? 1 : 0);
    writer.u8(item.variety);
  }
  return writer.bytes();
}

function angleByte(angle: number): number {
  return clamp(Math.round(((((angle % TAU) + TAU) % TAU) / TAU) * 255), 0, 255);
}

export function encodeCreatures(tick: number, creatures: readonly CreatureSource[]): Uint8Array {
  const writer = new ByteWriter(5 + creatures.length * CREATURE_BYTES);
  writer.u8(Packet.Creature);
  writer.u16(tick & 0xffff);
  writer.u16(creatures.length);
  for (const creature of creatures) {
    writer.u16(creature.id);
    writer.u16(coordinate(creature.x));
    writer.u16(coordinate(creature.y));
    writer.u8(clamp(Math.round(creature.radius), 1, 255));
    writer.u8(creature.kind);
    writer.u8(angleByte(creature.angle));
    writeRgb(writer, creature.color);
    writer.u8(clamp(Math.round(creature.phase * 24) & 255, 0, 255));
    writer.u8(creature.state);
  }
  return writer.bytes();
}

function readCell(reader: ByteReader): WireCell {
  return {
    id: reader.u16(),
    x: reader.u16(),
    y: reader.u16(),
    mass: reader.f32(),
    vx: reader.f32(),
    vy: reader.f32(),
    mergeReady: reader.u8() === 1,
  };
}

function readPlayer(reader: ByteReader): WirePlayer {
  const id = reader.u16();
  const count = reader.u8();
  const cells: WireCell[] = [];
  for (let i = 0; i < count; i += 1) cells.push(readCell(reader));
  return { id, cells };
}

function readEvent(reader: ByteReader): WireEvent {
  const cellId = reader.u16();
  const predatorId = reader.u16();
  const x = reader.u16();
  const y = reader.u16();
  const color = reader.unitRgb();
  const kind = reader.u8();
  const amount = reader.u16() / 10;
  return { cellId, predatorId, x, y, color, kind, amount, bonus: reader.u8() / 50 };
}

function readList<T>(reader: ByteReader, count: number, read: (reader: ByteReader) => T): T[] {
  const items: T[] = [];
  for (let i = 0; i < count; i += 1) items.push(read(reader));
  return items;
}

export function decodeSnapshot(reader: ByteReader): Snapshot {
  const tick = reader.u16();
  const players = readList(reader, reader.u8(), readPlayer);
  const events = readList(reader, reader.u16(), readEvent);
  return { tick, players, events };
}

function readFood(reader: ByteReader): WireFood {
  return {
    id: reader.u16(),
    x: reader.u16(),
    y: reader.u16(),
    radius: reader.u8(),
    color: reader.unitRgb(),
    ejecta: reader.u8() === 1,
    variety: reader.u8(),
  };
}

export function decodeFood(reader: ByteReader): FoodPacket {
  const tick = reader.u16();
  return { tick, food: readList(reader, reader.u16(), readFood) };
}

function readCreature(reader: ByteReader): WireCreature {
  return {
    id: reader.u16(),
    x: reader.u16(),
    y: reader.u16(),
    radius: reader.u8(),
    kind: reader.u8(),
    angle: (reader.u8() / 255) * TAU,
    color: reader.unitRgb(),
    phase: reader.u8() / 24,
    state: reader.u8(),
  };
}

export function decodeCreatures(reader: ByteReader): CreaturePacket {
  const tick = reader.u16();
  return { tick, creatures: readList(reader, reader.u16(), readCreature) };
}
