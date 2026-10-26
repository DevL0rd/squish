import { CreatureState } from '../../shared/protocol.ts';
import { blockedAt } from '../obstacles.ts';
import type { Creature } from '../types.ts';
import { world } from '../world.ts';
import { bearing, foodsNear, nearestCell, nearestFood } from './senses.ts';
import type { Brain } from './species.ts';

type Think = (creature: Creature, dt: number) => number;

const THREAT_RANGE = 260;
const HUNT_RANGE = 520;
const FOOD_RANGE = 420;
const FEED_PULL = 170;

function enter(creature: Creature, state: number, seconds: number): void {
  creature.state = state;
  creature.stateUntil = world.now + seconds * 1000;
}

function expired(creature: Creature): boolean {
  return world.now >= creature.stateUntil;
}

function between(low: number, high: number): number {
  return low + Math.random() * (high - low);
}

function wander(creature: Creature, dt: number, rate: number): void {
  creature.heading += (Math.random() - 0.5) * rate * dt;
}

function threatened(creature: Creature, range = THREAT_RANGE): number | null {
  const threat = nearestCell(creature, range);
  return threat && threat.cell.radius > creature.radius ? bearing(threat.cell, creature) : null;
}

function bumped(creature: Creature): boolean {
  const ahead = {
    x: creature.x + Math.cos(creature.heading) * creature.radius * 1.4,
    y: creature.y + Math.sin(creature.heading) * creature.radius * 1.4,
  };
  return blockedAt(ahead, creature.radius * 0.5) || nearestCell(creature, creature.radius * 0.3) !== null;
}

function pullFood(creature: Creature, dt: number): void {
  for (const food of foodsNear(creature.x, creature.y, FEED_PULL)) {
    const angle = bearing(food, creature);
    food.vx += Math.cos(angle) * 60 * dt;
    food.vy += Math.sin(angle) * 60 * dt;
  }
}

const bacterium: Think = (creature) => {
  if (creature.state === CreatureState.Tumble) {
    if (!expired(creature)) return 0.15;
    const food = nearestFood(creature, FOOD_RANGE);
    const towards = food && Math.cos(bearing(creature, food) - creature.heading) > 0.4;
    enter(creature, CreatureState.Swim, towards ? between(2, 3.5) : between(0.8, 1.6));
    return 1;
  }
  if (!expired(creature)) return 1;
  enter(creature, CreatureState.Tumble, between(0.15, 0.4));
  creature.heading += (Math.random() - 0.5) * Math.PI * 1.6;
  return 0.15;
};

const coccus: Think = () => 0;

const ciliate: Think = (creature, dt) => {
  if (creature.state === CreatureState.Reverse) {
    if (!expired(creature)) return -0.8;
    creature.heading += (Math.random() < 0.5 ? -1 : 1) * between(1, 2);
    enter(creature, CreatureState.Swim, between(3, 6));
    return 1;
  }
  wander(creature, dt, 0.8);
  if (bumped(creature)) {
    enter(creature, CreatureState.Reverse, between(0.5, 0.9));
    return -0.8;
  }
  return 1;
};

const flagellate: Think = (creature, dt) => {
  wander(creature, dt, 1.2);
  if (!expired(creature)) return creature.state === CreatureState.Contract ? 0.15 : 1;
  const squirm = creature.state !== CreatureState.Contract && Math.random() < 0.3;
  enter(creature, squirm ? CreatureState.Contract : CreatureState.Swim, squirm ? between(2, 4) : between(6, 14));
  return 1;
};

const glider: Think = (creature) => {
  if (!expired(creature)) return creature.state === CreatureState.Reverse ? -1 : 1;
  enter(creature, creature.state === CreatureState.Reverse ? CreatureState.Swim : CreatureState.Reverse, between(4, 9));
  return 1;
};

const rotifer: Think = (creature, dt) => {
  const threat = threatened(creature);
  if (threat !== null && creature.state !== CreatureState.Flee) {
    creature.heading = threat;
    enter(creature, CreatureState.Flee, 1.4);
  }
  if (creature.state === CreatureState.Flee) {
    if (!expired(creature)) return 2.2;
    enter(creature, CreatureState.Swim, 4);
  }
  if (creature.state === CreatureState.Feed) {
    pullFood(creature, dt);
    if (expired(creature)) enter(creature, CreatureState.Swim, between(5, 9));
    return 0;
  }
  wander(creature, dt, 1);
  if (expired(creature)) enter(creature, CreatureState.Feed, between(6, 12));
  return 1;
};

const jumper: Think = (creature, dt) => {
  if (creature.state === CreatureState.Flee && !expired(creature)) return 7;
  const threat = threatened(creature, 300);
  if (threat !== null && world.now > creature.stateUntil + 500) {
    creature.heading = threat + (Math.random() - 0.5) * 0.8;
    enter(creature, CreatureState.Flee, 0.22);
    return 7;
  }
  if (creature.state === CreatureState.Flee) enter(creature, CreatureState.Swim, 0);
  wander(creature, dt, 3);
  return 0.45;
};

const roller: Think = (creature, dt) => {
  wander(creature, dt, 0.3);
  return 1;
};

const stentor: Think = (creature, dt) => {
  const threat = threatened(creature, 240);
  if (threat !== null && creature.state === CreatureState.Feed) {
    creature.heading = threat;
    enter(creature, CreatureState.Contract, 1.6);
  }
  if (creature.state === CreatureState.Contract) {
    if (expired(creature)) enter(creature, CreatureState.Swim, between(2.5, 4));
    return 0;
  }
  if (creature.state === CreatureState.Feed) {
    pullFood(creature, dt);
    return 0;
  }
  wander(creature, dt, 0.6);
  if (expired(creature)) enter(creature, CreatureState.Feed, between(12, 25));
  return 1;
};

const walker: Think = (creature, dt) => {
  const food = nearestFood(creature, FOOD_RANGE * 1.3);
  if (food) creature.heading = bearing(creature, food);
  else wander(creature, dt, 0.5);
  creature.state = food ? CreatureState.Hunt : CreatureState.Swim;
  return 1;
};

const hunter: Think = (creature, dt) => {
  const prey = nearestCell(creature, HUNT_RANGE);
  if (!prey) return bacterium(creature, dt);
  creature.state = CreatureState.Hunt;
  creature.heading = bearing(creature, prey.cell);
  return 1.2;
};

const drifter: Think = () => 0;

const phage: Think = (creature, dt) => {
  const host = nearestCell(creature, HUNT_RANGE);
  if (!host) {
    creature.state = CreatureState.Swim;
    wander(creature, dt, 1);
    return 0.15;
  }
  creature.state = CreatureState.Hunt;
  creature.heading = bearing(creature, host.cell);
  return 1;
};

export const BRAINS: Readonly<Record<Brain, Think>> = {
  bacterium,
  coccus,
  ciliate,
  flagellate,
  glider,
  rotifer,
  jumper,
  roller,
  stentor,
  walker,
  hunter,
  drifter,
  phage,
};
