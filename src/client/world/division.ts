import { at, clamp } from '../../shared/math.ts';
import { type CellVisual, interiorScale, RING_POINTS } from '../cell/cell.ts';
import { pairKey } from '../cell/contacts.ts';
import { circleRing, ringCentroid, splitRing, type Point } from '../cell/geometry.ts';
import type { Cleave } from '../cell/membrane.ts';
import { OrganelleKind, type Organelle } from '../cell/organelles.ts';

const MAX_TIME = 0.32;
const FURROW_RATE = 8;

interface Division {
  readonly parent: CellVisual;
  readonly child: CellVisual;
  readonly dir: Point;
  readonly started: number;
}

const divisions: Division[] = [];

function find(cell: CellVisual): Division | undefined {
  return divisions.find((division) => division.parent === cell || division.child === cell);
}

export function isHidden(cell: CellVisual): boolean {
  return divisions.some((division) => division.child === cell);
}

export function divisionPairs(): Set<string> {
  return new Set(divisions.map((division) => pairKey(division.parent.id, division.child.id)));
}

function splitNuclei(items: readonly Organelle[], dir: Point): Organelle[] {
  return items.flatMap((item) => {
    if (item.kind !== OrganelleKind.Nucleus) return [item];
    const radius = item.radius * 0.72;
    const shift = item.radius * 0.3;
    const speed = item.radius * 2.5;
    return [
      { ...item, radius, x: item.x - dir.x * shift, y: item.y - dir.y * shift, vx: -dir.x * speed, vy: -dir.y * speed },
      { ...item, radius, x: item.x + dir.x * shift, y: item.y + dir.y * shift, vx: dir.x * speed, vy: dir.y * speed },
    ];
  });
}

export function startDivision(parent: CellVisual, child: CellVisual): void {
  const length = Math.hypot(child.x - parent.center.x, child.y - parent.center.y) || 1;
  const dir = { x: (child.x - parent.center.x) / length, y: (child.y - parent.center.y) / length };
  parent.organelles.items = splitNuclei(parent.organelles.items, dir);
  parent.radius = Math.hypot(parent.targetRadius, child.targetRadius);
  divisions.push({ parent, child, dir, started: performance.now() });
}

export function cleaveOf(cell: CellVisual): Cleave | null {
  const division = divisions.find((item) => item.parent === cell);
  if (!division) return null;
  const { child, dir } = division;
  const age = (performance.now() - division.started) / 1000;
  return {
    anchor: child,
    radius: child.targetRadius,
    ownRadius: cell.targetRadius,
    dirX: dir.x,
    dirY: dir.y,
    furrow: clamp(age * FURROW_RATE, 0, 1),
  };
}

export function holdsRadius(cell: CellVisual): boolean {
  return divisions.some((division) => division.parent === cell);
}

function remapFrom(
  cell: CellVisual,
  field: ReturnType<CellVisual['interior']['copyField']>,
  origin: Point,
  originScale: number,
): void {
  const scale = interiorScale(cell);
  const offset = { x: (origin.x - cell.center.x) / scale, y: (origin.y - cell.center.y) / scale };
  cell.interior.remap(field, offset, scale / originScale, false);
}

function neckPoint(parent: CellVisual, dir: Point): Point {
  const { membrane } = parent;
  let low = Infinity;
  let high = -Infinity;
  for (let i = 0; i < membrane.count; i += 1) {
    const along = (at(membrane.x, i) - parent.x) * dir.x + (at(membrane.y, i) - parent.y) * dir.y;
    low = Math.min(low, along);
    high = Math.max(high, along);
  }
  const middle = (low + high) * 0.5;
  return { x: parent.x + dir.x * middle, y: parent.y + dir.y * middle };
}

function pinchOff(division: Division): void {
  const { parent, child, dir } = division;
  const origin = parent.center;
  const cut = neckPoint(parent, dir);
  const originScale = interiorScale(parent);
  const field = parent.interior.copyField();
  const [back, front] = splitRing(parent.membrane, cut, dir, RING_POINTS) ?? [
    parent.membrane,
    circleRing(RING_POINTS, child, child.targetRadius),
  ];
  parent.membrane.replace(back);
  child.membrane.replace(front);
  parent.membrane.stretch = 1;
  parent.center = ringCentroid(back);
  child.center = ringCentroid(front);
  parent.radius = parent.targetRadius;
  child.radius = child.targetRadius;
  child.fluidColor = parent.fluidColor;
  remapFrom(parent, field, origin, originScale);
  remapFrom(child, field, origin, originScale);
  const side = (item: Organelle): number => (origin.x + item.x - cut.x) * dir.x + (origin.y + item.y - cut.y) * dir.y;
  const items = parent.organelles.items;
  child.organelles.items = items.filter((item) => side(item) > 0);
  parent.organelles.items = items.filter((item) => side(item) <= 0);
  parent.organelles.shift(origin.x - parent.center.x, origin.y - parent.center.y);
  child.organelles.shift(origin.x - child.center.x, origin.y - child.center.y);
}

export function finishDivision(cell: CellVisual): void {
  const division = find(cell);
  if (!division) return;
  pinchOff(division);
  divisions.splice(divisions.indexOf(division), 1);
}

export function updateDivisions(alive: ReadonlyMap<number, CellVisual>): void {
  for (const division of [...divisions]) {
    const { parent, child } = division;
    const span = Math.hypot(child.x - parent.x, child.y - parent.y);
    parent.membrane.stretch = clamp(1 + (span / Math.max(parent.radius, 1)) * 0.3, 1, 1.4);
    const cleave = cleaveOf(parent);
    const neck = cleave ? parent.membrane.neckWidth(parent, cleave) : 0;
    const closed = neck < parent.radius * 0.1 || performance.now() - division.started > MAX_TIME * 1000;
    if (!alive.has(parent.id) || !alive.has(child.id)) divisions.splice(divisions.indexOf(division), 1);
    else if (closed) finishDivision(parent);
  }
}
