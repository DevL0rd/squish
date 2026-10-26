import { clamp } from '../shared/math.ts';
import { EventKind } from '../shared/protocol.ts';
import { absorbInto } from './actions.ts';
import { MERGE_DELAY } from './config.ts';
import { markPlayerDead, playerColor } from './players.ts';
import type { Member } from './types.ts';
import { allMembers, world } from './world.ts';

interface Contact {
  readonly a: Member;
  readonly b: Member;
  readonly nx: number;
  readonly ny: number;
  readonly distance: number;
  readonly overlap: number;
}

type Pair = readonly [Member, Member];

function separate(contact: Contact, pushScale: number, impulseScale: number): number {
  const { a, b, nx, ny } = contact;
  const total = a.cell.mass + b.cell.mass;
  const shareA = b.cell.mass / total;
  const shareB = a.cell.mass / total;
  const push = contact.overlap * pushScale;
  a.cell.x -= nx * push * shareA;
  a.cell.y -= ny * push * shareA;
  b.cell.x += nx * push * shareB;
  b.cell.y += ny * push * shareB;
  const relative = (b.cell.vx - a.cell.vx) * nx + (b.cell.vy - a.cell.vy) * ny;
  if (relative < 0) {
    const impulse = -relative * impulseScale;
    a.cell.vx -= nx * impulse * shareA;
    a.cell.vy -= ny * impulse * shareA;
    b.cell.vx += nx * impulse * shareB;
    b.cell.vy += ny * impulse * shareB;
  }
  return relative;
}

function contactOf(a: Member, b: Member): Contact | null {
  const dx = b.cell.x - a.cell.x;
  const dy = b.cell.y - a.cell.y;
  const distance = Math.hypot(dx, dy) || 0.001;
  const overlap = a.cell.radius + b.cell.radius - distance;
  if (overlap <= 0) return null;
  return { a, b, nx: dx / distance, ny: dy / distance, distance, overlap };
}

function holdSiblingsApart(contact: Contact): void {
  const mergeAt = Math.max(contact.a.cell.mergeAt, contact.b.cell.mergeAt);
  if (world.now >= mergeAt) return;
  const resistance = clamp((mergeAt - world.now) / MERGE_DELAY, 0.12, 1);
  separate(contact, 0.36 + 0.18 * resistance, 0.25);
}

function protectedContact({ a, b }: Contact): boolean {
  if (world.now <= a.player.graceUntil || world.now <= b.player.graceUntil) return true;
  const survivorIsBot = a.cell.mass >= b.cell.mass ? a.player.bot : b.player.bot;
  return survivorIsBot && Math.max(a.cell.mass, b.cell.mass) > 250;
}

function fusionCandidate(contact: Contact, smash: number): Pair | null {
  const { a, b, overlap, distance } = contact;
  const sizeRatio = a.cell.mass / b.cell.mass;
  if (sizeRatio >= 0.45 && sizeRatio <= 2.2) {
    const depth = overlap / Math.max(1, Math.min(a.cell.radius, b.cell.radius));
    return depth > 0.28 || (depth > 0.14 && smash > 42) ? [a, b] : null;
  }
  const big = a.cell.mass >= b.cell.mass ? a : b;
  const small = big === a ? b : a;
  if (big.cell.mass < small.cell.mass * 1.55) return null;
  const swallow = (big.cell.radius - distance) / Math.max(1, small.cell.radius);
  return swallow > 0.22 ? [big, small] : null;
}

function collide(a: Member, b: Member): Pair | null {
  const contact = contactOf(a, b);
  if (!contact) return null;
  if (a.player.id === b.player.id) {
    holdSiblingsApart(contact);
    return null;
  }
  const relative = separate(contact, 0.34, 0.22);
  if (protectedContact(contact)) return null;
  return fusionCandidate(contact, -relative);
}

function owns(member: Member): boolean {
  return member.player.cells.includes(member.cell);
}

function fuse(a: Member, b: Member): void {
  const survivor = a.cell.mass >= b.cell.mass ? a : b;
  const absorbed = survivor === a ? b : a;
  absorbInto(survivor.cell, absorbed.cell);
  survivor.cell.mergeAt = Math.max(survivor.cell.mergeAt, world.now + 900);
  absorbed.player.cells.splice(absorbed.player.cells.indexOf(absorbed.cell), 1);
  world.events.push({
    kind: EventKind.Merge,
    cellId: absorbed.cell.id,
    predatorId: survivor.cell.id,
    x: survivor.cell.x,
    y: survivor.cell.y,
    color: playerColor(absorbed.player, 0.82, 0.58),
  });
  if (absorbed.player.id === survivor.player.id) return;
  absorbed.player.lastKiller = survivor.player.name;
  if (!absorbed.player.cells.length) markPlayerDead(absorbed.player, survivor.player.name);
}

function applyFusions(pairs: readonly Pair[]): void {
  const removed = new Set<number>();
  for (const [a, b] of pairs) {
    if (removed.has(a.cell.id) || removed.has(b.cell.id)) continue;
    if (!owns(a) || !owns(b)) continue;
    removed.add(a.cell.mass >= b.cell.mass ? b.cell.id : a.cell.id);
    fuse(a, b);
  }
}

export function resolveCells(): void {
  const members = allMembers();
  const pairs: Pair[] = [];
  members.forEach((a, i) => {
    for (let j = i + 1; j < members.length; j += 1) {
      const b = members[j];
      const pair = b ? collide(a, b) : null;
      if (pair) pairs.push(pair);
    }
  });
  applyFusions(pairs);
}
