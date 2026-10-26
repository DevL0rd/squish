import { BOSS_SCALE, BossKind, type WireBoss, type WireJoint } from '../../shared/protocol.ts';
import { bindTexture, blend, gl } from '../gl/context.ts';
import { backdrop } from '../gl/screen.ts';
import { InstanceBatch } from '../gl/instances.ts';
import { programs } from '../gl/programs.ts';
import { inView } from '../state.ts';
import { hazardView } from '../world/hazards.ts';
import { setScreen, setView } from './view.ts';

const SLIME = 5;
const segments = new InstanceBatch(4, 2048);

function chainLength(chain: readonly WireJoint[]): number[] {
  const lengths = [0];
  for (let i = 1; i < chain.length; i += 1) {
    const a = chain[i - 1];
    const b = chain[i];
    lengths.push((lengths[i - 1] ?? 0) + (a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0));
  }
  return lengths;
}

function kindOf(boss: WireBoss, index: number): number {
  return boss.kind === BossKind.Oligochaete && index === 1 ? SLIME : boss.kind;
}

function segment(chain: readonly WireJoint[], i: number, cumulative: readonly number[], kind: number): number[] | null {
  const a = chain[i];
  const b = chain[i + 1];
  if (!a || !b) return null;
  if (!inView({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 0.75, Math.max(a.r, b.r) * 2 + 120)) return null;
  const prev = chain[i - 1] ?? a;
  const next = chain[i + 2] ?? b;
  const total = cumulative[cumulative.length - 1] ?? 1;
  const ua = (cumulative[i] ?? 0) / total;
  const ub = (cumulative[i + 1] ?? 0) / total;
  return [a.x, a.y, a.r, ua, b.x, b.y, b.r, ub, prev.x, prev.y, prev.r, kind, next.x, next.y, next.r, total];
}

function queueChain(chain: readonly WireJoint[], kind: number): boolean {
  const cumulative = chainLength(chain);
  for (let i = 0; i < chain.length - 1; i += 1) {
    const values = segment(chain, i, cumulative, kind);
    if (values && !segments.add(values)) return false;
  }
  return true;
}

export function drawBoss(time: number): void {
  const { boss } = hazardView();
  if (!boss) return;
  segments.begin();
  boss.chains.forEach((chain, index) => queueChain(chain, kindOf(boss, index)));
  if (!segments.count) return;
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  bindTexture(0, backdrop());
  setScreen(setView(programs.boss))
    .int('uBackground', 0)
    .float('uScale', BOSS_SCALE)
    .float('uTime', time)
    .float('uState', boss.state)
    .float('uProgress', boss.progress);
  segments.draw();
  gl.disable(gl.BLEND);
}
