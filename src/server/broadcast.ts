import { encodeFood, encodeSnapshot } from '../shared/codec.ts';
import { creaturePacket } from './life/creatures.ts';
import type { ServerMessage } from '../shared/protocol.ts';
import type { Client, Point } from './types.ts';
import { send, sendJson } from './transport.ts';
import { playerCenter, withinRange, world } from './world.ts';

const INTEREST = 3200;

function focus(client: Client): Point {
  return client.player?.cells.length ? playerCenter(client.player) : client.view;
}

export function snapshotPacket(client: Client, withEvents: boolean): Uint8Array {
  const center = focus(client);
  const players = [...world.players.values()]
    .map((player) => ({
      id: player.id,
      cells:
        player === client.player ? player.cells : player.cells.filter((cell) => withinRange(cell, center, INTEREST)),
    }))
    .filter((player) => player.cells.length > 0);
  const events = withEvents ? world.events.filter((event) => withinRange(event, center, INTEREST)) : [];
  return encodeSnapshot(world.tick, players, events, world.now);
}

function boardMessage(): ServerMessage {
  const masses = [...world.players.values()]
    .filter((player) => player.cells.length > 0)
    .map((player): [number, number] => [player.id, Math.round(player.cells.reduce((sum, cell) => sum + cell.mass, 0))]);
  return { t: 'board', masses };
}

export function foodPacket(client: Client): Uint8Array {
  const tracking = Boolean(client.player?.cells.length);
  const center = focus(client);
  const limit = tracking ? 2000 : 2600;
  const visible = [...world.foods.values()].filter((food) => withinRange(food, center, limit));
  return encodeFood(world.tick, visible);
}

export function sendPacket(client: Client, packet: Uint8Array): void {
  send(client.ws, packet);
}

export function broadcastSnapshots(): void {
  for (const client of world.clients) sendPacket(client, snapshotPacket(client, true));
  world.events.length = 0;
}

export function broadcastBoard(): void {
  const message = boardMessage();
  for (const client of world.clients) sendJson(client.ws, message);
}

export function broadcastFood(): void {
  for (const client of world.clients) sendPacket(client, foodPacket(client));
}

export function broadcastCreatures(): void {
  for (const client of world.clients) sendPacket(client, creaturePacket(client));
}
