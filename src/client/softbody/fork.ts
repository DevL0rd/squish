import { at } from '../../shared/math.ts';
import type { Circle, SoftBody } from './softbody.ts';

const HOLD_TIME = 0.42;

function lobeRadius(radius: number, cosine: number, distance: number): number {
  return cosine > 0.025 ? Math.min(radius, distance / Math.max(cosine, 0.025)) : radius;
}

function settle(body: SoftBody, center: Circle, dirX: number, dirY: number): void {
  body.cx = center.x;
  body.cy = center.y;
  body.kick = 0.15;
  body.cleavage = 0.45;
  body.cleavageDirX = dirX;
  body.cleavageDirY = dirY;
  body.holdPx.set(body.px);
  body.holdPy.set(body.py);
  body.hold = HOLD_TIME;
}

export function forkShapes(
  parentBody: SoftBody,
  childBody: SoftBody,
  parent: Circle,
  child: Circle,
  dir: { readonly x: number; readonly y: number },
): void {
  const splitX = (parent.x + child.x) * 0.5;
  const splitY = (parent.y + child.y) * 0.5;
  const parentDistance = Math.abs((splitX - parent.x) * dir.x + (splitY - parent.y) * dir.y);
  const childDistance = Math.abs((splitX - child.x) * dir.x + (splitY - child.y) * dir.y);
  const parentAngle = Math.atan2(dir.y, dir.x);
  const childAngle = parentAngle + Math.PI;
  for (let i = 0; i < parentBody.count; i += 1) {
    const angle = at(parentBody.angle, i);
    const baseParent = parent.radius * (1 + Math.sin(angle * 3 + parentBody.random() * 0.5) * 0.018);
    const parentR = lobeRadius(baseParent, Math.cos(angle - parentAngle), parentDistance);
    parentBody.px[i] = Math.cos(angle) * parentR;
    parentBody.py[i] = Math.sin(angle) * parentR;
    const baseChild = child.radius * (1 + Math.sin(angle * 4 + parentBody.random() * 0.5) * 0.016);
    const childR = lobeRadius(baseChild, Math.cos(angle - childAngle), childDistance);
    childBody.px[i] = Math.cos(angle) * childR;
    childBody.py[i] = Math.sin(angle) * childR;
    childBody.vx[i] = at(parentBody.vx, i) * 0.55;
    childBody.vy[i] = at(parentBody.vy, i) * 0.55;
  }
  settle(parentBody, parent, dir.x, dir.y);
  settle(childBody, child, -dir.x, -dir.y);
}
