import { clamp, hslToRgb, WORLD } from '../../shared/math.ts';
import { BOSS_REACH, BOSS_SCALE, BossKind, FoodVariety, type WireBoss } from '../../shared/protocol.ts';
import { burstCell } from '../actions.ts';
import { addToxin } from '../combat/clouds.ts';
import { allMembers, randomWorld, toBytes, world } from '../world.ts';
import { Boss, dissolveChain, joints, shove } from './boss.ts';
import { follow, makeChain, nearestOnChain, type Chain } from './chain.ts';

const COUNT = 34;
const LENGTH = WORLD * 0.28;
const SPACING = LENGTH / (COUNT - 1);
const SPEED = 38;
const SHOCK_RANGE = 1000 * BOSS_REACH;
const SHOCK_SPEED = 1100;
const BURST_RANGE = 420 * BOSS_REACH;
const BURST_MASS = 150;
const LIFETIME = 160;
const TOXIN_RADIUS = 520 * BOSS_REACH;
const TOXIN_LIFE = 6000;

const State = { Glide: 0, Warn: 1, Snap: 2, Coiled: 3, Relax: 4 } as const;
const DURATION: Readonly<Record<number, number>> = {
  [State.Warn]: 2.2,
  [State.Snap]: 0.18,
  [State.Coiled]: 1.6,
  [State.Relax]: 5,
};

function profile(u: number): number {
  return (34 + 58 * Math.sin(Math.PI * u) ** 0.35) * BOSS_SCALE;
}

export class Spirostomum extends Boss {
  private dead = false;
  private readonly chain: Chain;
  private heading = Math.random() * Math.PI * 2;
  private time = 0;
  private state: number = State.Glide;
  private stateTime = 0;
  private glideFor = 8 + Math.random() * 6;
  private length = 1;
  readonly color = toBytes(hslToRgb(36, 0.35, 0.58));

  constructor() {
    super();
    this.chain = makeChain(
      COUNT,
      { x: randomWorld(LENGTH * 0.6), y: randomWorld(LENGTH * 0.6) },
      this.heading,
      SPACING,
      profile,
    );
  }

  private enter(state: number): void {
    this.state = state;
    this.stateTime = 0;
  }

  private center(): { x: number; y: number } {
    return this.chain.points[Math.floor(COUNT / 2)] ?? { x: 0, y: 0 };
  }

  private shockwave(): void {
    for (const { player, cell } of allMembers()) {
      const hit = nearestOnChain(this.chain, cell);
      if (!hit || hit.distance > SHOCK_RANGE) continue;
      const strength = (1 - hit.distance / SHOCK_RANGE) * SHOCK_SPEED;
      cell.boostX += hit.nx * strength;
      cell.boostY += hit.ny * strength;
      cell.vx += hit.nx * strength;
      cell.vy += hit.ny * strength;
      if (hit.distance < BURST_RANGE && cell.mass > BURST_MASS) burstCell(player, cell);
    }
    for (const food of world.foods.values()) {
      const hit = nearestOnChain(this.chain, food);
      if (!hit || hit.distance > SHOCK_RANGE) continue;
      food.vx += hit.nx * SHOCK_SPEED * 0.6 * (1 - hit.distance / SHOCK_RANGE);
      food.vy += hit.ny * SHOCK_SPEED * 0.6 * (1 - hit.distance / SHOCK_RANGE);
    }
  }

  private cycle(): void {
    if (this.state === State.Glide && this.stateTime > this.glideFor) {
      this.enter(State.Warn);
      return;
    }
    const duration = DURATION[this.state];
    if (duration === undefined || this.stateTime < duration) return;
    if (this.state === State.Warn) {
      this.enter(State.Snap);
      this.shockwave();
      addToxin(this.center(), TOXIN_RADIUS, TOXIN_LIFE);
    } else if (this.state === State.Snap) {
      this.enter(State.Coiled);
    } else if (this.state === State.Coiled) {
      this.enter(State.Relax);
    } else {
      this.glideFor = 8 + Math.random() * 6;
      this.enter(State.Glide);
    }
  }

  private targetLength(): number {
    if (this.state === State.Snap || this.state === State.Coiled) return 0.25;
    if (this.state === State.Relax) return 0.25 + 0.75 * clamp(this.stateTime / 5, 0, 1);
    return 1;
  }

  private contract(): void {
    const center = this.center();
    const scale = this.targetLength() / this.length;
    if (Math.abs(scale - 1) < 1e-3) return;
    for (const point of this.chain.points) {
      point.x = center.x + (point.x - center.x) * scale;
      point.y = center.y + (point.y - center.y) * scale;
    }
    this.length = this.targetLength();
  }

  update(dt: number): void {
    this.time += dt;
    this.stateTime += dt;
    this.cycle();
    this.contract();
    if (this.state === State.Glide) {
      this.heading += Math.sin(this.time * 0.2) * 0.15 * dt;
      const head = this.chain.points[0];
      if (head) {
        head.x = clamp(head.x + Math.cos(this.heading) * SPEED * dt, 200, WORLD - 200);
        head.y = clamp(head.y + Math.sin(this.heading) * SPEED * dt, 200, WORLD - 200);
      }
      follow(this.chain, SPACING * this.length);
    }
    shove(this.chain, { x: 0, y: 0 }, () => undefined);
  }

  protected die(): void {
    dissolveChain(this.chain, this.color, [FoodVariety.Detritus, FoodVariety.Plant]);
    this.dead = true;
  }

  protected bodies(): readonly Chain[] {
    return [this.chain];
  }

  done(): boolean {
    if (this.dead) return true;
    return this.time > LIFETIME && this.state === State.Glide;
  }

  slowdown(): number {
    return 1;
  }

  wire(): WireBoss {
    const duration = DURATION[this.state] ?? this.glideFor;
    return {
      kind: BossKind.Spirostomum,
      state: this.state,
      progress: clamp(this.stateTime / duration, 0, 1),
      health: this.vitality(),
      chains: [joints(this.chain)],
    };
  }
}
