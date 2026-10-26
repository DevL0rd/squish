import { clamp } from '../../shared/math.ts';
import type { CellVisual } from './cell.ts';
import type { Plane } from './membrane.ts';

const SEAM = 0.7;
const REACH = 1.3;

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

function addPlanes(planes: Map<CellVisual, Plane[]>, a: CellVisual, b: CellVisual): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-3 || distance > (a.radius + b.radius) * REACH) return;
  const nx = dx / distance;
  const ny = dy / distance;
  const split = clamp(
    (distance * distance + a.radius * a.radius - b.radius * b.radius) / (2 * distance),
    distance * 0.12,
    distance * 0.88,
  );
  planes.get(a)?.push({ nx, ny, offset: a.x * nx + a.y * ny + split - SEAM });
  planes.get(b)?.push({ nx: -nx, ny: -ny, offset: -(b.x * nx + b.y * ny) + (distance - split) - SEAM });
}

export function contactPlanes(cells: readonly CellVisual[], ignored: ReadonlySet<string>): Map<CellVisual, Plane[]> {
  const planes = new Map(cells.map((cell) => [cell, [] as Plane[]]));
  const sorted = [...cells].sort((a, b) => a.x - a.radius * REACH - (b.x - b.radius * REACH));
  sorted.forEach((a, i) => {
    const reach = a.x + a.radius * REACH;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j];
      if (!b || b.x - b.radius * REACH > reach) break;
      if (!ignored.has(pairKey(a.id, b.id))) addPlanes(planes, a, b);
    }
  });
  return planes;
}
