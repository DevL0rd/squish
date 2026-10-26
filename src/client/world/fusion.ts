import { type CellVisual, interiorScale, RING_POINTS } from '../cell/cell.ts';
import { ringCentroid, unionRing, type Point } from '../cell/geometry.ts';

function normalized(point: Point, center: Point, scale: number): Point {
  return { x: (point.x - center.x) / scale, y: (point.y - center.y) / scale };
}

function stir(survivor: CellVisual, absorbed: CellVisual, scale: number): void {
  const total = survivor.radius + absorbed.radius;
  const contact = {
    x: survivor.x + (absorbed.x - survivor.x) * (survivor.radius / total),
    y: survivor.y + (absorbed.y - survivor.y) * (survivor.radius / total),
  };
  const local = normalized(contact, survivor.center, scale);
  const length = Math.hypot(absorbed.x - survivor.x, absorbed.y - survivor.y) || 1;
  const across = { x: -(absorbed.y - survivor.y) / length, y: (absorbed.x - survivor.x) / length };
  const spacing = (absorbed.radius / scale) * 0.55;
  const swirl = 1.4 + absorbed.radius / Math.max(survivor.radius, 1);
  survivor.interior.addVortex(local.x + across.x * spacing, local.y + across.y * spacing, 0.45, swirl);
  survivor.interior.addVortex(local.x - across.x * spacing, local.y - across.y * spacing, 0.45, -swirl);
  survivor.interior.addVortex(0, 0, 0.9, swirl * 0.35);
}

export function fuseCells(survivor: CellVisual, absorbed: CellVisual): void {
  const before = survivor.center;
  const ring = unionRing(survivor.membrane, absorbed.membrane, RING_POINTS);
  survivor.membrane.replace(ring);
  survivor.center = ringCentroid(ring);
  const sourceScale = interiorScale(survivor);
  const absorbedScale = interiorScale(absorbed);
  survivor.radius = Math.hypot(survivor.radius, absorbed.radius);
  const scale = interiorScale(survivor);
  const own = survivor.interior.copyField();
  survivor.interior.remap(own, normalized(before, survivor.center, scale), scale / sourceScale, false);
  survivor.interior.remap(
    absorbed.interior.copyField(),
    normalized(absorbed.center, survivor.center, scale),
    scale / absorbedScale,
    true,
  );
  survivor.organelles.shift(before.x - survivor.center.x, before.y - survivor.center.y);
  absorbed.organelles.shift(absorbed.center.x - survivor.center.x, absorbed.center.y - survivor.center.y);
  absorbed.organelles.dissolveAll(Math.random, absorbed.fluidColor);
  survivor.organelles.items.push(...absorbed.organelles.items);
  stir(survivor, absorbed, scale);
}
