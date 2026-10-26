import { vividColor } from '../color.ts';
import { blend, gl } from '../gl/context.ts';
import { InstanceBatch } from '../gl/instances.ts';
import { programs } from '../gl/programs.ts';
import { activeStreaks } from '../world/attacks.ts';
import { setView } from './view.ts';

const batch = new InstanceBatch(3, 512);

export function drawStreaks(): void {
  const streaks = activeStreaks();
  if (!streaks.length) return;
  batch.begin();
  for (const streak of streaks) {
    const color = vividColor(streak.color);
    const values = [
      streak.a.x,
      streak.a.y,
      streak.b.x,
      streak.b.y,
      streak.width,
      streak.glow,
      streak.pointed ? 1 : 0,
      streak.seed,
      color[0],
      color[1],
      color[2],
      Math.max(0, streak.alpha),
    ];
    if (!batch.add(values)) break;
  }
  blend(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  setView(programs.streak);
  batch.draw();
  gl.disable(gl.BLEND);
}
