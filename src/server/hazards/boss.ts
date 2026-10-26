import { clamp, type Rgb } from '../../shared/math.ts';
import { FoodVariety, type WireBoss } from '../../shared/protocol.ts';
import { addFood } from '../food.ts';
import type { Point } from '../types.ts';
import { allMembers, world } from '../world.ts';
import { nearestOnChain, pushOut, type Body, type Chain } from './chain.ts';
import { foodsNear } from '../life/senses.ts';

export abstract class Boss {
  protected health = 1;

  abstract update(dt: number): void;
  abstract wire(): WireBoss;
  abstract done(): boolean;
  abstract slowdown(x: number, y: number): number;
  protected abstract bodies(): readonly Chain[];
  protected abstract die(): void;

  touches(point: Point, radius: number): boolean {
    if (this.health <= 0) return false;
    return this.bodies().some((chain) => {
      const hit = nearestOnChain(chain, point);
      return hit !== null && hit.distance < hit.radius + radius;
    });
  }

  closest(point: Point): { x: number; y: number; gap: number } | null {
    let best: { x: number; y: number; gap: number } | null = null;
    for (const chain of this.bodies()) {
      const hit = nearestOnChain(chain, point);
      if (!hit || (best && hit.distance - hit.radius >= best.gap)) continue;
      best = { x: point.x - hit.nx * hit.distance, y: point.y - hit.ny * hit.distance, gap: hit.distance - hit.radius };
    }
    return best;
  }

  wound(amount: number): void {
    if (this.health <= 0) return;
    this.health -= amount;
    if (this.health <= 0) this.die();
  }

  protected vitality(): number {
    return clamp(this.health, 0, 1);
  }
}

const REMAINS_STRIDE = 6;

export function dissolveChain(chain: Chain, color: Rgb, varieties: readonly number[]): void {
  for (const [i, point] of chain.points.entries()) {
    if (i % REMAINS_STRIDE) continue;
    const variety = varieties[(i / REMAINS_STRIDE) % varieties.length] ?? FoodVariety.Detritus;
    addFood({ x: point.x + (Math.random() - 0.5) * 80, y: point.y + (Math.random() - 0.5) * 80, variety, color });
  }
}

export function joints(chain: Chain): { x: number; y: number; r: number }[] {
  return chain.points.map((point, i) => ({ x: point.x, y: point.y, r: chain.radii[i] ?? 0 }));
}

export function tail(chain: Chain, from: number): Chain {
  return { points: chain.points.slice(from), radii: chain.radii.slice(from) };
}

export function shove(chain: Chain, velocity: { x: number; y: number }, damage: (mass: number) => void): void {
  for (const { cell } of allMembers()) {
    if (cell.gut >= 0) continue;
    if (pushOut(chain, cell, velocity)) damage(cell.mass);
  }
  for (const body of bodiesNear(chain)) pushOut(chain, body, velocity);
}

const BODY_SLACK = 60;

function bodiesNear(chain: Chain): Set<Body> {
  const found = new Set<Body>();
  chain.points.forEach((point, i) => {
    const reach = (chain.radii[i] ?? 0) + BODY_SLACK;
    for (const food of foodsNear(point.x, point.y, reach)) found.add(food);
  });
  const [minX, minY, maxX, maxY] = bounds(chain);
  for (const creature of world.creatures.values()) {
    if (creature.x > minX && creature.x < maxX && creature.y > minY && creature.y < maxY) found.add(creature);
  }
  return found;
}

function bounds(chain: Chain): [number, number, number, number] {
  const slack = Math.max(0, ...chain.radii) + BODY_SLACK;
  let box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const point of chain.points) {
    box = [Math.min(box[0], point.x), Math.min(box[1], point.y), Math.max(box[2], point.x), Math.max(box[3], point.y)];
  }
  return [box[0] - slack, box[1] - slack, box[2] + slack, box[3] + slack];
}

export function outsideWorld(x: number, y: number, margin: number, size: number): boolean {
  return x < -margin || y < -margin || x > size + margin || y > size + margin;
}
