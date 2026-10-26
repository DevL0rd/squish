import { hslToRgb, pareto, regionalHue } from '../../shared/math.ts';
import { CreatureState } from '../../shared/protocol.ts';
import type { Creature } from '../types.ts';
import { nextId, toBytes, world } from '../world.ts';
import { Behavior, speciesOf } from './species.ts';

const REGION_BLEND = 0.65;
const SIZE_TAIL = 3.4;
const SIZE_LIMIT = 9;

export function doublingTime(): number {
  return 20000 + Math.random() * 20000;
}

export function spawnCreature(kind: number, x: number, y: number, overrides: Partial<Creature> = {}): Creature {
  const meta = speciesOf(kind);
  const heading = Math.random() * Math.PI * 2;
  const hue = regionalHue(x, y, meta.hue, meta.behavior === Behavior.Drift ? REGION_BLEND : 0);
  const scale = meta.behavior === Behavior.Virus ? 1 : pareto(Math.random, SIZE_TAIL, SIZE_LIMIT);
  const radius = meta.size * scale * (meta.spread[0] + Math.random() * (meta.spread[1] - meta.spread[0]));
  const creature: Creature = {
    id: nextId('creature'),
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    baseRadius: radius,
    feeds: 0,
    angle: heading,
    heading,
    phase: Math.random() * Math.PI * 2,
    energy: 0.4 + Math.random() * 0.6,
    color: toBytes(hslToRgb(hue + (Math.random() * 16 - 8), meta.saturation, meta.lightness)),
    state: CreatureState.Swim,
    stateUntil: world.now + Math.random() * 4000,
    divideAt: world.now + doublingTime(),
    hostId: 0,
    latchAngle: 0,
    ...overrides,
  };
  world.creatures.set(creature.id, creature);
  return creature;
}
