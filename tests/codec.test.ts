import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ByteReader } from '../src/shared/bytes.ts';
import {
  decodeCreatures,
  decodeFood,
  decodeSnapshot,
  encodeCreatures,
  encodeFood,
  encodeSnapshot,
} from '../src/shared/codec.ts';
import { Packet } from '../src/shared/protocol.ts';

function reader(bytes: Uint8Array, type: number): ByteReader {
  const result = new ByteReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  assert.equal(result.u8(), type);
  return result;
}

await test('snapshot round trip keeps cells and events', () => {
  const cell = { id: 7, x: 100.4, y: 4000.6, mass: 55.5, vx: 3, vy: -2, mergeAt: 50 };
  const event = {
    kind: 4,
    cellId: 7,
    predatorId: 9,
    x: 12,
    y: 13,
    color: [255, 0, 51] as const,
    amount: 2.5,
    bonus: 1.4,
  };
  const bytes = encodeSnapshot(70000, [{ id: 3, cells: [cell] }], [event], 100);
  const snapshot = decodeSnapshot(reader(bytes, Packet.Snapshot));
  assert.equal(snapshot.tick, 70000 & 0xffff);
  assert.deepEqual(snapshot.players, [
    { id: 3, cells: [{ id: 7, x: 100, y: 4001, mass: 55.5, vx: 3, vy: -2, mergeReady: true }] },
  ]);
  assert.deepEqual(snapshot.events, [
    { kind: 4, cellId: 7, predatorId: 9, x: 12, y: 13, color: [1, 0, 0.2], amount: 2.5, bonus: 1.4 },
  ]);
});

await test('food round trip clamps radius and keeps ejecta flag', () => {
  const food = { id: 70000, variety: 3, x: -5, y: 70000, radius: 90000, color: [0, 255, 0] as const, ejecta: true };
  const packet = decodeFood(reader(encodeFood(1, [food]), Packet.Food));
  assert.deepEqual(packet.food, [
    { id: 70000, variety: 3, x: 0, y: 65535, radius: 65535, color: [0, 1, 0], ejecta: true },
  ]);
});

await test('creature round trip quantizes angle and phase', () => {
  const creature = {
    id: 1,
    x: 10,
    y: 20,
    radius: 6,
    kind: 2,
    angle: Math.PI,
    color: [0, 0, 255] as const,
    phase: 2,
    state: 7,
  };
  const packet = decodeCreatures(reader(encodeCreatures(5, [creature]), Packet.Creature));
  const decoded = packet.creatures[0];
  assert.ok(decoded);
  assert.equal(decoded.kind, 2);
  assert.equal(decoded.phase, 2);
  assert.equal(decoded.state, 7);
  assert.ok(Math.abs(decoded.angle - Math.PI) < 0.03);
});
