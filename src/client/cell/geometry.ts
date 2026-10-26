import { at } from '../../shared/math.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Ring {
  readonly x: Float32Array;
  readonly y: Float32Array;
}

export function ringArea(ring: Ring): number {
  const count = ring.x.length;
  let area = 0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    area += at(ring.x, i) * at(ring.y, j) - at(ring.x, j) * at(ring.y, i);
  }
  return area * 0.5;
}

export function ringCentroid(ring: Ring): Point {
  const count = ring.x.length;
  let cx = 0;
  let cy = 0;
  let twiceArea = 0;
  for (let i = 0; i < count; i += 1) {
    const j = (i + 1) % count;
    const cross = at(ring.x, i) * at(ring.y, j) - at(ring.x, j) * at(ring.y, i);
    twiceArea += cross;
    cx += (at(ring.x, i) + at(ring.x, j)) * cross;
    cy += (at(ring.y, i) + at(ring.y, j)) * cross;
  }
  if (Math.abs(twiceArea) < 1e-6) return { x: at(ring.x, 0), y: at(ring.y, 0) };
  return { x: cx / (3 * twiceArea), y: cy / (3 * twiceArea) };
}

export function insideRing(ring: Ring, x: number, y: number): boolean {
  const count = ring.x.length;
  let inside = false;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = at(ring.x, i);
    const yi = at(ring.y, i);
    const xj = at(ring.x, j);
    const yj = at(ring.y, j);
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function edgeLengths(points: readonly Point[]): number[] {
  return points.map((point, i) => {
    const next = points[(i + 1) % points.length] ?? point;
    return Math.hypot(next.x - point.x, next.y - point.y);
  });
}

function resample(points: readonly Point[], count: number): Ring {
  const ring = { x: new Float32Array(count), y: new Float32Array(count) };
  const lengths = edgeLengths(points);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let segment = 0;
  let walked = 0;
  for (let k = 0; k < count; k += 1) {
    const goal = (k / count) * total;
    while (segment < points.length - 1 && walked + at(lengths, segment) < goal) {
      walked += at(lengths, segment);
      segment += 1;
    }
    const from = points[segment] ?? { x: 0, y: 0 };
    const to = points[(segment + 1) % points.length] ?? from;
    const length = at(lengths, segment);
    const t = length > 0 ? (goal - walked) / length : 0;
    ring.x[k] = from.x + (to.x - from.x) * t;
    ring.y[k] = from.y + (to.y - from.y) * t;
  }
  return ring;
}

function ringPoints(ring: Ring): Point[] {
  return Array.from(ring.x, (x, i) => ({ x, y: at(ring.y, i) }));
}

export function circleRing(count: number, center: Point, radius: number): Ring {
  const ring = { x: new Float32Array(count), y: new Float32Array(count) };
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    ring.x[i] = center.x + Math.cos(angle) * radius;
    ring.y[i] = center.y + Math.sin(angle) * radius;
  }
  return ring;
}

export function unionRing(a: Ring, b: Ring, count: number): Ring {
  const outsideB = ringPoints(a).filter((point) => !insideRing(b, point.x, point.y));
  const outsideA = ringPoints(b).filter((point) => !insideRing(a, point.x, point.y));
  const points = [...outsideB, ...outsideA];
  const areaA = Math.abs(ringArea(a));
  const areaB = Math.abs(ringArea(b));
  const ca = ringCentroid(a);
  const cb = ringCentroid(b);
  const total = areaA + areaB || 1;
  const cx = (ca.x * areaA + cb.x * areaB) / total;
  const cy = (ca.y * areaA + cb.y * areaB) / total;
  points.sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
  return resample(points, count);
}

function halves(points: readonly Point[], origin: Point, dir: Point): [Point[], Point[]] {
  const side = (point: Point): number => (point.x - origin.x) * dir.x + (point.y - origin.y) * dir.y;
  const back: Point[] = [];
  const front: Point[] = [];
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length] ?? point;
    const s0 = side(point);
    const s1 = side(next);
    (s0 <= 0 ? back : front).push(point);
    if (s0 <= 0 === s1 <= 0) return;
    const t = s0 / (s0 - s1);
    const cut = { x: point.x + (next.x - point.x) * t, y: point.y + (next.y - point.y) * t };
    back.push(cut);
    front.push(cut);
  });
  return [back, front];
}

function pointsArea(points: readonly Point[]): number {
  let area = 0;
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length] ?? point;
    area += point.x * next.y - next.x * point.y;
  });
  return Math.abs(area) * 0.5;
}

export function splitRing(ring: Ring, origin: Point, dir: Point, count: number): [Ring, Ring] | null {
  const [back, front] = halves(ringPoints(ring), origin, dir);
  if (back.length < 3 || front.length < 3) return null;
  return [resample(back, count), resample(front, count)];
}

export function areaCut(ring: Ring, dir: Point, share: number): Point {
  const points = ringPoints(ring);
  const center = ringCentroid(ring);
  const total = Math.max(pointsArea(points), 1e-6);
  let low = Infinity;
  let high = -Infinity;
  for (const point of points) {
    const along = (point.x - center.x) * dir.x + (point.y - center.y) * dir.y;
    low = Math.min(low, along);
    high = Math.max(high, along);
  }
  for (let i = 0; i < 20; i += 1) {
    const middle = (low + high) / 2;
    const origin = { x: center.x + dir.x * middle, y: center.y + dir.y * middle };
    if (pointsArea(halves(points, origin, dir)[1]) / total > share) low = middle;
    else high = middle;
  }
  const middle = (low + high) / 2;
  return { x: center.x + dir.x * middle, y: center.y + dir.y * middle };
}
