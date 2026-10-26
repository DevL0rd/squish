import { encodeFood, encodeSnapshot } from '../shared/codec.ts';
import { creaturePacket } from './creatures.ts';
import type { Client } from './types.ts';
import { send } from './transport.ts';
import { playerCenter, withinRange, world } from './world.ts';

export function snapshotPacket(withEvents: boolean): Uint8Array {
  const active = [...world.players.values()].filter((player) => player.cells.length > 0);
  return encodeSnapshot(world.tick, active, withEvents ? world.events : [], world.now);
}

export function foodPacket(client: Client): Uint8Array {
  const tracking = Boolean(client.player?.cells.length);
  const center = client.player && tracking ? playerCenter(client.player) : client.view;
  const limit = tracking ? 2000 : 2600;
  const visible = [...world.foods.values()].filter((food) => withinRange(food, center, limit));
  return encodeFood(world.tick, visible);
}

export function sendPacket(client: Client, packet: Uint8Array): void {
  send(client.ws, packet);
}

export function broadcastSnapshots(): void {
  const packet = snapshotPacket(true);
  world.events.length = 0;
  for (const client of world.clients) sendPacket(client, packet);
}

export function broadcastFood(): void {
  for (const client of world.clients) sendPacket(client, foodPacket(client));
}

export function broadcastCreatures(): void {
  for (const client of world.clients) sendPacket(client, creaturePacket(client));
}
