import { radiusFor } from '../../shared/math.ts';
import { EventKind, Infection, CreatureState } from '../../shared/protocol.ts';
import { burstCell } from '../actions.ts';
import { chargeBoost } from '../boost.ts';
import { shoveApart } from '../physics.ts';
import { armorFrom } from '../progress.ts';
import { infect, randomPhage } from '../infection.ts';
import { ingest } from '../pigment.ts';
import type { Cell, Creature } from '../types.ts';
import { emit, withinRange, world } from '../world.ts';
import { cellsNear, findCell, nearestCell } from './senses.ts';
import { Behavior, speciesOf } from './species.ts';

const LATCH_TIME = 1000;
const EDIBLE_RATIO = 1.35;
const VIRUS_MASS = 0.5;
const CREATURE_VALUE = 0.7;
const CELL_SOFTNESS = 0.35;

function latchOn(creature: Creature): boolean {
  const host = nearestCell(creature, 0);
  if (!host) return false;
  creature.hostId = host.cell.id;
  creature.latchAngle = Math.atan2(creature.y - host.cell.y, creature.x - host.cell.x);
  creature.state = CreatureState.Latch;
  creature.stateUntil = world.now + LATCH_TIME;
  return false;
}

export function holdLatch(creature: Creature): boolean {
  const host = findCell(creature.hostId);
  if (!host) {
    creature.hostId = 0;
    creature.state = CreatureState.Swim;
    return false;
  }
  const reach = host.cell.radius + creature.radius * 0.75;
  creature.x = host.cell.x + Math.cos(creature.latchAngle) * reach;
  creature.y = host.cell.y + Math.sin(creature.latchAngle) * reach;
  creature.angle = creature.latchAngle + Math.PI;
  if (world.now < creature.stateUntil) return false;
  const { cell, player } = host;
  emit({
    kind: EventKind.Burst,
    cellId: cell.id,
    predatorId: 0,
    x: creature.x,
    y: creature.y,
    color: creature.color,
  });
  infect(player, cell, randomPhage(), creature.color);
  return true;
}

function parasitize(creature: Creature): boolean {
  const host = nearestCell(creature, 0);
  if (!host) return false;
  infect(host.player, host.cell, Infection.Parasite, creature.color);
  return true;
}

function touchVirus(creature: Creature): boolean {
  const host = nearestCell(creature, -creature.radius * 0.25);
  if (!host) return false;
  if (host.cell.radius > creature.radius * 1.15) {
    const gained = (creature.radius / 5.2) ** 2 * VIRUS_MASS;
    host.cell.mass += gained;
    host.cell.radius = radiusFor(host.cell.mass);
    burstCell(host.player, host.cell);
    emit({
      kind: EventKind.Pop,
      cellId: host.cell.id,
      predatorId: 0,
      x: creature.x,
      y: creature.y,
      color: creature.color,
      amount: gained,
    });
    return true;
  }
  const dx = host.cell.x - creature.x;
  const dy = host.cell.y - creature.y;
  const distance = Math.hypot(dx, dy) || 1;
  const overlap = host.cell.radius + creature.radius - distance;
  host.cell.x += (dx / distance) * overlap;
  host.cell.y += (dy / distance) * overlap;
  return false;
}

function swallowedBy(creature: Creature): Cell | undefined {
  const fits = (cell: Cell): boolean =>
    cell.radius >= creature.radius * EDIBLE_RATIO && withinRange(creature, cell, cell.radius * 0.96);
  return cellsNear(creature.x, creature.y, 0).find((member) => fits(member.cell))?.cell;
}

function bump(creature: Creature): void {
  const near = nearestCell(creature, creature.radius);
  if (!near || near.cell.radius >= creature.radius * EDIBLE_RATIO) return;
  shoveApart(near.cell, near.cell.mass, creature, (creature.radius / 5.2) ** 2, CELL_SOFTNESS);
}

function eaten(creature: Creature): boolean {
  const predator = swallowedBy(creature);
  if (!predator) {
    bump(creature);
    return false;
  }
  const base = (creature.radius / 5.2) ** 2 * CREATURE_VALUE;
  const gained = ingest(predator, creature.color, base);
  predator.mass += gained;
  predator.digesting += gained * 2.4;
  chargeBoost(predator, creature.radius);
  armorFrom(predator, speciesOf(creature.kind).name);
  emit({
    kind: EventKind.CreatureFirst + creature.kind,
    cellId: predator.id,
    predatorId: predator.id,
    x: creature.x,
    y: creature.y,
    color: creature.color,
    amount: gained,
    bonus: gained / base,
  });
  return true;
}

export function resolveContact(creature: Creature): boolean {
  const behavior = speciesOf(creature.kind).behavior;
  if (behavior === Behavior.Virus) return touchVirus(creature);
  if (behavior === Behavior.Parasite) return parasitize(creature);
  if (behavior === Behavior.Injector) return latchOn(creature);
  return eaten(creature);
}
