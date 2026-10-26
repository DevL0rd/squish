import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ByteReader } from '../src/shared/bytes.ts';
import { decodeHazards, encodeHazards } from '../src/shared/hazard-codec.ts';
import { Packet } from '../src/shared/protocol.ts';

await test('hazard packet round trip keeps the spotlight and boss chains', () => {
  const packet = {
    spot: { x: 100, y: 200, radius: 300, phase: 1, progress: 0.5, target: 42, tool: 2, angle: 0 },
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
  const { spot } = decoded;
  assert.ok(spot);
  assert.equal(spot.target, 42);
  assert.ok(Math.abs(spot.progress - 0.5) < 0.01);
});

await test('empty hazard packet decodes to nothing', () => {
  const bytes = encodeHazards({ spot: null, boss: null });
  const reader = new ByteReader(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  reader.u8();
  assert.deepEqual(decodeHazards(reader), { spot: null, boss: null });
});
