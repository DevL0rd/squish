import { blend, bindTexture, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { backdrop } from '../gl/screen.ts';
import { MAX_OBSTACLE_POINTS } from '../shaders/obstacle.ts';
import { inView } from '../state.ts';
import { obstacles } from '../world/obstacles.ts';
import { setScreen, setView } from './view.ts';

const shape = new Float32Array(MAX_OBSTACLE_POINTS * 2);

export function drawObstacles(): void {
  const visible = [...obstacles.values()].filter((item) => item.placed && inView(item, 0.6, item.reach * 1.2));
  if (!visible.length) return;
  bindTexture(0, backdrop());
  const program = setScreen(setView(programs.obstacle)).int('uBackground', 0);
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const item of visible) {
    const points = item.shape.points.slice(0, MAX_OBSTACLE_POINTS);
    shape.fill(0);
    points.forEach((point, i) => {
      shape.set([point.x, point.y], i * 2);
    });
    program
      .vec2s('uShape', shape)
      .int('uCount', points.length)
      .vec2('uCenter', item.x, item.y)
      .float('uAngle', item.angle)
      .float('uExtent', item.reach * 1.25)
      .float('uReach', item.reach)
      .float('uKind', item.shape.kind)
      .float('uSeed', item.shape.seed);
    drawQuad();
  }
  gl.disable(gl.BLEND);
}
