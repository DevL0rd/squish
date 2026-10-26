import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affinity, NEUTRAL_PIGMENT } from '../src/server/pigment.ts';

await test('matching color gives the full bonus', () => {
  assert.ok(affinity([40, 200, 60], [50, 210, 70]) > 0.95);
});

await test('opposite color gives no bonus', () => {
  assert.equal(affinity([40, 200, 60], [200, 40, 190]), 0);
});

await test('a neutral cell gets no bonus', () => {
  assert.ok(affinity(NEUTRAL_PIGMENT, [40, 200, 60]) < 0.05);
});
