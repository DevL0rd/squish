import { lerp } from '../../shared/math.ts';
import type { HazardPacket, WireBoss, WireJoint, WireSpot } from '../../shared/protocol.ts';

const INTERVAL = 100;

interface Received {
  readonly at: number;
  readonly packet: HazardPacket;
}

let previous: Received | null = null;
let current: Received | null = null;

export function receiveHazards(packet: HazardPacket): void {
  previous = current;
  current = { at: performance.now(), packet };
}

function blendJoint(a: WireJoint | undefined, b: WireJoint, t: number): WireJoint {
  if (!a) return b;
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), r: lerp(a.r, b.r, t) };
}

function blendBoss(a: WireBoss | null, b: WireBoss, t: number): WireBoss {
  if (a?.kind !== b.kind) return b;
  const chains = b.chains.map((chain, c) => chain.map((joint, j) => blendJoint(a.chains[c]?.[j], joint, t)));
  return { ...b, chains };
}

function blendSpot(a: WireSpot | null, b: WireSpot, t: number): WireSpot {
  if (!a) return b;
  return { ...b, x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), radius: lerp(a.radius, b.radius, t) };
}

export function hazardView(): HazardPacket {
  if (!current) return { spot: null, boss: null };
  const t = Math.min(1, (performance.now() - current.at) / INTERVAL);
  const last = previous?.packet;
  const { spot, boss } = current.packet;
  return {
    spot: spot ? blendSpot(last?.spot ?? null, spot, t) : null,
    boss: boss ? blendBoss(last?.boss ?? null, boss, t) : null,
  };
}
