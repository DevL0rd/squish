import {
  BOMB_RANGE,
  DART_RANGE,
  pulseReach,
  rotate,
  spreadAngle,
  VOLLEY_RANGE,
  VOLLEY_THREADS,
} from '../../shared/combat.ts';
import { radiusFor } from '../../shared/math.ts';
import { EventKind } from '../../shared/protocol.ts';
import { aimFrom, ejectMass } from '../actions.ts';
import { damageBoss } from '../hazards/events.ts';
import { Behavior, speciesOf } from '../life/species.ts';
import { pushVirus } from '../life/viruses.ts';
import type { Cell, Player, Point } from '../types.ts';
import { biggestCell, emit, world } from '../world.ts';
import { addCloud, addBurn } from './clouds.ts';
import { along, enemies, strikeCell, type Blow } from './strike.ts';

interface Shot {
  readonly player: Player;
  readonly cell: Cell;
  readonly aim: Point;
}

interface Weapon {
  readonly cost: number;
  readonly cooldown: number;
  readonly fire: (shot: Shot) => Point[];
}

const STEP = 30;
const VIRUS_GROWTH = 140;

const THREAD: Blow = { wound: 0.1, chip: 0.08 };
const DART: Blow = { wound: 0.3, chip: 0.2 };

interface Impact {
  readonly t: number;
  readonly apply: () => void;
}

function bossAlong(origin: Point, aim: Point, range: number, width: number, damage: number): number | null {
  for (let d = 0; d <= range; d += STEP) {
    if (damageBoss({ x: origin.x + aim.x * d, y: origin.y + aim.y * d }, width, damage)) return d;
  }
  return null;
}

function virusImpacts(origin: Point, aim: Point, range: number): Impact[] {
  const impacts: Impact[] = [];
  for (const creature of world.creatures.values()) {
    if (speciesOf(creature.kind).behavior !== Behavior.Virus) continue;
    const t = along(origin, aim, creature, range, creature.radius);
    if (t !== null) {
      impacts.push({
        t,
        apply: () => {
          pushVirus(creature, origin, VIRUS_GROWTH);
        },
      });
    }
  }
  return impacts;
}

function cellImpacts(shot: Shot, aim: Point, range: number, blow: Blow): Impact[] {
  const impacts: Impact[] = [];
  for (const target of enemies(shot.player)) {
    const t = along(shot.cell, aim, target.cell, range, target.cell.radius + 6);
    if (t !== null) {
      impacts.push({
        t: Math.max(0, t - target.cell.radius * 0.6),
        apply: () => {
          strikeCell(target, aim, blow);
        },
      });
    }
  }
  return impacts.sort((a, b) => a.t - b.t);
}

function point(shot: Shot, aim: Point, distance: number): Point {
  return { x: shot.cell.x + aim.x * distance, y: shot.cell.y + aim.y * distance };
}

function thread(shot: Shot, aim: Point, range: number): Point {
  const impacts = [...cellImpacts(shot, aim, range, THREAD), ...virusImpacts(shot.cell, aim, range)];
  const first = impacts.reduce<Impact | null>((best, impact) => (best && best.t <= impact.t ? best : impact), null);
  if (first) {
    first.apply();
    return point(shot, aim, first.t);
  }
  const boss = bossAlong(shot.cell, aim, range, 8, 0.004);
  if (boss === null) return point(shot, aim, range);
  addBurn(0.001, 5000);
  return point(shot, aim, boss);
}

function volley(shot: Shot): Point[] {
  const range = VOLLEY_RANGE + shot.cell.radius;
  return Array.from({ length: VOLLEY_THREADS }, (_, i) => thread(shot, rotate(shot.aim, spreadAngle(i)), range));
}

function dart(shot: Shot): Point[] {
  const boss = bossAlong(shot.cell, shot.aim, DART_RANGE + shot.cell.radius, 12, 0.03);
  const range = boss ?? DART_RANGE + shot.cell.radius;
  for (const impact of [...cellImpacts(shot, shot.aim, range, DART), ...virusImpacts(shot.cell, shot.aim, range)]) {
    impact.apply();
  }
  return [point(shot, shot.aim, range)];
}

function pulse(shot: Shot): Point[] {
  const { cell } = shot;
  const reach = pulseReach(cell.radius);
  for (const target of enemies(shot.player)) {
    const dx = target.cell.x - cell.x;
    const dy = target.cell.y - cell.y;
    const distance = Math.hypot(dx, dy) || 1;
    if (distance > reach + target.cell.radius) continue;
    const blow = { wound: 0.35, chip: target.cell.mass > 80 ? 0.4 : 0, shove: 650 };
    strikeCell(target, { x: dx / distance, y: dy / distance }, blow);
  }
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    if (damageBoss({ x: cell.x + Math.cos(angle) * reach, y: cell.y + Math.sin(angle) * reach }, 40, 0.03)) break;
  }
  return [{ x: cell.x, y: cell.y }];
}

function bomb(shot: Shot): Point[] {
  const { cell, player } = shot;
  const distance = Math.min(BOMB_RANGE, Math.hypot(player.target.x - cell.x, player.target.y - cell.y));
  const landing = { x: cell.x + shot.aim.x * distance, y: cell.y + shot.aim.y * distance };
  addCloud(player, landing);
  return [landing];
}

const WEAPONS: readonly (Weapon | null)[] = [
  null,
  { cost: 6, cooldown: 700, fire: volley },
  { cost: 12, cooldown: 1100, fire: dart },
  { cost: 20, cooldown: 1700, fire: pulse },
  { cost: 30, cooldown: 2200, fire: bomb },
];

function fireFrom(player: Player, cell: Cell, level: number, weapon: Weapon): void {
  cell.mass -= weapon.cost;
  cell.radius = radiusFor(cell.mass);
  const aim = aimFrom(player, cell);
  for (const end of weapon.fire({ player, cell, aim })) {
    emit({
      kind: EventKind.Attack,
      cellId: cell.id,
      predatorId: level,
      x: end.x,
      y: end.y,
      color: cell.pigment,
      amount: cell.radius,
    });
  }
}

export function attack(player: Player): void {
  const weapon = WEAPONS[player.level - 1];
  if (!weapon) {
    ejectMass(player);
    return;
  }
  if (world.now - player.lastEject < weapon.cooldown) return;
  player.lastEject = world.now;
  const cell = biggestCell({ ...player, cells: player.cells.filter((item) => item.gut < 0) });
  if (cell && cell.mass >= weapon.cost * 4) fireFrom(player, cell, player.level, weapon);
}
