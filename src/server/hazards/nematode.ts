import { clamp, hslToRgb, radiusFor, WORLD } from '../../shared/math.ts';
import { BossKind, EventKind, FoodVariety, type WireBoss } from '../../shared/protocol.ts';
import type { Cell } from '../types.ts';
import { allMembers, emit, toBytes, world } from '../world.ts';
import { Boss, dissolveChain, joints, outsideWorld, shove, tail } from './boss.ts';
import { follow, makeChain, pointAlong, type Chain } from './chain.ts';

const COUNT = 56;
const LENGTH = WORLD * 0.3;
const SPACING = LENGTH / (COUNT - 1);
const SPEED = 115;
const TURN = 1.1;
const SUCTION_RANGE = 520;
const GUT_TIME = 9;
const GUT_DRAIN = 0.07;
const LIFETIME = 170;
const DAMAGE = 0.00012;
const LUNGE_BOOST = 2.8;
const LUNGE_TIME = 0.9;
const LUNGE_RANGE = 900;

const State = { Hunt: 0, Leave: 1 } as const;

function edgePoint(): { x: number; y: number } {
  const along = Math.random() * WORLD;
  const sides = [
    { x: -200, y: along },
    { x: WORLD + 200, y: along },
    { x: along, y: -200 },
    { x: along, y: WORLD + 200 },
  ];
  return sides[Math.floor(Math.random() * sides.length)] ?? { x: -200, y: along };
}

function profile(u: number): number {
  const body = Math.sin(Math.PI * clamp(u * 1.08, 0, 1)) ** 0.55;
  return 18 + 72 * body;
}

export class Nematode extends Boss {
  private readonly chain: Chain;
  private heading: number;
  private time = 0;
  private state: number = State.Hunt;
  private target = 0;
  private lunge = 0;
  private nextLunge = 0;
  private readonly color = toBytes(hslToRgb(48, 0.25, 0.62));

  constructor() {
    super();
    const start = edgePoint();
    this.heading = Math.atan2(WORLD / 2 - start.y, WORLD / 2 - start.x);
    this.chain = makeChain(COUNT, start, this.heading, SPACING, profile);
  }

  private head(): { x: number; y: number } {
    return this.chain.points[0] ?? { x: 0, y: 0 };
  }

  private choosePrey(): void {
    const head = this.head();
    let best: Cell | null = null;
    for (const { cell } of allMembers()) {
      if (cell.gut >= 0 || Math.hypot(cell.x - head.x, cell.y - head.y) > 3200) continue;
      if (!best || cell.mass > best.mass) best = cell;
    }
    this.target = best?.id ?? 0;
  }

  private desiredHeading(): number {
    const head = this.head();
    if (this.state === State.Leave) return Math.atan2(head.y - WORLD / 2, head.x - WORLD / 2);
    const prey = allMembers().find((member) => member.cell.id === this.target)?.cell;
    if (prey) return Math.atan2(prey.y - head.y, prey.x - head.x);
    return this.heading + Math.sin(this.time * 0.25) * 0.5;
  }

  private strike(dt: number): void {
    this.lunge = Math.max(0, this.lunge - dt);
    if (this.lunge > 0 || this.time < this.nextLunge) return;
    const head = this.head();
    const prey = allMembers().find((member) => member.cell.id === this.target)?.cell;
    if (!prey || Math.hypot(prey.x - head.x, prey.y - head.y) > LUNGE_RANGE) return;
    this.lunge = LUNGE_TIME;
    this.nextLunge = this.time + 5 + Math.random() * 3;
  }

  private swim(dt: number): void {
    this.strike(dt);
    const goal = this.desiredHeading() + Math.sin(this.time * 2.4) * 0.55;
    const turn = Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading));
    this.heading += clamp(turn, -TURN * dt, TURN * dt);
    const head = this.chain.points[0];
    if (!head) return;
    const speed = SPEED * (this.lunge > 0 ? LUNGE_BOOST : 1);
    head.x += Math.cos(this.heading) * speed * dt;
    head.y += Math.sin(this.heading) * speed * dt;
    follow(this.chain, SPACING);
  }

  private suck(dt: number): void {
    const head = this.head();
    const mouth = (this.chain.radii[0] ?? 20) + 30;
    const pull = (body: { x: number; y: number; vx: number; vy: number }, strength: number): number => {
      const dx = head.x - body.x;
      const dy = head.y - body.y;
      const distance = Math.hypot(dx, dy) || 1;
      const ahead = (-dx * Math.cos(this.heading) - dy * Math.sin(this.heading)) / distance;
      if (distance > SUCTION_RANGE || ahead < 0.3) return Infinity;
      const force = strength * (1 - distance / SUCTION_RANGE) * dt;
      body.vx += (dx / distance) * force;
      body.vy += (dy / distance) * force;
      return distance - mouth;
    };
    for (const { cell } of allMembers()) if (cell.gut < 0 && pull(cell, 900) < 0) this.swallow(cell);
    for (const food of world.foods.values()) if (pull(food, 700) < 0) world.foods.delete(food.id);
  }

  private swallow(cell: Cell): void {
    cell.gut = 0;
    emit({ kind: EventKind.Swallowed, cellId: cell.id, predatorId: 0, x: cell.x, y: cell.y, color: this.color });
  }

  private digest(dt: number): void {
    const end = this.chain.points[this.chain.points.length - 1] ?? this.head();
    for (const { cell } of allMembers()) {
      if (cell.gut < 0) continue;
      cell.gut += dt / GUT_TIME;
      cell.mass = Math.max(10, cell.mass * (1 - GUT_DRAIN * dt));
      cell.radius = radiusFor(cell.mass);
      const at = pointAlong(this.chain, 0.08 + cell.gut * 0.9);
      cell.x = at.x;
      cell.y = at.y;
      cell.vx = 0;
      cell.vy = 0;
      if (cell.gut < 1) continue;
      cell.gut = -1;
      cell.x = end.x;
      cell.y = end.y;
    }
  }

  protected die(): void {
    dissolveChain(this.chain, this.color, [FoodVariety.Detritus, FoodVariety.Plant, FoodVariety.Algae]);
    for (const { cell } of allMembers()) if (cell.gut >= 0) cell.gut = -1;
    this.health = -1;
  }

  protected bodies(): readonly Chain[] {
    return [this.chain];
  }

  update(dt: number): void {
    this.time += dt;
    if (this.time > LIFETIME) this.state = State.Leave;
    if (Math.floor(this.time * 0.5) !== Math.floor((this.time - dt) * 0.5)) this.choosePrey();
    this.swim(dt);
    this.suck(dt);
    this.digest(dt);
    shove(tail(this.chain, 3), { x: Math.cos(this.heading) * SPEED, y: Math.sin(this.heading) * SPEED }, (mass) => {
      this.health -= mass * DAMAGE * dt;
    });
    if (this.health <= 0 && this.health > -1) this.die();
  }

  done(): boolean {
    const head = this.head();
    return this.health <= -1 || (this.state === State.Leave && outsideWorld(head.x, head.y, LENGTH, WORLD));
  }

  slowdown(): number {
    return 1;
  }

  wire(): WireBoss {
    return {
      kind: BossKind.Nematode,
      state: this.state,
      progress: clamp(this.health, 0, 1),
      health: this.vitality(),
      chains: [joints(this.chain)],
    };
  }
}
