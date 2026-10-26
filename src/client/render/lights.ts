import { clamp } from '../../shared/math.ts';
import { vividColor } from '../color.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { screenTargets } from '../gl/screen.ts';
import { inView, state } from '../state.ts';
import { QUALITY, settings } from '../ui/settings.ts';
import { setScreen, setView } from './view.ts';

const MAX_LIGHTS = 16;
const lightPositions = new Float32Array(MAX_LIGHTS * 2);
const lightColors = new Float32Array(MAX_LIGHTS * 3);
const lightRadii = new Float32Array(MAX_LIGHTS);
const lightIntensities = new Float32Array(MAX_LIGHTS);
const lightBodies = new Float32Array(MAX_LIGHTS);

function buildLights(): number {
  const lit = [...state.cells.values()]
    .filter((cell) => inView(cell, 0.65, cell.radius))
    .sort((a, b) => b.radius - a.radius)
    .slice(0, MAX_LIGHTS);
  lit.forEach((cell, i) => {
    lightPositions.set([cell.x, cell.y], i * 2);
    lightColors.set(vividColor(cell.fluidColor), i * 3);
    lightRadii[i] = cell.radius * 3.2;
    lightIntensities[i] = clamp(cell.radius / 60, 0.4, 1.6);
    lightBodies[i] = cell.radius;
  });
  return lit.length;
}

export function shadowSteps(): number {
  return QUALITY[settings().quality].shadows;
}

export function drawLights(): void {
  const count = buildLights();
  if (!count) return;
  bindTexture(0, screenTargets().cells.texture);
  blend(gl.ONE, gl.ONE);
  setScreen(setView(programs.lights))
    .int('uOccluder', 0)
    .vec2('uCenter', state.camera.x, state.camera.y)
    .float('uExtent', Math.max(state.camera.width, state.camera.height))
    .int('uSteps', shadowSteps())
    .int('uLightCount', count)
    .vec2s('uLightPos', lightPositions)
    .vec3s('uLightColor', lightColors)
    .floats('uLightRadius', lightRadii)
    .floats('uLightIntensity', lightIntensities)
    .floats('uLightBody', lightBodies);
  drawQuad();
  gl.disable(gl.BLEND);
}
