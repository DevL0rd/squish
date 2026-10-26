import { clamp, hslToRgb, WORLD } from '../../shared/math.ts';
import { BOSS_REACH, BOSS_SCALE, BossKind, FoodVariety, type WireBoss } from '../../shared/protocol.ts';
import { toBytes, world } from '../world.ts';
import { Boss, dissolveChain, joints, outsideWorld, shove } from './boss.ts';
import { follow, makeChain, type Chain } from './chain.ts';

const COUNT = 44;
const LENGTH = WORLD * 0.24;
const SPACING = LENGTH / (COUNT - 1);
const SPEED = 95;
const FLEE_BOOST = 2;
const FLEE_TIME = 3;
const TRAIL_LIFE = 26;
const TRAIL_RADIUS = 90 * BOSS_REACH;
const TRAIL_SLOW = 0.42;
const MOUTH = 150 * BOSS_REACH;
const MAX_SLIME = 180;
const LIFETIME = 170;
const BACTERIA = new Set([4, 5]);

interface Slime {
  readonly x: number;
  readonly y: number;
  readonly born: number;
}

function profile(u: number): number {
  const taper = Math.min(1, u * 9, (1 - u) * 5);
  return (18 + 34 * taper + 8 * Math.sin(u * 120) ** 2) * BOSS_SCALE;
}

export class Oligochaete extends Boss {
  private dead = false;
  private readonly chain: Chain;
  private heading: number;
  private time = 0;
  private leaving = false;
  private fleeUntil = 0;
  private felt = 1;
  private readonly trail: Slime[] = [];
  readonly color = toBytes(hslToRgb(8, 0.45, 0.5));

  constructor() {
    super();
    const start = { x: Math.random() * WORLD, y: -200 };
    this.heading = Math.PI / 2 + (Math.random() - 0.5);
    this.chain = makeChain(COUNT, start, this.heading, SPACING, profile);
  }

  private flinch(): void {
    if (this.health < this.felt - 0.001) this.fleeUntil = this.time + FLEE_TIME;
    this.felt = this.health;
  }

  private crawl(dt: number): void {
    this.flinch();
    const head = this.chain.points[0];
    if (!head) return;
    const outward = Math.atan2(head.y - WORLD / 2, head.x - WORLD / 2);
    const goal = this.leaving ? outward : this.heading + Math.sin(this.time * 0.35) * 0.9;
    this.heading += clamp(
      Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading)),
      -0.8 * dt,
      0.8 * dt,
    );
    const edge = head.x < 400 || head.y < 400 || head.x > WORLD - 400 || head.y > WORLD - 400;
    if (edge && !this.leaving && this.time > 10) this.heading = Math.atan2(WORLD / 2 - head.y, WORLD / 2 - head.x);
    const speed = SPEED * (this.time < this.fleeUntil ? FLEE_BOOST : 1);
    head.x += Math.cos(this.heading) * speed * dt;
    head.y += Math.sin(this.heading) * speed * dt;
    follow(this.chain, SPACING);
  }

  private secrete(): void {
    const end = this.chain.points[this.chain.points.length - 1];
    const last = this.trail[this.trail.length - 1];
    if (end && (!last || Math.hypot(end.x - last.x, end.y - last.y) > 60)) {
      this.trail.push({ x: end.x, y: end.y, born: this.time });
    }
    while (this.trail[0] && this.time - this.trail[0].born > TRAIL_LIFE) this.trail.shift();
  }

  private graze(): void {
    const head = this.chain.points[0];
    if (!head) return;
    for (const food of world.foods.values()) {
      if (Math.hypot(food.x - head.x, food.y - head.y) < MOUTH) world.foods.delete(food.id);
    }
    for (const creature of world.creatures.values()) {
      if (BACTERIA.has(creature.kind) && Math.hypot(creature.x - head.x, creature.y - head.y) < MOUTH) {
        world.creatures.delete(creature.id);
      }
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.leaving = this.time > LIFETIME;
    this.crawl(dt);
    this.secrete();
    this.graze();
    shove(this.chain, { x: Math.cos(this.heading) * SPEED, y: Math.sin(this.heading) * SPEED }, () => undefined);
  }

  protected die(): void {
    dissolveChain(this.chain, this.color, [FoodVariety.Detritus, FoodVariety.Algae]);
    this.dead = true;
  }

  protected bodies(): readonly Chain[] {
    return [this.chain];
  }

  done(): boolean {
    if (this.dead) return true;
    const end = this.chain.points[this.chain.points.length - 1] ?? { x: 0, y: 0 };
    return this.leaving && outsideWorld(end.x, end.y, 200, WORLD);
  }

  slowdown(x: number, y: number): number {
    const sticky = this.trail.some((slime) => Math.hypot(slime.x - x, slime.y - y) < TRAIL_RADIUS);
    return sticky ? TRAIL_SLOW : 1;
  }

  wire(): WireBoss {
    const slime = this.trail.map((point) => ({
      x: point.x,
      y: point.y,
      r: Math.max(0, TRAIL_RADIUS * (1 - (this.time - point.born) / TRAIL_LIFE)),
    }));
    return {
      kind: BossKind.Oligochaete,
      state: this.leaving ? 1 : 0,
      progress: 1,
      health: this.vitality(),
      chains: [joints(this.chain), slime.slice(-MAX_SLIME)],
    };
  }
}
