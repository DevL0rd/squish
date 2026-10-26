import { clamp, type Rgb } from '../../shared/math.ts';

const MAX_FOOD = 8;

export interface FoodOptions {
  readonly x: number;
  readonly y: number;
  readonly color: Rgb;
  readonly amount?: number;
  readonly size?: number;
  readonly vx?: number;
  readonly vy?: number;
}

export interface FoodItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly color: Rgb;
  life: number;
  size: number;
}

export interface FoodSprite {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly alpha: number;
  readonly color: Rgb;
}

type DyeSink = (x: number, y: number, color: Rgb, strength: number) => void;

export class InteriorFood {
  items: FoodItem[] = [];
  private readonly random: () => number;
  private readonly dye: DyeSink;

  constructor(random: () => number, dye: DyeSink) {
    this.random = random;
    this.dye = dye;
  }

  add(options: FoodOptions): void {
    const size = clamp(options.size ?? 0.035 + this.random() * 0.045, 0.018, 0.32);
    if (this.items.length >= MAX_FOOD) {
      this.dye(options.x, options.y, options.color, 0.05 * (options.amount ?? 1));
      return;
    }
    this.items.push({
      x: clamp(options.x, -0.82, 0.82),
      y: clamp(options.y, -0.82, 0.82),
      vx: options.vx ?? (this.random() - 0.5) * 0.35,
      vy: options.vy ?? (this.random() - 0.5) * 0.35,
      color: [options.color[0], options.color[1], options.color[2]],
      life: 5.5 + this.random() * 6,
      size,
    });
  }

  splitTo(target: InteriorFood, dirX: number, dirY: number): void {
    const moved = this.items.filter((item) => item.x * dirX + item.y * dirY > 0);
    this.items = this.items.filter((item) => item.x * dirX + item.y * dirY <= 0);
    target.items = moved.slice(0, MAX_FOOD);
    for (const item of moved.slice(MAX_FOOD)) target.dye(item.x, item.y, item.color, 0.12);
  }

  update(dt: number, flowAt: (x: number, y: number) => readonly [number, number]): void {
    for (let index = this.items.length - 1; index >= 0; index -= 1) {
      const item = this.items[index];
      if (!item) continue;
      const [flowU, flowV] = flowAt(item.x, item.y);
      item.vx = (item.vx + flowU * dt * 0.35) * 0.985;
      item.vy = (item.vy + flowV * dt * 0.35) * 0.985;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      if (Math.abs(item.x) > 0.86) item.vx *= -0.75;
      if (Math.abs(item.y) > 0.86) item.vy *= -0.75;
      item.x = clamp(item.x, -0.88, 0.88);
      item.y = clamp(item.y, -0.88, 0.88);
      item.size *= 1 - Math.min(1, dt * 0.22);
      item.life -= dt;
      this.dye(item.x, item.y, item.color, Math.min(1, dt * 1.7) * 0.1 * (0.45 + 0.55 * Math.min(1, item.life)));
      if (item.life <= 0 || item.size < 0.006) this.items.splice(index, 1);
    }
  }

  sprites(): FoodSprite[] {
    return this.items.slice(0, MAX_FOOD).map((item) => ({
      x: item.x,
      y: item.y,
      size: item.size,
      alpha: Math.min(1, item.size * 18) * Math.min(1, item.life * 0.55),
      color: item.color,
    }));
  }

  paint(data: Uint8Array, n: number): void {
    for (const item of this.items) {
      const cx = (item.x * 0.5 + 0.5) * (n - 1);
      const cy = (item.y * 0.5 + 0.5) * (n - 1);
      const radius = Math.max(0.8, item.size * (n - 1) * 0.55);
      const alpha = clamp(item.size * 9, 0, 1) * clamp(item.life * 0.45, 0, 1);
      for (let j = Math.max(0, Math.floor(cy - radius)); j <= Math.min(n - 1, Math.ceil(cy + radius)); j += 1) {
        for (let i = Math.max(0, Math.floor(cx - radius)); i <= Math.min(n - 1, Math.ceil(cx + radius)); i += 1) {
          const distance = Math.hypot((i - cx) / radius, (j - cy) / radius);
          if (distance <= 1) paintTexel(data, (j * n + i) * 4, item.color, alpha * (1 - distance) ** 1.5 * 0.9);
        }
      }
    }
  }
}

function paintTexel(data: Uint8Array, offset: number, color: Rgb, boost: number): void {
  for (let c = 0; c < 3; c += 1) {
    data[offset + c] = clamp((data[offset + c] ?? 0) + (color[c] ?? 0) * 255 * boost, 0, 255);
  }
}
