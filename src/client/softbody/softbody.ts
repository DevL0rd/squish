import { at, clamp, mulberry32 } from '../../shared/math.ts';
import { forkShapes } from './fork.ts';

export interface Circle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface Motion extends Circle {
  readonly vx: number;
  readonly vy: number;
}

export type FlowSampler = (x: number, y: number) => readonly [number, number] | null;

const SUB_STEPS = 3;
const MAX_VERTEX_SPEED = 900;

interface StepContext {
  readonly body: Motion;
  readonly neighbors: readonly Circle[];
  readonly flowAt: FlowSampler;
  readonly accelX: number;
  readonly accelY: number;
  readonly flowAngle: number;
  readonly speedFactor: number;
  readonly restLength: number;
  pressure: number;
}

export class SoftBody {
  readonly count: number;
  readonly angle: Float32Array;
  readonly px: Float32Array;
  readonly py: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly holdPx: Float32Array;
  readonly holdPy: Float32Array;
  readonly random: () => number;
  cx = 0;
  cy = 0;
  kick = 0;
  cleavage = 0;
  cleavageDirX = 0;
  cleavageDirY = 0;
  hold = 0;
  private readonly phase: Float32Array;
  private readonly ax: Float32Array;
  private readonly ay: Float32Array;
  private lastVx = 0;
  private lastVy = 0;
  private time: number;
  private tumble: number;
  private initialized = false;

  constructor(count: number, seed: number) {
    this.count = count;
    this.random = mulberry32(seed);
    const array = (): Float32Array => new Float32Array(count);
    this.angle = array();
    this.phase = array();
    this.px = array();
    this.py = array();
    this.vx = array();
    this.vy = array();
    this.holdPx = array();
    this.holdPy = array();
    this.ax = array();
    this.ay = array();
    this.time = this.random() * 20;
    for (let i = 0; i < count; i += 1) {
      this.angle[i] = (i / count) * Math.PI * 2;
      this.phase[i] = this.random() * Math.PI * 2;
    }
    this.tumble = this.random() * Math.PI * 2;
  }

  reset(x: number, y: number, radius: number): void {
    this.cx = x;
    this.cy = y;
    for (let i = 0; i < this.count; i += 1) {
      const angle = at(this.angle, i);
      const organic =
        1 + Math.sin(angle * 3 + this.random() * 0.8) * 0.018 + Math.sin(angle * 5 - this.random() * 0.6) * 0.004;
      this.px[i] = Math.cos(angle) * radius * organic;
      this.py[i] = Math.sin(angle) * radius * organic;
      this.vx[i] = 0;
      this.vy[i] = 0;
    }
    this.initialized = true;
  }

  kickBody(strength: number): void {
    this.kick = clamp(this.kick + strength, 0, 2.4);
  }

  forkTo(child: SoftBody, parent: Circle, offspring: Circle, dir: { readonly x: number; readonly y: number }): void {
    forkShapes(this, child, parent, offspring, dir);
  }

  update(dt: number, body: Motion, neighbors: readonly Circle[], flowAt: FlowSampler): void {
    if (!this.initialized) this.reset(body.x, body.y, body.radius);
    this.time += dt;
    this.tumble += dt * 0.19;
    const centerBlend = 1 - Math.exp(-dt * 20);
    this.cx += (body.x - this.cx) * centerBlend;
    this.cy += (body.y - this.cy) * centerBlend;
    const invDt = 1 / Math.max(dt, 0.001);
    const speed = Math.hypot(body.vx, body.vy);
    const context: StepContext = {
      body,
      neighbors,
      flowAt,
      accelX: clamp((body.vx - this.lastVx) * invDt, -2400, 2400),
      accelY: clamp((body.vy - this.lastVy) * invDt, -2400, 2400),
      flowAngle: speed > 1 ? Math.atan2(body.vy, body.vx) : 0,
      speedFactor: clamp(speed / 320, 0, 1.25),
      restLength: (Math.PI * 2 * body.radius) / this.count,
      pressure: 0,
    };
    this.lastVx = body.vx;
    this.lastVy = body.vy;
    for (let step = 0; step < SUB_STEPS; step += 1) this.subStep(context, dt / SUB_STEPS);
    this.applyHold(dt);
    this.kick *= Math.exp(-dt * 5.5);
    this.cleavage *= Math.exp(-dt * 5.5);
  }

  private area(): number {
    let area = 0;
    for (let i = 0; i < this.count; i += 1) {
      const j = (i + 1) % this.count;
      area += at(this.px, i) * at(this.py, j) - at(this.px, j) * at(this.py, i);
    }
    return area * 0.5;
  }

  private subStep(context: StepContext, h: number): void {
    const targetArea = Math.PI * context.body.radius * context.body.radius;
    context.pressure = clamp((targetArea - this.area()) / Math.max(targetArea, 1), -1.4, 1.4);
    this.ax.fill(0);
    this.ay.fill(0);
    for (let i = 0; i < this.count; i += 1) {
      this.springForce(i, context.restLength);
      this.shapeForce(i, context);
      this.contactForce(i, context);
      this.drivingForce(i);
    }
    for (let i = 0; i < this.count; i += 1) this.integrate(i, h, context.body.radius);
  }

  private push(i: number, x: number, y: number): void {
    this.ax[i] = at(this.ax, i) + x;
    this.ay[i] = at(this.ay, i) + y;
  }

  private springForce(i: number, restLength: number): void {
    const j = (i + 1) % this.count;
    const dx = at(this.px, j) - at(this.px, i);
    const dy = at(this.py, j) - at(this.py, i);
    const distance = Math.hypot(dx, dy) || 0.001;
    const stretch = (distance - restLength) * 118;
    this.push(i, (dx / distance) * stretch, (dy / distance) * stretch);
    this.push(j, (-dx / distance) * stretch, (-dy / distance) * stretch);
  }

  private shapeForce(i: number, context: StepContext): void {
    const angle = at(this.angle, i);
    const phase = at(this.phase, i);
    const radius = context.body.radius;
    const radial = Math.hypot(at(this.px, i), at(this.py, i)) || 0.001;
    const along = Math.cos(angle - context.flowAngle);
    const wobble =
      1 +
      Math.cos(2 * (angle - this.tumble)) * 0.052 +
      Math.sin(angle * 3 + this.time * 0.42 + phase) * 0.042 +
      Math.sin(angle * 5 - this.time * 0.31 + phase * 2.1) * 0.02;
    const restRadius = radius * (wobble + context.speedFactor * (along * along - 0.5) * 0.07);
    const strength = ((restRadius - radial) * 68 + context.pressure * 1010) * clamp(radial / radius, 0.35, 1.8);
    this.push(i, (at(this.px, i) / radial) * strength, (at(this.py, i) / radial) * strength);
    this.push(i, -context.accelX * 0.004, -context.accelY * 0.004);
  }

  private contactForce(i: number, context: StepContext): void {
    const wx = this.cx + at(this.px, i);
    const wy = this.cy + at(this.py, i);
    const flow = context.flowAt(wx, wy);
    if (flow) {
      this.push(
        i,
        clamp((flow[0] - context.body.vx * 0.55) * 0.12, -90, 90),
        clamp((flow[1] - context.body.vy * 0.55) * 0.12, -90, 90),
      );
    }
    for (const other of context.neighbors) {
      const nx = wx - other.x;
      const ny = wy - other.y;
      const distance = Math.hypot(nx, ny) || 0.001;
      const reach = other.radius * 1.05;
      if (distance < reach) {
        const push = ((reach - distance) / reach) * 210;
        this.push(i, (nx / distance) * push, (ny / distance) * push);
      }
    }
  }

  private drivingForce(i: number): void {
    const angle = at(this.angle, i);
    const phase = at(this.phase, i);
    if (this.cleavage > 0) {
      const side = at(this.px, i) * this.cleavageDirX + at(this.py, i) * this.cleavageDirY;
      if (side > 0) {
        const pinch = side * 700 * this.cleavage;
        this.push(i, -this.cleavageDirX * pinch, -this.cleavageDirY * pinch);
      }
    }
    this.push(i, Math.cos(angle) * this.kick * 180, Math.sin(angle) * this.kick * 180);
    this.push(
      i,
      Math.sin(this.time * 0.7 + angle * 2 + phase) * 1.2,
      Math.cos(this.time * 0.63 + angle * 2 - phase) * 1.2,
    );
  }

  private integrate(i: number, h: number, radius: number): void {
    const damping = Math.exp(-h * 4.4);
    let vx = (at(this.vx, i) + at(this.ax, i) * h) * damping;
    let vy = (at(this.vy, i) + at(this.ay, i) * h) * damping;
    const speed = Math.hypot(vx, vy);
    if (speed > MAX_VERTEX_SPEED) {
      vx = (vx / speed) * MAX_VERTEX_SPEED;
      vy = (vy / speed) * MAX_VERTEX_SPEED;
    }
    let x = at(this.px, i) + vx * h;
    let y = at(this.py, i) + vy * h;
    const radial = Math.hypot(x, y) || 0.001;
    const limit = clamp(radial, radius * 0.68, radius * 1.32);
    if (limit !== radial) {
      x = (x / radial) * limit;
      y = (y / radial) * limit;
      vx *= 0.35;
      vy *= 0.35;
    }
    this.px[i] = x;
    this.py[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
  }

  private applyHold(dt: number): void {
    if (this.hold <= 0) return;
    const blend = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < this.count; i += 1) {
      this.px[i] = at(this.px, i) + (at(this.holdPx, i) - at(this.px, i)) * blend;
      this.py[i] = at(this.py, i) + (at(this.holdPy, i) - at(this.py, i)) * blend;
    }
    this.hold -= dt;
  }
}
