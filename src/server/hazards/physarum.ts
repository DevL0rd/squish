import { hslToRgb, radiusFor, WORLD } from '../../shared/math.ts';
import { BossKind, FoodVariety, type WireBoss } from '../../shared/protocol.ts';
import { addFood } from '../food.ts';
import type { Cell, Point } from '../types.ts';
import { allMembers, randomWorld, toBytes, world } from '../world.ts';
import { Boss, joints } from './boss.ts';
import { nearestOnChain, pushOut, type Chain } from './chain.ts';

const SEGMENT = 70;
const GROW_SPEED = 32;
const MAX_POINTS = 34;
const MAX_VEINS = 18;
const SEEK_RANGE = 700;
const BITE_MASS = 60;
const STREAM = 140;
const LIFETIME = 180;
const DIGEST_RATE = 0.015;
const HEAL_PER_MASS = 0.0004;

interface Vein extends Chain {
  heading: number;
  fused: boolean;
  readonly parent: Vein | null;
}

const SPREAD = 0.9;
const FUSE_GAP = 12;

function turn(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function radiusAt(index: number, count: number): number {
  return index === count - 1 ? 46 : 28 - 16 * (index / Math.max(count - 1, 1));
}

export class Physarum extends Boss {
  private readonly veins: Vein[] = [];
  private readonly core: Point;
  private time = 0;
  private sporulated = false;
  readonly color = toBytes(hslToRgb(50, 0.85, 0.55));

  constructor() {
    super();
    this.core = { x: randomWorld(2000), y: randomWorld(2000) };
    for (let i = 0; i < 6; i += 1) this.sprout(this.core, (i / 6) * Math.PI * 2, null);
  }

  private sprout(from: Point, heading: number, parent: Vein | null): void {
    this.veins.push({
      points: [{ ...from }, { x: from.x + Math.cos(heading) * 20, y: from.y + Math.sin(heading) * 20 }],
      radii: [28, 46],
      heading,
      fused: false,
      parent,
    });
  }

  private reshape(vein: Vein): void {
    vein.radii.length = 0;
    vein.points.forEach((_, i) => vein.radii.push(radiusAt(i, vein.points.length)));
  }

  private seek(vein: Vein, tip: Point): void {
    let best: Point | null = null;
    let bestDistance = SEEK_RANGE;
    for (const food of world.foods.values()) {
      const distance = Math.hypot(food.x - tip.x, food.y - tip.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = food;
      }
    }
    const outward = Math.atan2(tip.y - this.core.y, tip.x - this.core.x);
    const toFood = best ? Math.atan2(best.y - tip.y, best.x - tip.x) : null;
    const ahead = toFood !== null && Math.abs(turn(toFood - outward)) < SPREAD;
    const goal = ahead ? toFood : vein.heading + (Math.random() - 0.5) * 0.4;
    vein.heading += turn(goal - vein.heading) * 0.05;
    vein.heading = outward + Math.max(-SPREAD, Math.min(SPREAD, turn(vein.heading - outward)));
  }

  private advance(vein: Vein, tip: Point, dt: number): void {
    this.seek(vein, tip);
    tip.x = Math.min(WORLD - 60, Math.max(60, tip.x + Math.cos(vein.heading) * GROW_SPEED * dt));
    tip.y = Math.min(WORLD - 60, Math.max(60, tip.y + Math.sin(vein.heading) * GROW_SPEED * dt));
    for (const food of world.foods.values()) {
      if (Math.hypot(food.x - tip.x, food.y - tip.y) < 50) world.foods.delete(food.id);
    }
  }

  private extend(vein: Vein, tip: Point): void {
    vein.points.push({ ...tip });
    this.reshape(vein);
    if (this.veins.length < MAX_VEINS && Math.random() < 0.18) {
      this.sprout(tip, vein.heading + (Math.random() < 0.5 ? -0.9 : 0.9), vein);
    }
  }

  private grow(vein: Vein, dt: number): void {
    const tip = vein.points[vein.points.length - 1];
    const before = vein.points[vein.points.length - 2];
    if (!tip || !before || vein.fused || vein.points.length >= MAX_POINTS) return;
    this.advance(vein, tip, dt);
    if (this.meets(vein, tip)) vein.fused = true;
    else if (Math.hypot(tip.x - before.x, tip.y - before.y) >= SEGMENT) this.extend(vein, tip);
  }

  private meets(vein: Vein, tip: Point): boolean {
    if (vein.points.length < 4) return false;
    return this.veins.some((other) => {
      if (other === vein || other === vein.parent || other.parent === vein) return false;
      const hit = nearestOnChain(other, tip);
      return hit !== null && hit.distance < hit.radius + FUSE_GAP;
    });
  }

  private cut(vein: Vein, from: number): void {
    for (const point of vein.points.slice(from)) {
      addFood({ x: point.x, y: point.y, variety: FoodVariety.Plant, color: this.color });
    }
    vein.points.splice(Math.max(2, from));
    vein.fused = false;
    vein.heading += Math.PI * 0.6;
    this.reshape(vein);
  }

  private stream(vein: Vein, index: number, cell: { vx: number; vy: number }, dt: number): void {
    const a = vein.points[index];
    const b = vein.points[index + 1];
    if (!a || !b) return;
    const flow = Math.sin(this.time * (Math.PI / 30)) > 0 ? 1 : -1;
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    cell.vx += ((b.x - a.x) / length) * STREAM * flow * dt * 4;
    cell.vy += ((b.y - a.y) / length) * STREAM * flow * dt * 4;
  }

  private touch(vein: Vein, cell: Cell, dt: number): void {
    const hit = nearestOnChain(vein, cell);
    if (!hit || hit.distance > hit.radius + cell.radius + 20) return;
    const tipIndex = vein.points.length - 1;
    if (hit.index >= tipIndex - 1 && cell.mass > BITE_MASS) this.cut(vein, Math.floor(tipIndex * 0.6));
    this.stream(vein, hit.index, cell, dt);
    this.digest(cell, dt);
    pushOut(vein, cell, { x: cell.vx, y: cell.vy });
  }

  private digest(cell: Cell, dt: number): void {
    const taken = cell.mass * DIGEST_RATE * dt;
    cell.mass -= taken;
    cell.radius = radiusFor(cell.mass);
    this.health = Math.min(1, this.health + taken * HEAL_PER_MASS);
  }

  private interact(dt: number): void {
    for (const { cell } of allMembers()) {
      for (const vein of this.veins) this.touch(vein, cell, dt);
    }
  }

  private sporulate(): void {
    for (const vein of this.veins) {
      for (const point of vein.points) {
        addFood({ x: point.x, y: point.y, variety: FoodVariety.Pollen, color: this.color });
      }
    }
    this.sporulated = true;
  }

  update(dt: number): void {
    this.time += dt;
    for (const vein of [...this.veins]) this.grow(vein, dt);
    this.interact(dt);
    if (this.time > LIFETIME && !this.sporulated) this.sporulate();
  }

  protected die(): void {
    this.sporulate();
  }

  protected bodies(): readonly Chain[] {
    return this.veins;
  }

  done(): boolean {
    return this.sporulated;
  }

  slowdown(): number {
    return 1;
  }

  wire(): WireBoss {
    return {
      kind: BossKind.Physarum,
      state: 0,
      progress: Math.sin(this.time * (Math.PI / 30)) > 0 ? 1 : 0,
      health: this.vitality(),
      chains: this.veins.map(joints),
    };
  }
}
