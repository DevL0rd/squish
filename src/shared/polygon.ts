export interface Vec {
  readonly x: number;
  readonly y: number;
}

export interface EdgeHit {
  readonly point: Vec;
  readonly normal: Vec;
  readonly inside: boolean;
}

export function nearestEdge(points: readonly Vec[], p: Vec): EdgeHit {
  let point = p;
  let normal = { x: 1, y: 0 };
  let best = Infinity;
  let inside = true;
  points.forEach((a, i) => {
    const b = points[(i + 1) % points.length] ?? a;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const length = Math.hypot(ex, ey) || 1;
    const edgeNormal = { x: ey / length, y: -ex / length };
    if ((p.x - a.x) * edgeNormal.x + (p.y - a.y) * edgeNormal.y > 0) inside = false;
    const t = Math.min(1, Math.max(0, ((p.x - a.x) * ex + (p.y - a.y) * ey) / (length * length)));
    const candidate = { x: a.x + ex * t, y: a.y + ey * t };
    const distance = Math.hypot(p.x - candidate.x, p.y - candidate.y);
    if (distance >= best) return;
    best = distance;
    point = candidate;
    normal = edgeNormal;
  });
  return { point, normal, inside };
}
