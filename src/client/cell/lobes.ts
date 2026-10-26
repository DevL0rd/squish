const MAX_LOBES = 4;

interface Lobe {
  readonly angle: number;
  readonly width: number;
  readonly strength: number;
  readonly life: number;
  age: number;
}

export class Lobes {
  private readonly random: () => number;
  private readonly lobes: Lobe[] = [];

  constructor(random: () => number) {
    this.random = random;
  }

  update(dt: number, vx: number, vy: number): void {
    for (const lobe of this.lobes) lobe.age += dt;
    const alive = this.lobes.filter((lobe) => lobe.age < lobe.life);
    this.lobes.splice(0, this.lobes.length, ...alive);
    const speed = Math.hypot(vx, vy);
    const moving = speed > 25;
    const rate = moving ? 1.8 : 0.7;
    if (this.lobes.length >= MAX_LOBES || this.random() > rate * dt) return;
    const heading = Math.atan2(vy, vx);
    const angle = moving ? heading + (this.random() - 0.5) * 1.3 : this.random() * Math.PI * 2;
    this.lobes.push({
      angle,
      width: 0.28 + this.random() * 0.3,
      strength: (moving ? 1.1 : 0.55) * (0.6 + this.random() * 0.8),
      life: 0.9 + this.random() * 1.6,
      age: 0,
    });
  }

  extension(angle: number): number {
    let total = 0;
    for (const lobe of this.lobes) {
      const diff = Math.atan2(Math.sin(angle - lobe.angle), Math.cos(angle - lobe.angle)) / lobe.width;
      total += lobe.strength * Math.sin((Math.PI * lobe.age) / lobe.life) * Math.exp(-diff * diff);
    }
    return total;
  }
}
