import { BOSS_SCALE, BossKind, type WireBoss, type WireJoint } from '../../shared/protocol.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { backdrop } from '../gl/screen.ts';
import { MAX_JOINTS } from '../shaders/boss.ts';
import { inView } from '../state.ts';
import { hazardView } from '../world/hazards.ts';
import { setScreen, setView } from './view.ts';

const SLIME = 5;
const joints = new Float32Array(MAX_JOINTS * 4);

function kindOf(boss: WireBoss, index: number): number {
  return boss.kind === BossKind.Oligochaete && index === 1 ? SLIME : boss.kind;
}

function bounds(chain: readonly WireJoint[]): { x: number; y: number; extent: number } {
  let [minX, minY, maxX, maxY, reach] = [Infinity, Infinity, -Infinity, -Infinity, 0];
  for (const joint of chain) {
    minX = Math.min(minX, joint.x);
    minY = Math.min(minY, joint.y);
    maxX = Math.max(maxX, joint.x);
    maxY = Math.max(maxY, joint.y);
    reach = Math.max(reach, joint.r);
  }
  const extent = Math.max(maxX - minX, maxY - minY) / 2 + reach * 1.3 + 60;
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, extent };
}

function upload(chain: readonly WireJoint[]): { count: number; total: number } {
  const count = Math.min(chain.length, MAX_JOINTS);
  let total = 0;
  for (let i = 0; i < count; i += 1) {
    const joint = chain[i];
    const before = chain[i - 1];
    if (!joint) continue;
    if (before) total += Math.hypot(joint.x - before.x, joint.y - before.y);
    joints.set([joint.x, joint.y, joint.r, total], i * 4);
  }
  for (let i = 0; i < count; i += 1) joints[i * 4 + 3] = (joints[i * 4 + 3] ?? 0) / Math.max(total, 1);
  return { count, total };
}

function drawChain(chain: readonly WireJoint[], kind: number): void {
  if (chain.length < 2) return;
  const box = bounds(chain);
  if (!inView(box, 0.75, box.extent)) return;
  const { count, total } = upload(chain);
  setView(programs.boss)
    .vec2('uCenter', box.x, box.y)
    .float('uExtent', box.extent)
    .vec4s('uJoints', joints)
    .int('uCount', count)
    .float('uTotal', total)
    .float('uKind', kind);
  drawQuad();
}

export function drawBoss(time: number): void {
  const { boss } = hazardView();
  if (!boss) return;
  bindTexture(0, backdrop());
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  setScreen(setView(programs.boss))
    .int('uBackground', 0)
    .float('uScale', BOSS_SCALE)
    .float('uTime', time)
    .float('uState', boss.state)
    .float('uProgress', boss.progress);
  boss.chains.forEach((chain, index) => {
    drawChain(chain, kindOf(boss, index));
  });
  gl.disable(gl.BLEND);
}
