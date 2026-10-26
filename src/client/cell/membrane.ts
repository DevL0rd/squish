import type { Wall } from '../world/obstacles.ts';
import { at, clamp, mulberry32 } from '../../shared/math.ts';
import { ringArea, ringCentroid, type Point, type Ring } from './geometry.ts';
import { containRing, shutWall } from './membrane-limits.ts';
import { Lobes } from './lobes.ts';

export interface Plane {
  readonly nx: number;
  readonly ny: number;
  readonly offset: number;
}

export interface Cup {
  x: number;
  y: number;
  readonly radius: number;
  life: number;
  readonly duration: number;
}

export interface Cleave {
  readonly anchor: Point;
  readonly radius: number;
  readonly ownRadius: number;
  readonly dirX: number;
  readonly dirY: number;
  readonly furrow: number;
}

export interface Drive {
  readonly anchor: Point;
  readonly vx: number;
  readonly vy: number;
  readonly planes: readonly Plane[];
  readonly cleave: Cleave | null;
  readonly substeps: number;
  readonly walls: readonly Wall[];
}

const ITERATIONS = 2;
const RETAIN = 0.8;
const ANCHOR_RATE = 18;
const SLACK = 1.08;
const TENSION = 0.16;
const PROTRUSION = 0.32;
const CONTACT_SOFTNESS = 0.3;
const CUP_RATE = 0.2;
const SELF_GAP = 0.9;
const PRESSURE_STEP = 0.04;
const CUP_SPAN = 0.5;
const CUP_REACH = 1.45;
const SHAPE_RATE = 5;

export class Membrane implements Ring {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly cups: Cup[] = [];
  radius = 1;
  stretch = 1;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly sx: Float32Array;
  private readonly sy: Float32Array;
  private readonly lobes: Lobes;
  private readonly order: number[];
  private time: number;

  constructor(ring: Ring, seed: number) {
    this.count = ring.x.length;
    this.x = Float32Array.from(ring.x);
    this.y = Float32Array.from(ring.y);
    this.px = Float32Array.from(ring.x);
    this.py = Float32Array.from(ring.y);
    this.sx = new Float32Array(this.count);
    this.sy = new Float32Array(this.count);
    this.order = Array.from({ length: this.count }, (_, i) => i);
    const random = mulberry32(seed);
    this.lobes = new Lobes(random);
    this.time = random() * 100;
  }

  translate(dx: number, dy: number): void {
    for (let i = 0; i < this.count; i += 1) {
      this.x[i] = at(this.x, i) + dx;
      this.y[i] = at(this.y, i) + dy;
      this.px[i] = at(this.px, i) + dx;
      this.py[i] = at(this.py, i) + dy;
    }
  }

  replace(ring: Ring): void {
    this.x.set(ring.x);
    this.y.set(ring.y);
    this.px.set(ring.x);
    this.py.set(ring.y);
  }

  centroid(): Point {
    return ringCentroid(this);
  }

  step(dt: number, drive: Drive): void {
    this.time += dt;
    this.lobes.update(dt, drive.vx, drive.vy);
    this.cups.forEach((cup) => (cup.life -= dt));
    this.cups.splice(0, this.cups.length, ...this.cups.filter((cup) => cup.life > 0));
    const h = dt / drive.substeps;
    if (!drive.cleave) this.protrude(dt);
    for (let step = 0; step < drive.substeps; step += 1) {
      this.integrate();
      if (drive.cleave) this.relaxHalves(h, drive.anchor, drive.cleave);
      if (drive.cleave) this.followHalves(drive.anchor, drive.cleave, h);
      else this.follow(drive.anchor, h);
      for (let iteration = 0; iteration < ITERATIONS; iteration += 1) {
        this.constrain(drive.planes, drive.walls);
        if (drive.cleave) this.pinch(drive.anchor, drive.cleave);
      }
      if (!drive.cleave) this.untangle();
    }
    if (!drive.cleave) containRing(this, drive.anchor);
  }

  private integrate(): void {
    for (let i = 0; i < this.count; i += 1) {
      const x = at(this.x, i);
      const y = at(this.y, i);
      this.x[i] = x + (x - at(this.px, i)) * RETAIN;
      this.y[i] = y + (y - at(this.py, i)) * RETAIN;
      this.px[i] = x;
      this.py[i] = y;
    }
  }

  private settle(i: number, center: Point, goal: (angle: number) => number, blend: number): void {
    const dx = at(this.x, i) - center.x;
    const dy = at(this.y, i) - center.y;
    const length = Math.hypot(dx, dy) || 1;
    const move = (goal(Math.atan2(dy, dx)) - length) * blend;
    this.x[i] = at(this.x, i) + (dx / length) * move;
    this.y[i] = at(this.y, i) + (dy / length) * move;
  }

  private protrude(h: number): void {
    const center = this.centroid();
    const blend = 1 - Math.exp(-h * SHAPE_RATE);
    const goal = (angle: number): number => {
      const ruffle =
        (Math.sin(angle * 3 + this.time * 0.8) * 0.6 + Math.sin(angle * 5 - this.time * 1.1) * 0.4) * 0.018;
      return this.radius * (1 + this.lobes.extension(angle) * PROTRUSION + ruffle);
    };
    for (let i = 0; i < this.count; i += 1) this.settle(i, center, goal, blend);
  }

  private relaxHalves(h: number, anchor: Point, cleave: Cleave): void {
    const blend = 1 - Math.exp(-h * SHAPE_RATE * 1.6);
    const front = (): number => cleave.radius;
    const back = (): number => cleave.ownRadius;
    for (let i = 0; i < this.count; i += 1) {
      const isFront = this.side(anchor, cleave, i) > 0;
      this.settle(i, isFront ? cleave.anchor : anchor, isFront ? front : back, blend);
    }
  }

  private repel(): void {
    const gap = ((Math.PI * 2 * this.radius) / this.count) * SELF_GAP;
    const order = this.order.sort((a, b) => at(this.x, a) - at(this.x, b));
    for (let a = 0; a < order.length; a += 1) {
      const i = order[a] ?? 0;
      for (let b = a + 1; b < order.length; b += 1) {
        const j = order[b] ?? 0;
        if (at(this.x, j) - at(this.x, i) >= gap) break;
        this.separate(i, j, gap);
      }
    }
  }

  private separate(i: number, j: number, gap: number): void {
    const apart = Math.abs(i - j);
    if (apart < 3 || this.count - apart < 3) return;
    const dx = at(this.x, j) - at(this.x, i);
    const dy = at(this.y, j) - at(this.y, i);
    const squared = dx * dx + dy * dy;
    if (squared >= gap * gap) return;
    const distance = Math.sqrt(squared) || 1e-3;
    const push = ((gap - distance) / distance) * 0.5;
    this.x[i] = at(this.x, i) - dx * push;
    this.y[i] = at(this.y, i) - dy * push;
    this.x[j] = at(this.x, j) + dx * push;
    this.y[j] = at(this.y, j) + dy * push;
  }

  private untangle(): void {
    const center = this.centroid();
    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < this.count; i += 1) {
        const prev = (i + this.count - 1) % this.count;
        const next = (i + 1) % this.count;
        if (this.ordered(center, prev, i) && this.ordered(center, i, next)) continue;
        this.x[i] = (at(this.x, prev) + at(this.x, next)) * 0.5;
        this.y[i] = (at(this.y, prev) + at(this.y, next)) * 0.5;
        this.px[i] = at(this.x, i);
        this.py[i] = at(this.y, i);
      }
    }
  }

  private ordered(center: Point, a: number, b: number): boolean {
    const ax = at(this.x, a) - center.x;
    const ay = at(this.y, a) - center.y;
    const bx = at(this.x, b) - center.x;
    const by = at(this.y, b) - center.y;
    return ax * by - ay * bx > 0;
  }

  private follow(anchor: Point, h: number): void {
    const center = this.centroid();
    const blend = 1 - Math.exp(-h * ANCHOR_RATE);
    const sx = (anchor.x - center.x) * blend;
    const sy = (anchor.y - center.y) * blend;
    for (let i = 0; i < this.count; i += 1) {
      this.x[i] = at(this.x, i) + sx;
      this.y[i] = at(this.y, i) + sy;
      this.px[i] = at(this.px, i) + sx;
      this.py[i] = at(this.py, i) + sy;
    }
  }

  private side(anchor: Point, cleave: Cleave, i: number): number {
    const midX = (anchor.x + cleave.anchor.x) * 0.5;
    const midY = (anchor.y + cleave.anchor.y) * 0.5;
    return (at(this.x, i) - midX) * cleave.dirX + (at(this.y, i) - midY) * cleave.dirY;
  }

  private halfCenters(anchor: Point, cleave: Cleave): [Point, Point] {
    const sums = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < this.count; i += 1) {
      const slot = this.side(anchor, cleave, i) > 0 ? 3 : 0;
      sums[slot] = at(sums, slot) + at(this.x, i);
      sums[slot + 1] = at(sums, slot + 1) + at(this.y, i);
      sums[slot + 2] = at(sums, slot + 2) + 1;
    }
    const back = Math.max(at(sums, 2), 1);
    const front = Math.max(at(sums, 5), 1);
    return [
      { x: at(sums, 0) / back, y: at(sums, 1) / back },
      { x: at(sums, 3) / front, y: at(sums, 4) / front },
    ];
  }

  private followHalves(anchor: Point, cleave: Cleave, h: number): void {
    const [back, front] = this.halfCenters(anchor, cleave);
    const blend = 1 - Math.exp(-h * ANCHOR_RATE);
    for (let i = 0; i < this.count; i += 1) {
      const isFront = this.side(anchor, cleave, i) > 0;
      const goal = isFront ? cleave.anchor : anchor;
      const from = isFront ? front : back;
      this.x[i] = at(this.x, i) + (goal.x - from.x) * blend;
      this.y[i] = at(this.y, i) + (goal.y - from.y) * blend;
    }
  }

  private pinch(anchor: Point, cleave: Cleave): void {
    const width = this.radius * 0.45;
    for (let i = 0; i < this.count; i += 1) {
      const side = this.side(anchor, cleave, i);
      const band = Math.exp(-((side / width) ** 2));
      const axial = (at(this.x, i) - anchor.x) * cleave.dirX + (at(this.y, i) - anchor.y) * cleave.dirY;
      const axisX = anchor.x + cleave.dirX * axial;
      const axisY = anchor.y + cleave.dirY * axial;
      const squeeze = cleave.furrow * band * 0.25;
      this.x[i] = at(this.x, i) + (axisX - at(this.x, i)) * squeeze;
      this.y[i] = at(this.y, i) + (axisY - at(this.y, i)) * squeeze;
    }
  }

  neckWidth(anchor: Point, cleave: Cleave): number {
    let width = Infinity;
    const band = this.radius * 0.25;
    for (let i = 0; i < this.count; i += 1) {
      if (Math.abs(this.side(anchor, cleave, i)) > band) continue;
      const axial = (at(this.x, i) - anchor.x) * cleave.dirX + (at(this.y, i) - anchor.y) * cleave.dirY;
      const offX = at(this.x, i) - (anchor.x + cleave.dirX * axial);
      const offY = at(this.y, i) - (anchor.y + cleave.dirY * axial);
      width = Math.min(width, Math.hypot(offX, offY));
    }
    return width;
  }

  private constrain(planes: readonly Plane[], walls: readonly Wall[]): void {
    this.edges();
    this.pressure();
    this.wrapCups();
    for (const plane of planes) this.clamp(plane);
    for (const wall of walls) shutWall(this, wall);
    this.tension();
    this.repel();
  }

  private edges(): void {
    const rest = (Math.PI * 2 * this.radius * SLACK * this.stretch) / this.count;
    for (let i = 0; i < this.count; i += 1) {
      const j = (i + 1) % this.count;
      const dx = at(this.x, j) - at(this.x, i);
      const dy = at(this.y, j) - at(this.y, i);
      const length = Math.hypot(dx, dy) || 1e-4;
      const limit = clamp(length, rest * 0.55, rest * 1.15);
      if (limit === length) continue;
      const correction = ((length - limit) / length) * 0.5;
      this.x[i] = at(this.x, i) + dx * correction;
      this.y[i] = at(this.y, i) + dy * correction;
      this.x[j] = at(this.x, j) - dx * correction;
      this.y[j] = at(this.y, j) - dy * correction;
    }
  }

  private tension(): void {
    for (let i = 0; i < this.count; i += 1) {
      const prev = (i + this.count - 1) % this.count;
      const next = (i + 1) % this.count;
      this.sx[i] = (at(this.x, prev) + at(this.x, next)) * 0.5 - at(this.x, i);
      this.sy[i] = (at(this.y, prev) + at(this.y, next)) * 0.5 - at(this.y, i);
    }
    for (let i = 0; i < this.count; i += 1) {
      this.x[i] = at(this.x, i) + at(this.sx, i) * TENSION;
      this.y[i] = at(this.y, i) + at(this.sy, i) * TENSION;
    }
  }

  private pressure(): void {
    const error = ringArea(this) - Math.PI * this.radius * this.radius;
    let norm = 0;
    for (let i = 0; i < this.count; i += 1) {
      const prev = (i + this.count - 1) % this.count;
      const next = (i + 1) % this.count;
      this.sx[i] = 0.5 * (at(this.y, next) - at(this.y, prev));
      this.sy[i] = 0.5 * (at(this.x, prev) - at(this.x, next));
      norm += at(this.sx, i) ** 2 + at(this.sy, i) ** 2;
    }
    const lambda = -error / Math.max(norm, 1e-6);
    const limit = this.radius * PRESSURE_STEP;
    for (let i = 0; i < this.count; i += 1) {
      const dx = at(this.sx, i) * lambda;
      const dy = at(this.sy, i) * lambda;
      const length = Math.hypot(dx, dy);
      const scale = length > limit ? limit / length : 1;
      this.x[i] = at(this.x, i) + dx * scale;
      this.y[i] = at(this.y, i) + dy * scale;
    }
  }

  private clamp(plane: Plane): void {
    for (let i = 0; i < this.count; i += 1) {
      const excess = (at(this.x, i) * plane.nx + at(this.y, i) * plane.ny - plane.offset) * CONTACT_SOFTNESS;
      if (excess <= 0) continue;
      this.x[i] = at(this.x, i) - plane.nx * excess;
      this.y[i] = at(this.y, i) - plane.ny * excess;
    }
  }

  private wrapCups(): void {
    if (!this.cups.length) return;
    const center = this.centroid();
    for (const cup of this.cups) this.wrapCup(center, cup);
  }

  private wrapCup(center: Point, cup: Cup): void {
    const toCup = Math.atan2(cup.y - center.y, cup.x - center.x);
    const distance = Math.hypot(cup.x - center.x, cup.y - center.y);
    if (distance > this.radius * 1.6 + cup.radius) return;
    const span = Math.max(CUP_SPAN, Math.asin(clamp((cup.radius * 1.5) / Math.max(distance, 1e-3), 0, 1)) + 0.12);
    const progress = 1 - cup.life / cup.duration;
    const envelope = clamp(progress / 0.35, 0, 1) * clamp(cup.life / 0.25, 0, 1) * CUP_RATE;
    for (let i = 0; i < this.count; i += 1) {
      const dx = at(this.x, i) - center.x;
      const dy = at(this.y, i) - center.y;
      const offAxis = Math.abs(Math.atan2(Math.sin(Math.atan2(dy, dx) - toCup), Math.cos(Math.atan2(dy, dx) - toCup)));
      if (offAxis > span) continue;
      const reach = Math.min(distance + cup.radius * 1.15, this.radius * CUP_REACH) * Math.cos(offAxis * 0.5);
      const radial = Math.hypot(dx, dy) || 1;
      if (radial >= reach) continue;
      const pull = (reach - radial) * envelope * (0.5 + 0.5 * Math.cos((Math.PI * offAxis) / span));
      this.x[i] = at(this.x, i) + (dx / radial) * pull;
      this.y[i] = at(this.y, i) + (dy / radial) * pull;
    }
  }
}
