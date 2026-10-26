import { clamp, digestionRate, type Rgb } from '../../shared/math.ts';
import { insideRing, type Point, type Ring } from './geometry.ts';
import type { Cup } from './membrane.ts';

export const OrganelleKind = {
  Nucleus: 0,
  Vacuole: 1,
  Granule: 2,
  Food: 3,
  Lipid: 4,
  Parasite: 5,
  Phage: 6,
  Creature: 7,
} as const;

export interface Organelle {
  readonly kind: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: Rgb;
  life: number;
  maxLife: number;
  phase: number;
  variety: number;
  angle: number;
  cup: Cup | null;
}

interface Fluid {
  flowAt(x: number, y: number): readonly [number, number];
  addDye(x: number, y: number, color: Rgb, strength: number): void;
  addVortex(x: number, y: number, radius: number, strength: number): void;
}

interface Frame {
  readonly ring: Ring;
  readonly center: Point;
  readonly scale: number;
  readonly fluid: Fluid;
}

const GRANULE_AREA = 150;
const MAX_GRANULES = 150;
const DISSOLVE_DYE = 0.36;
const FLOW_GAIN = 6;
const RUPTURE_DYE = 0.7;
const NEUTRAL: Rgb = [0.75, 0.82, 0.78];
const MOBILITY: Readonly<Record<number, number>> = {
  [OrganelleKind.Nucleus]: 0.25,
  [OrganelleKind.Granule]: 1.4,
  [OrganelleKind.Parasite]: 2.2,
  [OrganelleKind.Phage]: 1.8,
};
const JITTER: Readonly<Record<number, number>> = {
  [OrganelleKind.Granule]: 26,
  [OrganelleKind.Parasite]: 160,
  [OrganelleKind.Phage]: 60,
};
const LIVING = new Set<number>([OrganelleKind.Parasite, OrganelleKind.Phage]);
const SHRINK: Readonly<Record<number, number>> = { [OrganelleKind.Food]: 0.09, [OrganelleKind.Creature]: 0.03 };

export class Organelles {
  items: Organelle[] = [];
  private readonly random: () => number;
  private readonly streamSeed: number;
  private time = 0;

  constructor(random: () => number) {
    this.random = random;
    this.streamSeed = random() * 100;
  }

  make(kind: number, at: Point, radius: number, color: Rgb = NEUTRAL, life = Infinity): Organelle {
    const item = {
      kind,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      radius,
      color,
      life,
      maxLife: life,
      phase: this.random() * 10,
      variety: 0,
      angle: 0,
      cup: null,
    };
    this.items.push(item);
    return item;
  }

  seed(radius: number): void {
    this.make(OrganelleKind.Nucleus, this.scatter(radius * 0.2), radius * 0.26);
    this.make(OrganelleKind.Vacuole, this.scatter(radius * 0.55), radius * 0.12);
    for (let i = 0; i < 3; i += 1) this.make(OrganelleKind.Lipid, this.scatter(radius * 0.6), radius * 0.05);
  }

  private scatter(reach: number): Point {
    const angle = this.random() * Math.PI * 2;
    const distance = Math.sqrt(this.random()) * reach;
    return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
  }

  private replenish(radius: number): void {
    const wanted = clamp(Math.round((Math.PI * radius * radius) / GRANULE_AREA), 10, MAX_GRANULES);
    let granules = this.items.filter((item) => item.kind === OrganelleKind.Granule).length;
    for (; granules < wanted; granules += 1) {
      this.make(OrganelleKind.Granule, this.scatter(radius * 0.8), 0.9 + this.random() * 1.6);
    }
  }

  private streaming(): number {
    return (
      Math.sin(this.time * 0.09 + this.streamSeed) * 0.22 + Math.sin(this.time * 0.031 + this.streamSeed * 2) * 0.12
    );
  }

  update(dt: number, frame: Frame, radius: number): void {
    this.time += dt;
    this.replenish(radius);
    for (const item of this.items) {
      this.drift(item, dt, frame);
      this.contain(item, frame);
      this.mature(item, dt, frame, radius);
    }
    this.items = this.items.filter((item) => item.life > 0);
    this.repelFromNuclei();
  }

  private drift(item: Organelle, dt: number, frame: Frame): void {
    const [fx, fy] = frame.fluid.flowAt(item.x / frame.scale, item.y / frame.scale);
    const mobility = MOBILITY[item.kind] ?? 0.7;
    const jitter = JITTER[item.kind] ?? 6;
    const spin = this.streaming();
    const targetX = (fx * frame.scale * FLOW_GAIN - item.y * spin) * mobility;
    const targetY = (fy * frame.scale * FLOW_GAIN + item.x * spin) * mobility;
    item.vx += (targetX - item.vx) * dt * 2 + (this.random() - 0.5) * jitter * dt;
    item.vy += (targetY - item.vy) * dt * 2 + (this.random() - 0.5) * jitter * dt;
    item.x += item.vx * dt;
    item.y += item.vy * dt;
  }

  private contain(item: Organelle, frame: Frame): void {
    const margin = item.kind === OrganelleKind.Granule ? 1.12 : 1 + item.radius / frame.scale;
    const probeX = frame.center.x + item.x * margin;
    const probeY = frame.center.y + item.y * margin;
    if (insideRing(frame.ring, probeX, probeY)) return;
    if (item.cup) item.cup.life = Math.max(item.cup.life, 0.3);
    const pull = item.cup ? 0.97 : 0.9;
    item.x *= pull;
    item.y *= pull;
    item.vx *= -0.3;
    item.vy *= -0.3;
  }

  private mature(item: Organelle, dt: number, frame: Frame, radius: number): void {
    if (Number.isFinite(item.maxLife)) {
      this.dissolve(item, dt, frame, radius);
      return;
    }
    if (item.kind === OrganelleKind.Vacuole) {
      item.radius = radius * (0.05 + 0.09 * pulse(item.phase + performance.now() * 0.00016));
    }
  }

  private dissolve(item: Organelle, dt: number, frame: Frame, radius: number): void {
    if (LIVING.has(item.kind)) {
      item.life -= dt;
      frame.fluid.addDye(item.x / frame.scale, item.y / frame.scale, item.color, dt * 0.05);
      return;
    }
    const rate = digestionRate(radius);
    item.life -= dt * rate;
    if (item.kind === OrganelleKind.Creature && item.life <= 0) {
      this.rupture(item, frame, radius);
      return;
    }
    item.radius *= 1 - Math.min(1, dt * rate * (SHRINK[item.kind] ?? 0.45));
    const strength = Math.min(1, dt * 1.6) * DISSOLVE_DYE * clamp(item.radius / (radius * 0.12), 0.3, 2);
    frame.fluid.addDye(item.x / frame.scale, item.y / frame.scale, item.color, strength);
  }

  private rupture(item: Organelle, frame: Frame, radius: number): void {
    const x = item.x / frame.scale;
    const y = item.y / frame.scale;
    const size = clamp(item.radius / (radius * 0.15), 0.4, 2.5);
    for (let i = 0; i < 4; i += 1) {
      const angle = (i / 4) * Math.PI * 2 + item.phase;
      const reach = (item.radius / frame.scale) * 0.6;
      frame.fluid.addDye(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, item.color, RUPTURE_DYE * size);
    }
    const spacing = (item.radius / frame.scale) * 0.8;
    frame.fluid.addVortex(x + spacing, y, 0.3, 1.6 * size);
    frame.fluid.addVortex(x - spacing, y, 0.3, -1.6 * size);
  }

  dissolveAll(random: () => number, color: Rgb): void {
    for (const item of this.items) {
      if (item.kind === OrganelleKind.Granule || Number.isFinite(item.maxLife)) continue;
      item.color = color;
      item.maxLife = 1.8 + random() * 2.2;
      item.life = item.maxLife;
    }
  }

  private repelFromNuclei(): void {
    const nuclei = this.items.filter((item) => item.kind === OrganelleKind.Nucleus);
    for (const nucleus of nuclei) {
      for (const item of this.items) {
        if (item === nucleus) continue;
        const dx = item.x - nucleus.x;
        const dy = item.y - nucleus.y;
        const distance = Math.hypot(dx, dy) || 1e-3;
        const reach = nucleus.radius + item.radius;
        if (distance >= reach) continue;
        const push = (reach - distance) * 0.5;
        item.x += (dx / distance) * push;
        item.y += (dy / distance) * push;
      }
    }
  }

  shift(dx: number, dy: number): void {
    for (const item of this.items) {
      item.x += dx;
      item.y += dy;
    }
  }
}

function pulse(t: number): number {
  const phase = t - Math.floor(t);
  return phase < 0.85 ? phase / 0.85 : 1 - (phase - 0.85) / 0.15;
}
