import { clamp, WORLD } from '../../shared/math.ts';
import { vividColor } from '../color.ts';
import { bindTexture, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { screen, screenTargets } from '../gl/screen.ts';
import { bindTarget, dye, velocity } from '../gl/targets.ts';
import { inView, state } from '../state.ts';
import { cellFluidColor } from '../world/interiors.ts';
import { drawCreatures, drawDebris, drawFood, drawHalos, drawShadows } from './sprites.ts';
import { setView } from './view.ts';

const MAX_LIGHTS = 16;
const lightPositions = new Float32Array(MAX_LIGHTS * 2);
const lightColors = new Float32Array(MAX_LIGHTS * 3);
const lightRadii = new Float32Array(MAX_LIGHTS);
const lightIntensities = new Float32Array(MAX_LIGHTS);

function buildLights(): number {
  const lit = [...state.cells.values()]
    .filter((cell) => inView(cell, 0.65, cell.radius))
    .sort((a, b) => b.radius - a.radius)
    .slice(0, MAX_LIGHTS);
  lit.forEach((cell, i) => {
    lightPositions.set([cell.x, cell.y], i * 2);
    lightColors.set(vividColor(cellFluidColor(cell)), i * 3);
    lightRadii[i] = cell.radius * 3.2;
    lightIntensities[i] = clamp(cell.radius / 60, 0.4, 1.6);
  });
  return lit.length;
}

export function drawBase(time: number): void {
  bindTarget(screenTargets().base, screen.width, screen.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0.002, 0.006, 0.006, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  bindTexture(0, dye.read.texture);
  bindTexture(1, velocity.read.texture);
  const lightCount = buildLights();
  setView(programs.background)
    .float('uTime', time)
    .float('uWorld', WORLD)
    .int('uDye', 0)
    .int('uVelocity', 1)
    .int('uLightCount', lightCount)
    .vec2s('uLightPos', lightPositions)
    .vec3s('uLightColor', lightColors)
    .floats('uLightRadius', lightRadii)
    .floats('uLightIntensity', lightIntensities);
  drawQuad();
  drawCreatures(time);
  drawFood(time);
  drawDebris(false, time);
  drawShadows();
  drawHalos();
}
