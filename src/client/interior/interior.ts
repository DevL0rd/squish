import { at, clamp, mulberry32, sampleGrid, type Rgb } from '../../shared/math.ts';
import { dyeDensity } from './dye.ts';
import { advect, project } from './fields.ts';
import { InteriorFood, type FoodOptions } from './food.ts';

export interface Organelle {
  readonly type: number;
  readonly radius: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const DEFAULT_TINT: Rgb = [0.1, 0.13, 0.13];
const STEP_INTERVAL = 1 / 34;

function moveFraction(side: number): number {
  if (side > 0.08) return 0.55;
  return side < -0.08 ? 0 : 0.27;
}

export class Interior {
  readonly n: number;
  readonly textureData: Uint8Array;
  readonly organelles: Organelle[] = [];
  readonly food: InteriorFood;
  dirty = true;
  private readonly size: number;
  private readonly random: () => number;
  private readonly swirlPhase: number;
  private readonly tint: Rgb;
  private readonly baseLevel: number;
  private u: Float32Array;
  private v: Float32Array;
  private u2: Float32Array;
  private v2: Float32Array;
  private readonly p: Float32Array;
  private readonly div: Float32Array;
  private dye: [Float32Array, Float32Array, Float32Array];
  private dye2: [Float32Array, Float32Array, Float32Array];
  private accumulator = 0;

  constructor(resolution: number, seed: number, tint: Rgb | null) {
    this.n = resolution;
    this.size = resolution * resolution;
    const field = (): Float32Array => new Float32Array(this.size);
    this.u = field();
    this.v = field();
    this.u2 = field();
    this.v2 = field();
    this.p = field();
    this.div = field();
    this.dye = [field(), field(), field()];
    this.dye2 = [field(), field(), field()];
    this.textureData = new Uint8Array(this.size * 4);
    this.random = mulberry32(seed);
    this.food = new InteriorFood(this.random, (x, y, color, strength) => {
      this.addDye(x, y, color, strength);
    });
    this.swirlPhase = this.random() * 40;
    this.tint = tint ?? DEFAULT_TINT;
    this.baseLevel = tint ? 0.4 : 0.02;
    this.seedOrganelles();
    this.seedDye(seed | 0);
    this.writeTexture();
  }

  private seedOrganelles(): void {
    const make = (type: number, radius: number): Organelle => ({
      type,
      radius,
      x: (this.random() - 0.5) * 0.8,
      y: (this.random() - 0.5) * 0.8,
      vx: 0,
      vy: 0,
    });
    this.organelles.push(make(0, 0.24 + this.random() * 0.05));
    const vesicles = 3 + Math.floor(this.random() * 2);
    for (let i = 0; i < vesicles; i += 1) this.organelles.push(make(1, 0.06 + this.random() * 0.055));
    for (let i = 0; i < 2; i += 1) this.organelles.push(make(2, 0.08 + this.random() * 0.04));
  }

  private seedDye(seed: number): void {
    const n = this.n;
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const density = dyeDensity(seed, (i / (n - 1)) * 2 - 1, (j / (n - 1)) * 2 - 1);
        this.dye.forEach((channel, c) => {
          channel[j * n + i] = at(this.tint, c) * 0.72 * density;
        });
      }
    }
  }

  private gridPoint(x: number, y: number, margin: number): [number, number] {
    const n = this.n;
    return [
      clamp((x * 0.5 + 0.5) * (n - 1), margin, n - 1 - margin),
      clamp((y * 0.5 + 0.5) * (n - 1), margin, n - 1 - margin),
    ];
  }

  private flowAt(x: number, y: number): [number, number] {
    const [gx, gy] = this.gridPoint(x, y, 1);
    const scale = this.n * 0.5;
    return [sampleGrid(this.u, this.n, gx, gy) / scale, sampleGrid(this.v, this.n, gx, gy) / scale];
  }

  averageColor(): Rgb {
    const [r, g, b] = this.dye.map((channel) => channel.reduce((sum, value) => sum + value, 0) / this.size);
    return [r ?? 0, g ?? 0, b ?? 0];
  }

  addFood(options: FoodOptions): void {
    this.food.add(options);
    this.dirty = true;
  }

  mergeFrom(source: Interior, localX: number, localY: number, strength: number, spread: number): void {
    const n = this.n;
    const sn = source.n;
    const cx = (clamp(localX, -0.95, 0.95) * 0.5 + 0.5) * (n - 1);
    const cy = (clamp(localY, -0.95, 0.95) * 0.5 + 0.5) * (n - 1);
    const radius = Math.max(1.5, clamp(spread, 0.08, 0.9) * (n - 1) * 0.7);
    for (let j = Math.max(0, Math.floor(cy - radius)); j <= Math.min(n - 1, Math.ceil(cy + radius)); j += 1) {
      for (let i = Math.max(0, Math.floor(cx - radius)); i <= Math.min(n - 1, Math.ceil(cx + radius)); i += 1) {
        const dx = (i - cx) / radius;
        const dy = (j - cy) / radius;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 1) continue;
        const weight = strength * (1 - distance) ** 1.4;
        const sx = clamp((dx * 0.5 + 0.5) * (sn - 1), 0, sn - 1);
        const sy = clamp((dy * 0.5 + 0.5) * (sn - 1), 0, sn - 1);
        this.dye.forEach((channel, c) => {
          const from = source.dye[c] ?? channel;
          channel[j * n + i] = at(channel, j * n + i) + sampleGrid(from, sn, sx, sy) * weight;
        });
      }
    }
    this.dirty = true;
  }

  transferFoodFrom(source: Interior, localX: number, localY: number, spread: number): void {
    for (const item of source.food.items) {
      this.addFood({
        x: localX + item.x * spread,
        y: localY + item.y * spread,
        color: item.color,
        size: item.size * spread,
      });
    }
  }

  drain(fraction: number): void {
    const keep = 1 - clamp(fraction, 0, 0.9);
    for (const channel of this.dye) {
      for (let i = 0; i < this.size; i += 1) channel[i] = at(channel, i) * keep;
    }
    this.dirty = true;
  }

  splitTo(target: Interior, dirX: number, dirY: number): void {
    const n = this.n;
    for (const channel of target.dye) channel.fill(0);
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const side = ((i / (n - 1)) * 2 - 1) * dirX + ((j / (n - 1)) * 2 - 1) * dirY;
        const move = moveFraction(side);
        if (move > 0) this.moveDye(target, j * n + i, move);
      }
    }
    this.food.splitTo(target.food, dirX, dirY);
    this.dirty = true;
    target.dirty = true;
  }

  private moveDye(target: Interior, index: number, move: number): void {
    this.dye.forEach((channel, c) => {
      const destination = target.dye[c];
      if (destination) destination[index] = at(channel, index) * move;
      channel[index] = at(channel, index) * (1 - move);
    });
  }

  addDye(x: number, y: number, color: Rgb, strength: number): void {
    const n = this.n;
    const [cx, cy] = this.gridPoint(x, y, 1);
    const radius = 2.4;
    for (let j = -3; j <= 3; j += 1) {
      for (let i = -3; i <= 3; i += 1) {
        const distance = Math.sqrt(i * i + j * j);
        if (distance > radius) continue;
        const index = clamp(Math.round(cy + j), 0, n - 1) * n + clamp(Math.round(cx + i), 0, n - 1);
        const weight = (strength || 0.2) * (1 - distance / radius) ** 1.6;
        this.dye.forEach((channel, c) => {
          channel[index] = at(channel, index) + at(color, c) * weight;
        });
      }
    }
    this.dirty = true;
  }

  step(dt: number, motion: { readonly vx: number; readonly vy: number }): boolean {
    this.accumulator += dt;
    if (this.accumulator < STEP_INTERVAL) return false;
    const stepDt = Math.min(this.accumulator, 0.055);
    this.accumulator = 0;
    this.simulate(stepDt, motion);
    return true;
  }

  private stir(dt: number, motion: { readonly vx: number; readonly vy: number }): void {
    const n = this.n;
    const time = this.swirlPhase;
    const speed = Math.hypot(motion.vx, motion.vy) + 0.001;
    const flow = Math.min(2.4, speed * 0.0042);
    const pushX = (motion.vx / speed) * flow * 3.4;
    const pushY = (motion.vy / speed) * flow * 3.4;
    for (let j = 0; j < n; j += 1) {
      const y = (j / (n - 1)) * 2 - 1;
      for (let i = 0; i < n; i += 1) {
        const x = (i / (n - 1)) * 2 - 1;
        const index = j * n + i;
        const swirlA = Math.sin(y * 4.3 + time * 0.83) * Math.cos(x * 3.7 - time * 0.61);
        const swirlB = Math.cos(y * 3.1 - time * 0.49) * Math.sin(x * 4.9 + time * 0.71);
        const edge = Math.max(0, 1 - Math.sqrt(x * x + y * y)) ** 1.5;
        this.u[index] = (at(this.u, index) + (swirlA * 2.2 + pushX) * edge * dt) * 0.965;
        this.v[index] = (at(this.v, index) + (swirlB * 2.2 + pushY) * edge * dt) * 0.965;
      }
    }
  }

  private simulate(dt: number, motion: { readonly vx: number; readonly vy: number }): void {
    this.stir(dt, motion);
    advect(
      this.n,
      { u: this.u, v: this.v },
      dt,
      [
        [this.u, this.u2],
        [this.v, this.v2],
      ],
      0.988,
    );
    [this.u, this.u2] = [this.u2, this.u];
    [this.v, this.v2] = [this.v2, this.v];
    project(this.n, this.u, this.v, this.p, this.div);
    const [r, g, b] = this.dye;
    const [r2, g2, b2] = this.dye2;
    advect(
      this.n,
      { u: this.u, v: this.v },
      dt,
      [
        [r, r2],
        [g, g2],
        [b, b2],
      ],
      0.995,
    );
    [this.dye, this.dye2] = [this.dye2, this.dye];
    this.homeostasis(dt);
    this.updateOrganelles(dt);
    this.food.update(dt, (x, y) => this.flowAt(x, y));
    this.writeTexture();
  }

  private homeostasis(dt: number): void {
    const rate = Math.min(0.4, dt * 0.085);
    this.dye.forEach((channel, c) => {
      const base = at(this.tint, c) * this.baseLevel;
      for (let i = 0; i < this.size; i += 1) channel[i] = at(channel, i) + (base - at(channel, i)) * rate;
    });
  }

  private updateOrganelles(dt: number): void {
    for (const item of this.organelles) {
      const [flowU, flowV] = this.flowAt(item.x, item.y);
      const weight = item.type === 0 ? 0.18 : 0.55;
      const orbit = item.type === 0 ? 0.05 : 0.16;
      item.vx = (item.vx + flowU * dt * weight - item.y * orbit * dt) * 0.94;
      item.vy = (item.vy + flowV * dt * weight + item.x * orbit * dt) * 0.94;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      const limit = Math.max(0.1, 0.62 - item.radius);
      const distance = Math.hypot(item.x, item.y);
      if (distance > limit) {
        item.x *= limit / distance;
        item.y *= limit / distance;
        item.vx *= -0.35;
        item.vy *= -0.35;
      }
    }
  }

  private writeTexture(): void {
    const [r, g, b] = this.dye;
    const data = this.textureData;
    for (let i = 0; i < this.size; i += 1) {
      data[i * 4] = clamp(at(r, i) * 255, 0, 255);
      data[i * 4 + 1] = clamp(at(g, i) * 255, 0, 255);
      data[i * 4 + 2] = clamp(at(b, i) * 255, 0, 255);
      data[i * 4 + 3] = 255;
    }
    this.food.paint(data, this.n);
    this.dirty = false;
  }
}
