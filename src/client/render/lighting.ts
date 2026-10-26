import { vividColor } from '../color.ts';
import { gl, required } from '../gl/context.ts';
import { LIGHTS_BINDING } from '../gl/program.ts';
import { MAX_POINT_LIGHTS } from '../shaders/lighting.ts';
import { inView, state } from '../state.ts';
import { hazardView } from '../world/hazards.ts';
import { SpotPhase } from '../../shared/protocol.ts';

const FLOATS = (4 + MAX_POINT_LIGHTS * 2 + 1) * 4;
const data = new Float32Array(FLOATS);
const buffer = required(gl.createBuffer(), 'lights buffer');
const LAMP = (() => {
  const length = Math.hypot(0.35, 0.5, 0.8);
  return [0.35 / length, 0.5 / length, 0.8 / length];
})();
const SPOT_DIR = (() => {
  const length = Math.hypot(0.5, 0.866, 1.1);
  return [0.5 / length, 0.866 / length, 1.1 / length];
})();

function spotIntensity(): [number, number, number, number] {
  const { spot } = hazardView();
  if (!spot) return [0, 0, 1, 0];
  const focus = spot.phase === SpotPhase.Focus ? spot.progress : 0;
  const fade = spot.phase === SpotPhase.Fade ? 1 - spot.progress : 1;
  return [spot.x, spot.y, spot.radius, (0.5 + focus * 0.6) * fade];
}

function points(): number {
  const lit = [...state.cells.values()]
    .filter((cell) => inView(cell, 0.7, cell.radius * 3))
    .sort((a, b) => b.radius - a.radius)
    .slice(0, MAX_POINT_LIGHTS);
  lit.forEach((cell, i) => {
    const color = vividColor(cell.fluidColor);
    data.set([cell.center.x, cell.center.y, cell.radius * 3.2, Math.min(1.2, cell.radius / 70 + 0.3)], 16 + i * 4);
    data.set([color[0], color[1], color[2], 0], 16 + MAX_POINT_LIGHTS * 4 + i * 4);
  });
  return lit.length;
}

export function updateLighting(): void {
  data.set([LAMP[0] ?? 0, LAMP[1] ?? 0, LAMP[2] ?? 1, 0.62], 0);
  data.set([1, 0.97, 0.9, 0], 4);
  data.set(spotIntensity(), 8);
  data.set([SPOT_DIR[0] ?? 0, SPOT_DIR[1] ?? 0, SPOT_DIR[2] ?? 1, 0], 12);
  const count = points();
  data.set([count, 0, 0, 0], 16 + MAX_POINT_LIGHTS * 8);
  gl.bindBuffer(gl.UNIFORM_BUFFER, buffer);
  gl.bufferData(gl.UNIFORM_BUFFER, data, gl.DYNAMIC_DRAW);
  gl.bindBufferBase(gl.UNIFORM_BUFFER, LIGHTS_BINDING, buffer);
}
