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

export class SoftBody {
  constructor(count, seed) {
    this.count = count;
    this.random = mulberry32(seed);
    this.angle = new Float32Array(count);
    this.phase = new Float32Array(count);
    this.px = new Float32Array(count);
    this.py = new Float32Array(count);
    this.vx = new Float32Array(count);
    this.vy = new Float32Array(count);
    this.cx = 0;
    this.cy = 0;
    this.lastVx = 0;
    this.lastVy = 0;
    this.time = this.random() * 20;
    this.kick = 0;
    this.cleavage = 0;
    this.cleavageDirX = 0;
    this.cleavageDirY = 0;
    this.hold = 0;
    this.holdPx = new Float32Array(count);
    this.holdPy = new Float32Array(count);
    this.initialized = false;
    for (let i = 0; i < count; i += 1) {
      this.angle[i] = (i / count) * Math.PI * 2;
      this.phase[i] = this.random() * Math.PI * 2;
    }
    this.tumble = this.random() * Math.PI * 2;
  }

  reset(x, y, radius) {
    this.cx = x;
    this.cy = y;
    for (let i = 0; i < this.count; i += 1) {
      const angle = this.angle[i];
      const organic = 1 + Math.sin(angle * 3 + this.random() * 0.8) * 0.018 + Math.sin(angle * 5 - this.random() * 0.6) * 0.004;
      this.px[i] = Math.cos(angle) * radius * organic;
      this.py[i] = Math.sin(angle) * radius * organic;
      this.vx[i] = 0;
      this.vy[i] = 0;
    }
    this.initialized = true;
  }

  kickBody(strength) {
    this.kick = clamp(this.kick + strength, 0, 2.4);
  }

  update(dt, x, y, radius, cellVx, cellVy, neighbors, flowAt) {
    if (!this.initialized) this.reset(x, y, radius);
    this.time += dt;
    this.tumble += dt * 0.19;
    const centerBlend = 1 - Math.exp(-dt * 20);
    this.cx += (x - this.cx) * centerBlend;
    this.cy += (y - this.cy) * centerBlend;
    const invDt = 1 / Math.max(dt, 0.001);
    const accelX = clamp((cellVx - this.lastVx) * invDt, -2400, 2400);
    const accelY = clamp((cellVy - this.lastVy) * invDt, -2400, 2400);
    this.lastVx = cellVx;
    this.lastVy = cellVy;
    const count = this.count;
    const substeps = 3;
    const h = dt / substeps;
    const restLength = (Math.PI * 2 * radius) / count;
    const targetArea = Math.PI * radius * radius;
    const speed = Math.hypot(cellVx, cellVy);
    const flowAngle = speed > 1 ? Math.atan2(cellVy, cellVx) : 0;
    const speedFactor = clamp(speed / 320, 0, 1.25);
    for (let step = 0; step < substeps; step += 1) {
      let area = 0;
      for (let i = 0; i < count; i += 1) {
        const j = (i + 1) % count;
        area += this.px[i] * this.py[j] - this.px[j] * this.py[i];
      }
      area *= 0.5;
      const pressure = clamp((targetArea - area) / Math.max(targetArea, 1), -1.4, 1.4);
      const ax = new Float32Array(count);
      const ay = new Float32Array(count);
      for (let i = 0; i < count; i += 1) {
        const j = (i + 1) % count;
        let dx = this.px[j] - this.px[i];
        let dy = this.py[j] - this.py[i];
        const distance = Math.hypot(dx, dy) || 0.001;
        const stretch = (distance - restLength) * 118;
        dx /= distance;
        dy /= distance;
        ax[i] += dx * stretch;
        ay[i] += dy * stretch;
        ax[j] -= dx * stretch;
        ay[j] -= dy * stretch;
        const radial = Math.hypot(this.px[i], this.py[i]) || 0.001;
        const normalX = this.px[i] / radial;
        const normalY = this.py[i] / radial;
        const along = Math.cos(this.angle[i] - flowAngle);
        const wobble = 1
          + Math.cos(2 * (this.angle[i] - this.tumble)) * 0.052
          + Math.sin(this.angle[i] * 3 + this.time * 0.42 + this.phase[i]) * 0.042
          + Math.sin(this.angle[i] * 5 - this.time * 0.31 + this.phase[i] * 2.1) * 0.02;
        const directional = wobble + speedFactor * (along * along - 0.5) * 0.07;
        const restRadius = radius * directional;
        ax[i] += normalX * ((restRadius - radial) * 68 + pressure * 1010) * clamp(radial / radius, 0.35, 1.8);
        ay[i] += normalY * ((restRadius - radial) * 68 + pressure * 1010) * clamp(radial / radius, 0.35, 1.8);
        ax[i] -= accelX * 0.004;
        ay[i] -= accelY * 0.004;
        if (flowAt) {
          const flow = flowAt(this.cx + this.px[i], this.cy + this.py[i]);
          if (flow) {
            ax[i] += clamp((flow[0] - cellVx * 0.55) * 0.12, -90, 90);
            ay[i] += clamp((flow[1] - cellVy * 0.55) * 0.12, -90, 90);
          }
        }
        if (neighbors) {
          for (let k = 0; k < neighbors.length; k += 1) {
            const other = neighbors[k];
            const wx = this.cx + this.px[i];
            const wy = this.cy + this.py[i];
            const nx = wx - other.x;
            const ny = wy - other.y;
            const nd = Math.hypot(nx, ny) || 0.001;
            const reach = other.radius * 1.05;
            if (nd < reach) {
              const push = (reach - nd) / reach;
              ax[i] += (nx / nd) * push * 210;
              ay[i] += (ny / nd) * push * 210;
            }
          }
        }
        if (this.cleavage > 0) {
          const side = this.px[i] * this.cleavageDirX + this.py[i] * this.cleavageDirY;
          if (side > 0) {
            ax[i] -= this.cleavageDirX * side * 700 * this.cleavage;
            ay[i] -= this.cleavageDirY * side * 700 * this.cleavage;
          }
        }
        ax[i] += Math.cos(this.angle[i]) * this.kick * 180;
        ay[i] += Math.sin(this.angle[i]) * this.kick * 180;
        ax[i] += Math.sin(this.time * 0.7 + this.angle[i] * 2 + this.phase[i]) * 1.2;
        ay[i] += Math.cos(this.time * 0.63 + this.angle[i] * 2 - this.phase[i]) * 1.2;
      }
      for (let i = 0; i < count; i += 1) {
        this.vx[i] += ax[i] * h;
        this.vy[i] += ay[i] * h;
        const damping = Math.exp(-h * 4.4);
        this.vx[i] *= damping;
        this.vy[i] *= damping;
        const speed = Math.hypot(this.vx[i], this.vy[i]);
        if (speed > 900) {
          this.vx[i] = this.vx[i] / speed * 900;
          this.vy[i] = this.vy[i] / speed * 900;
        }
        this.px[i] += this.vx[i] * h;
        this.py[i] += this.vy[i] * h;
        const radial = Math.hypot(this.px[i], this.py[i]) || 0.001;
        const min = radius * 0.68;
        const max = radius * 1.32;
        if (radial < min || radial > max) {
          const target = radial < min ? min : max;
          this.px[i] = this.px[i] / radial * target;
          this.py[i] = this.py[i] / radial * target;
          this.vx[i] *= 0.35;
          this.vy[i] *= 0.35;
        }
      }
    }
    if (this.hold > 0) {
      const blend = 1 - Math.exp(-dt * 14);
      for (let i = 0; i < count; i += 1) {
        this.px[i] = this.px[i] + (this.holdPx[i] - this.px[i]) * blend;
        this.py[i] = this.py[i] + (this.holdPy[i] - this.py[i]) * blend;
      }
      this.hold -= dt;
    }
    this.kick *= Math.exp(-dt * 5.5);
    this.cleavage *= Math.exp(-dt * 5.5);
  }

  forkTo(child, parentX, parentY, parentRadius, childX, childY, childRadius, dirX, dirY) {
    const splitX = (parentX + childX) * 0.5;
    const splitY = (parentY + childY) * 0.5;
    const parentDistance = Math.abs((splitX - parentX) * dirX + (splitY - parentY) * dirY);
    const childDistance = Math.abs((splitX - childX) * dirX + (splitY - childY) * dirY);
    const parentAngle = Math.atan2(dirY, dirX);
    const childAngle = parentAngle + Math.PI;
    for (let i = 0; i < this.count; i += 1) {
      const angle = this.angle[i];
      const cosineParent = Math.cos(angle - parentAngle);
      let parentR = parentRadius * (1 + Math.sin(angle * 3 + this.random() * 0.5) * 0.018);
      if (cosineParent > 0.025) parentR = Math.min(parentR, parentDistance / Math.max(cosineParent, 0.025));
      this.px[i] = Math.cos(angle) * parentR;
      this.py[i] = Math.sin(angle) * parentR;
      const cosineChild = Math.cos(angle - childAngle);
      let childR = childRadius * (1 + Math.sin(angle * 4 + this.random() * 0.5) * 0.016);
      if (cosineChild > 0.025) childR = Math.min(childR, childDistance / Math.max(cosineChild, 0.025));
      child.px[i] = Math.cos(angle) * childR;
      child.py[i] = Math.sin(angle) * childR;
      child.vx[i] = this.vx[i] * 0.55;
      child.vy[i] = this.vy[i] * 0.55;
    }
    this.cx = parentX;
    this.cy = parentY;
    child.cx = childX;
    child.cy = childY;
    child.kick = 0.15;
    this.kick = 0.15;
    this.cleavage = 0.45;
    this.cleavageDirX = dirX;
    this.cleavageDirY = dirY;
    child.cleavage = 0.45;
    child.cleavageDirX = -dirX;
    child.cleavageDirY = -dirY;
    for (let i = 0; i < this.count; i += 1) {
      this.holdPx[i] = this.px[i];
      this.holdPy[i] = this.py[i];
      child.holdPx[i] = child.px[i];
      child.holdPy[i] = child.py[i];
    }
    this.hold = 0.42;
    child.hold = 0.42;
  }



  vertices(data) {
    let offset = 0;
    data[offset] = this.cx;
    data[offset + 1] = this.cy;
    data[offset + 2] = 0;
    data[offset + 3] = 0;
    data[offset + 4] = 0;
    offset += 5;
    for (let i = 0; i < this.count; i += 1) {
      data[offset] = this.cx + this.px[i];
      data[offset + 1] = this.cy + this.py[i];
      data[offset + 2] = Math.cos(this.angle[i]);
      data[offset + 3] = Math.sin(this.angle[i]);
      data[offset + 4] = 1;
      offset += 5;
    }
    data[offset] = this.cx + this.px[0];
    data[offset + 1] = this.cy + this.py[0];
    data[offset + 2] = Math.cos(this.angle[0]);
    data[offset + 3] = Math.sin(this.angle[0]);
    data[offset + 4] = 1;
    return data;
  }
}
