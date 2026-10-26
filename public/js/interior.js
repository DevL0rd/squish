function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

export class Interior {
  constructor(resolution, seed, tint) {
    this.n = resolution;
    this.size = resolution * resolution;
    this.u = new Float32Array(this.size);
    this.v = new Float32Array(this.size);
    this.u2 = new Float32Array(this.size);
    this.v2 = new Float32Array(this.size);
    this.p = new Float32Array(this.size);
    this.div = new Float32Array(this.size);
    this.r = new Float32Array(this.size);
    this.g = new Float32Array(this.size);
    this.b = new Float32Array(this.size);
    this.r2 = new Float32Array(this.size);
    this.g2 = new Float32Array(this.size);
    this.b2 = new Float32Array(this.size);
    this.textureData = new Uint8Array(this.size * 4);
    this.food = [];
    this.random = mulberry32(seed);
    this.time = this.random() * 40;
    this.accumulator = 0;
    this.seed = seed;
    this.tint = tint || [0.1, 0.13, 0.13];
    this.baseLevel = tint ? 0.4 : 0.02;
    this.maxFood = 8;
    this.dirty = true;
    this.seedOrganelles();
    this.seedDye();
    this.writeTexture();
  }

  seedOrganelles() {
    const make = (type, radius) => ({
      type,
      radius,
      x: (this.random() - 0.5) * 0.8,
      y: (this.random() - 0.5) * 0.8,
      vx: 0,
      vy: 0,
      angle: this.random() * Math.PI
    });
    this.organelles = [make(0, 0.24 + this.random() * 0.05)];
    const vesicles = 3 + Math.floor(this.random() * 2);
    for (let i = 0; i < vesicles; i += 1) this.organelles.push(make(1, 0.06 + this.random() * 0.055));
    for (let i = 0; i < 2; i += 1) this.organelles.push(make(2, 0.08 + this.random() * 0.04));
  }

  updateOrganelles(dt) {
    const n = this.n;
    for (const item of this.organelles) {
      const gx = clamp((item.x * 0.5 + 0.5) * (n - 1), 1, n - 2);
      const gy = clamp((item.y * 0.5 + 0.5) * (n - 1), 1, n - 2);
      const flowU = this.sample(this.u, gx, gy) / (n * 0.5);
      const flowV = this.sample(this.v, gx, gy) / (n * 0.5);
      const weight = item.type === 0 ? 0.18 : 0.55;
      item.vx += flowU * dt * weight;
      item.vy += flowV * dt * weight;
      const orbit = item.type === 0 ? 0.05 : 0.16;
      item.vx += -item.y * orbit * dt;
      item.vy += item.x * orbit * dt;
      item.vx *= 0.94;
      item.vy *= 0.94;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.angle += item.vx * dt * 0.6;
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

  organelleData() {
    return this.organelles;
  }

  averageColor() {
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < this.size; i += 1) {
      r += this.r[i];
      g += this.g[i];
      b += this.b[i];
    }
    return [r / this.size, g / this.size, b / this.size];
  }

  seedDye() {
    const { n, random, tint } = this;
    const seed = this.seed | 0;
    const hash = (x, y) => {
      let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 144665);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (x, y) => {
      const ix = Math.floor(x);
      const iy = Math.floor(y);
      const fx = x - ix;
      const fy = y - iy;
      const ux = fx * fx * (3 - 2 * fx);
      const uy = fy * fy * (3 - 2 * fy);
      const a = hash(ix, iy);
      const b = hash(ix + 1, iy);
      const c = hash(ix, iy + 1);
      const d = hash(ix + 1, iy + 1);
      return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    };
    const fbm = (x, y) => {
      let value = 0;
      let amplitude = 0.55;
      let px = x;
      let py = y;
      for (let o = 0; o < 4; o += 1) {
        value += noise(px, py) * amplitude;
        const nx = px * 0.8 - py * 0.6;
        const ny = px * 0.6 + py * 0.8;
        px = nx * 2.07 + 11.3;
        py = ny * 2.07 + 7.9;
        amplitude *= 0.5;
      }
      return value;
    };
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const index = j * n + i;
        const x = (i / (n - 1)) * 2 - 1;
        const y = (j / (n - 1)) * 2 - 1;
        const radial = Math.sqrt(x * x + y * y);
        const falloff = Math.max(0, 1 - radial * radial * 0.92);
        const warpX = x * 1.6 + fbm(x * 1.1 + 3.7, y * 1.1 - 1.9) * 0.85;
        const warpY = y * 1.6 + fbm(x * 1.1 - 2.3, y * 1.1 + 5.1) * 0.85;
        const body = fbm(warpX, warpY);
        const veins = fbm(x * 3.1 + body * 1.4, y * 3.1 - body * 1.4);
        const density = clamp(falloff * (0.32 + body * 0.95 + veins * 0.28), 0, 1.25) * (this.tint ? 1 : 0.12);
        this.r[index] = tint[0] * 0.72 * density;
        this.g[index] = tint[1] * 0.72 * density;
        this.b[index] = tint[2] * 0.72 * density;
      }
    }
  }

  sample(field, x, y) {
    const n = this.n;
    const cx = clamp(x, 0, n - 1.001);
    const cy = clamp(y, 0, n - 1.001);
    const x0 = cx | 0;
    const y0 = cy | 0;
    const fx = cx - x0;
    const fy = cy - y0;
    const i00 = y0 * n + x0;
    const i10 = i00 + 1;
    const i01 = i00 + n;
    const i11 = i01 + 1;
    const top = field[i00] * (1 - fx) + field[i10] * fx;
    const bottom = field[i01] * (1 - fx) + field[i11] * fx;
    return top * (1 - fy) + bottom * fy;
  }

  addFood(x, y, color, amount, size, vx, vy) {
    const strength = amount || 1;
    const itemSize = clamp(size ?? (0.035 + this.random() * 0.045), 0.018, 0.32);
    if (this.food.length >= this.maxFood) {
      this.addDye(x, y, color, 0.05 * strength);
      return;
    }
    this.food.push({
      x: clamp(x, -0.82, 0.82),
      y: clamp(y, -0.82, 0.82),
      vx: vx ?? (this.random() - 0.5) * 0.35,
      vy: vy ?? (this.random() - 0.5) * 0.35,
      color: [color[0], color[1], color[2]],
      life: 5.5 + this.random() * 6,
      maxLife: 11.5,
      size: itemSize
    });
    this.dirty = true;
  }

  mergeFrom(source, localX, localY, strength, spread) {
    const n = this.n;
    const sn = source.n;
    const cx = (clamp(localX, -0.95, 0.95) * 0.5 + 0.5) * (n - 1);
    const cy = (clamp(localY, -0.95, 0.95) * 0.5 + 0.5) * (n - 1);
    const radius = Math.max(1.5, clamp(spread, 0.08, 0.9) * (n - 1) * 0.7);
    const lowX = Math.max(0, Math.floor(cx - radius));
    const highX = Math.min(n - 1, Math.ceil(cx + radius));
    const lowY = Math.max(0, Math.floor(cy - radius));
    const highY = Math.min(n - 1, Math.ceil(cy + radius));
    for (let j = lowY; j <= highY; j += 1) {
      for (let i = lowX; i <= highX; i += 1) {
        const dx = (i - cx) / radius;
        const dy = (j - cy) / radius;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > 1) continue;
        const falloff = (1 - distance) ** 1.4;
        const sx = clamp((dx * 0.5 + 0.5) * (sn - 1), 0, sn - 1);
        const sy = clamp((dy * 0.5 + 0.5) * (sn - 1), 0, sn - 1);
        const index = j * n + i;
        this.r[index] += source.sample(source.r, sx, sy) * strength * falloff;
        this.g[index] += source.sample(source.g, sx, sy) * strength * falloff;
        this.b[index] += source.sample(source.b, sx, sy) * strength * falloff;
      }
    }
    this.dirty = true;
  }

  transferFoodFrom(source, localX, localY, spread) {
    for (const item of source.food) {
      const x = localX + item.x * spread;
      const y = localY + item.y * spread;
      this.addFood(x, y, item.color, 1, item.size * spread);
    }
  }

  drain(fraction) {
    const keep = 1 - clamp(fraction, 0, 0.9);
    for (let i = 0; i < this.size; i += 1) {
      this.r[i] *= keep;
      this.g[i] *= keep;
      this.b[i] *= keep;
    }
    this.dirty = true;
  }

  clearDye() {
    this.r.fill(0);
    this.g.fill(0);
    this.b.fill(0);
    this.food.length = 0;
    this.dirty = true;
  }

  splitTo(target, dirX, dirY) {
    const n = this.n;
    target.clearDye();
    for (let j = 0; j < n; j += 1) {
      const y = (j / (n - 1)) * 2 - 1;
      for (let i = 0; i < n; i += 1) {
        const x = (i / (n - 1)) * 2 - 1;
        const side = x * dirX + y * dirY;
        const move = side > 0.08 ? 0.55 : side < -0.08 ? 0 : 0.27;
        if (move <= 0) continue;
        const index = j * n + i;
        target.r[index] = this.r[index] * move;
        target.g[index] = this.g[index] * move;
        target.b[index] = this.b[index] * move;
        this.r[index] *= 1 - move;
        this.g[index] *= 1 - move;
        this.b[index] *= 1 - move;
      }
    }
    const kept = [];
    const moved = [];
    for (const food of this.food) {
      if (food.x * dirX + food.y * dirY > 0) moved.push(food);
      else kept.push(food);
    }
    this.food = kept;
    target.food = moved.slice(0, target.maxFood);
    for (let i = target.maxFood; i < moved.length; i += 1) {
      const item = moved[i];
      target.addDye(item.x, item.y, item.color, 0.12);
    }
    this.dirty = true;
    target.dirty = true;
  }

  addDye(x, y, color, strength) {
    const n = this.n;
    const cx = clamp((x * 0.5 + 0.5) * (n - 1), 1, n - 2);
    const cy = clamp((y * 0.5 + 0.5) * (n - 1), 1, n - 2);
    const radius = 2.4;
    const weight = strength || 0.2;
    for (let j = -3; j <= 3; j += 1) {
      for (let i = -3; i <= 3; i += 1) {
        const dist = Math.sqrt(i * i + j * j);
        if (dist > radius) continue;
        const px = clamp(Math.round(cx + i), 0, n - 1);
        const py = clamp(Math.round(cy + j), 0, n - 1);
        const falloff = (1 - dist / radius) ** 1.6;
        const index = py * n + px;
        this.r[index] += color[0] * weight * falloff;
        this.g[index] += color[1] * weight * falloff;
        this.b[index] += color[2] * weight * falloff;
      }
    }
    this.dirty = true;
  }

  step(dt, cell) {
    this.accumulator += dt;
    if (this.accumulator < 1 / 34) return false;
    const stepDt = Math.min(this.accumulator, 0.055);
    this.accumulator = 0;
    this.simulate(stepDt, cell);
    return true;
  }

  simulate(dt, cell) {
    const n = this.n;
    const size = this.size;
    const time = this.time;
    const vx = cell?.vx || 0;
    const vy = cell?.vy || 0;
    const speed = Math.hypot(vx, vy) + 0.001;
    const dirX = vx / speed;
    const dirY = vy / speed;
    const flow = Math.min(2.4, speed * 0.0042);
    const { u, v, u2, v2, p, div } = this;

    for (let j = 0; j < n; j += 1) {
      const y = (j / (n - 1)) * 2 - 1;
      for (let i = 0; i < n; i += 1) {
        const x = (i / (n - 1)) * 2 - 1;
        const index = j * n + i;
        const swirlA = Math.sin(y * 4.3 + time * 0.83) * Math.cos(x * 3.7 - time * 0.61);
        const swirlB = Math.cos(y * 3.1 - time * 0.49) * Math.sin(x * 4.9 + time * 0.71);
        const edge = Math.max(0, 1 - Math.sqrt(x * x + y * y)) ** 1.5;
        u[index] += (swirlA * 2.2 + dirX * flow * 3.4) * edge * dt;
        v[index] += (swirlB * 2.2 + dirY * flow * 3.4) * edge * dt;
        u[index] *= 0.965;
        v[index] *= 0.965;
      }
    }

    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const index = j * n + i;
        const gx = i - u[index] * dt * n * 0.5;
        const gy = j - v[index] * dt * n * 0.5;
        const nu = this.sample(u, gx, gy);
        const nv = this.sample(v, gx, gy);
        u2[index] = nu * 0.988;
        v2[index] = nv * 0.988;
      }
    }
    this.swapVelocity();
    this.solvePressure();
    this.advectDye(dt);
    this.homeostasis(dt);
    this.updateOrganelles(dt);
    this.updateFood(dt);
    this.writeTexture();
  }

  homeostasis(dt) {
    const { r, g, b, tint, size } = this;
    const rate = Math.min(0.4, dt * 0.085);
    const baseR = tint[0] * this.baseLevel;
    const baseG = tint[1] * this.baseLevel;
    const baseB = tint[2] * this.baseLevel;
    for (let i = 0; i < size; i += 1) {
      r[i] += (baseR - r[i]) * rate;
      g[i] += (baseG - g[i]) * rate;
      b[i] += (baseB - b[i]) * rate;
    }
  }

  swapVelocity() {
    let temp = this.u; this.u = this.u2; this.u2 = temp;
    temp = this.v; this.v = this.v2; this.v2 = temp;
  }

  solvePressure() {
    const n = this.n;
    const { u, v, p, div } = this;
    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const index = j * n + i;
        div[index] = -0.5 * (u[index + 1] - u[index - 1] + v[index + n] - v[index - n]);
        p[index] = 0;
      }
    }
    for (let iteration = 0; iteration < 6; iteration += 1) {
      for (let j = 1; j < n - 1; j += 1) {
        for (let i = 1; i < n - 1; i += 1) {
          const index = j * n + i;
          p[index] = (div[index] + p[index - 1] + p[index + 1] + p[index - n] + p[index + n]) * 0.25;
        }
      }
    }
    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const index = j * n + i;
        u[index] -= 0.5 * (p[index + 1] - p[index - 1]);
        v[index] -= 0.5 * (p[index + n] - p[index - n]);
        const cx = i - (n - 1) / 2;
        const cy = j - (n - 1) / 2;
        if (cx * cx + cy * cy > ((n - 1) / 2) ** 2) {
          u[index] *= 0.9;
          v[index] *= 0.9;
        }
      }
    }
  }

  advectDye(dt) {
    const n = this.n;
    const { u, v, r, g, b, r2, g2, b2 } = this;
    for (let j = 1; j < n - 1; j += 1) {
      for (let i = 1; i < n - 1; i += 1) {
        const index = j * n + i;
        const gx = i - u[index] * dt * n * 0.5;
        const gy = j - v[index] * dt * n * 0.5;
        r2[index] = this.sample(r, gx, gy) * 0.995;
        g2[index] = this.sample(g, gx, gy) * 0.995;
        b2[index] = this.sample(b, gx, gy) * 0.995;
      }
    }
    let temp = this.r; this.r = this.r2; this.r2 = temp;
    temp = this.g; this.g = this.g2; this.g2 = temp;
    temp = this.b; this.b = this.b2; this.b2 = temp;
  }

  updateFood(dt) {
    const n = this.n;
    const { u, v } = this;
    for (let index = this.food.length - 1; index >= 0; index -= 1) {
      const item = this.food[index];
      const gx = clamp((item.x * 0.5 + 0.5) * (n - 1), 1, n - 2);
      const gy = clamp((item.y * 0.5 + 0.5) * (n - 1), 1, n - 2);
      const flowU = this.sample(u, gx, gy) / (n * 0.5);
      const flowV = this.sample(v, gx, gy) / (n * 0.5);
      item.vx += flowU * dt * 0.35;
      item.vy += flowV * dt * 0.35;
      item.vx *= 0.985;
      item.vy *= 0.985;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      if (item.x > 0.86 || item.x < -0.86) item.vx *= -0.75;
      if (item.y > 0.86 || item.y < -0.86) item.vy *= -0.75;
      item.x = clamp(item.x, -0.88, 0.88);
      item.y = clamp(item.y, -0.88, 0.88);
      const dissolve = 1 - Math.min(1, dt * 0.22);
      item.size *= dissolve;
      item.life -= dt;
      const strength = Math.min(1, dt * 1.7) * 0.1 * (0.45 + 0.55 * Math.min(1, item.life));
      this.addDye(item.x, item.y, item.color, strength);
      if (item.life <= 0 || item.size < 0.006) {
        this.food.splice(index, 1);
      }
    }
  }

  foodData() {
    const data = [];
    for (let i = 0; i < this.food.length && i < this.maxFood; i += 1) {
      const item = this.food[i];
      data.push({
        x: item.x,
        y: item.y,
        size: item.size,
        alpha: Math.min(1, item.size * 18) * Math.min(1, item.life * 0.55),
        color: item.color
      });
    }
    return data;
  }

  writeTexture() {
    const { r, g, b, textureData, n } = this;
    for (let i = 0; i < this.size; i += 1) {
      const offset = i * 4;
      textureData[offset] = clamp(r[i] * 255, 0, 255);
      textureData[offset + 1] = clamp(g[i] * 255, 0, 255);
      textureData[offset + 2] = clamp(b[i] * 255, 0, 255);
      textureData[offset + 3] = 255;
    }
    for (const item of this.food) {
      const cx = (item.x * 0.5 + 0.5) * (n - 1);
      const cy = (item.y * 0.5 + 0.5) * (n - 1);
      const radius = Math.max(0.8, item.size * (n - 1) * 0.55);
      const alpha = clamp(item.size * 9, 0, 1) * clamp(item.life * 0.45, 0, 1);
      const lowX = Math.max(0, Math.floor(cx - radius));
      const highX = Math.min(n - 1, Math.ceil(cx + radius));
      const lowY = Math.max(0, Math.floor(cy - radius));
      const highY = Math.min(n - 1, Math.ceil(cy + radius));
      for (let j = lowY; j <= highY; j += 1) {
        for (let i = lowX; i <= highX; i += 1) {
          const dx = (i - cx) / radius;
          const dy = (j - cy) / radius;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance > 1) continue;
          const falloff = (1 - distance) ** 1.5;
          const boost = alpha * falloff * 0.9;
          const offset = (j * n + i) * 4;
          textureData[offset] = clamp(textureData[offset] + item.color[0] * 255 * boost, 0, 255);
          textureData[offset + 1] = clamp(textureData[offset + 1] + item.color[1] * 255 * boost, 0, 255);
          textureData[offset + 2] = clamp(textureData[offset + 2] + item.color[2] * 255 * boost, 0, 255);
        }
      }
    }
    this.dirty = false;
  }

}
