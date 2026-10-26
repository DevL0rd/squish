import { CLOUD_DELAY, CLOUD_LIFE, CLOUD_RADIUS } from '../../shared/combat.ts';
import { radiusFor } from '../../shared/math.ts';
import { damageBoss, woundBoss } from '../hazards/events.ts';
import type { Player, Point } from '../types.ts';
import { emit, world } from '../world.ts';
import { EventKind } from '../../shared/protocol.ts';
import { enemies, woundCell } from './strike.ts';

const CLOUD_WOUND = 0.3;
const CLOUD_DRAIN = 0.04;
const CLOUD_BOSS = 0.03;
const HEAL_RATE = 0.06;
const TOXIN_COLOR: readonly [number, number, number] = [140, 90, 150];

interface Cloud {
  readonly owner: Player | null;
  readonly radius: number;
  readonly at: Point;
  readonly start: number;
  readonly end: number;
}

interface Burn {
  readonly rate: number;
  readonly end: number;
}

let clouds: Cloud[] = [];
let burns: Burn[] = [];

export function addCloud(owner: Player, at: Point): void {
  clouds.push({
    owner,
    at,
    radius: CLOUD_RADIUS,
    start: world.now + CLOUD_DELAY,
    end: world.now + CLOUD_DELAY + CLOUD_LIFE,
  });
}

export function addToxin(at: Point, radius: number, life: number): void {
  clouds.push({ owner: null, at, radius, start: world.now, end: world.now + life });
  emit({ kind: EventKind.Toxin, cellId: 0, predatorId: 0, x: at.x, y: at.y, color: TOXIN_COLOR, amount: radius });
}

export function cloudZones(): readonly { readonly at: Point; readonly radius: number }[] {
  return clouds.filter((cloud) => world.now >= cloud.start - CLOUD_DELAY);
}

export function addBurn(rate: number, duration: number): void {
  burns.push({ rate, end: world.now + duration });
}

function soak(cloud: Cloud, dt: number): void {
  for (const target of enemies(cloud.owner)) {
    const distance = Math.hypot(target.cell.x - cloud.at.x, target.cell.y - cloud.at.y);
    if (distance > cloud.radius + target.cell.radius) continue;
    target.cell.mass *= 1 - CLOUD_DRAIN * dt * (1 - target.player.defense);
    target.cell.radius = radiusFor(target.cell.mass);
    woundCell(target, CLOUD_WOUND * dt);
  }
  if (cloud.owner) damageBoss(cloud.at, cloud.radius, CLOUD_BOSS * dt);
}

export function updateCombat(dt: number): void {
  clouds = clouds.filter((cloud) => world.now < cloud.end);
  for (const cloud of clouds) if (world.now >= cloud.start) soak(cloud, dt);
  burns = burns.filter((burn) => world.now < burn.end);
  const burning = burns.reduce((sum, burn) => sum + burn.rate, 0);
  if (burning > 0) woundBoss(burning * dt);
  for (const player of world.players.values()) {
    for (const cell of player.cells) cell.wounds = Math.max(0, cell.wounds - HEAL_RATE * dt);
  }
}
