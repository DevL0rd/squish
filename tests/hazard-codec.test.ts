import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ByteReader } from '../src/shared/bytes.ts';
import { decodeHazards, encodeHazards } from '../src/shared/hazard-codec.ts';
import { Packet } from '../src/shared/protocol.ts';

await test('hazard packet round trip keeps the spotlights and boss chains', () => {
  const packet = {
    spots: [
      { x: 100, y: 200, radius: 300, phase: 1, progress: 0.5, target: 42, tool: 2, angle: 0 },
      { x: 900, y: 800, radius: 170, phase: 2, progress: 0.25, target: 7, tool: 1, angle: 0 },
    ],
    boss: {
      kind: 1,
      state: 2,
      progress: 1,
      health: 1,
      chains: [
        [
          { x: 1, y: 2, r: 30 },
          { x: 4, y: 5, r: 60 },
        ],
      ],
    },
  };
  const bytes = encodeHazards(packet);
  const reader = new ByteReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  assert.equal(reader.u8(), Packet.Hazard);
  const decoded = decodeHazards(reader);
  assert.deepEqual(decoded.boss, packet.boss);
  const [first, second] = decoded.spots;
  assert.ok(first && second);
  assert.equal(first.target, 42);
  assert.ok(Math.abs(first.progress - 0.5) < 0.01);
  assert.equal(second.target, 7);
});

await test('empty hazard packet decodes to nothing', () => {
  const bytes = encodeHazards({ spots: [], boss: null });
  const reader = new ByteReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  reader.u8();
  assert.deepEqual(decodeHazards(reader), { spots: [], boss: null });
});
