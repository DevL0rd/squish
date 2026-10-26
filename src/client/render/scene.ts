import { FLUID_SPAN, fluidWindow } from './fluid-window.ts';
import { bindTexture, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { screen, screenTargets } from '../gl/screen.ts';
import { bindTarget, dye, velocity } from '../gl/targets.ts';
import { drawHalos, drawShadows } from './sprites.ts';
import { setView } from './view.ts';

export function drawBase(time: number): void {
  bindTarget(screenTargets().base, screen.width, screen.height);
  gl.disable(gl.BLEND);
  gl.clearColor(0.002, 0.006, 0.006, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  bindTexture(0, dye.read.texture);
  bindTexture(1, velocity.read.texture);
  setView(programs.background)
    .float('uTime', time)
    .vec2('uOrigin', fluidWindow.x, fluidWindow.y)
    .float('uSpan', FLUID_SPAN)
    .int('uDye', 0)
    .int('uVelocity', 1);
  drawQuad();
  drawShadows();
  drawHalos();
}
