import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { screen, screenTargets } from '../gl/screen.ts';
import { bindTarget } from '../gl/targets.ts';
import { state } from '../state.ts';
import { drawCellBodies, drawFusionBridges, drawMergeGhosts } from './cells.ts';
import { stepFluid } from './fluid.ts';
import { drawBase } from './scene.ts';
import { drawBubbles, drawDebris } from './sprites.ts';

const SIM_STEP = 1 / 30;
let simAccumulator = 0;

function drawCellLayer(time: number): void {
  bindTarget(screenTargets().cells, screen.width, screen.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  drawBubbles(false);
  drawFusionBridges(time);
  drawCellBodies(time);
  drawMergeGhosts(time);
  drawBubbles(true);
  drawDebris(true, time);
}

function compositeCells(): void {
  const targets = screenTargets();
  bindTarget(targets.base, screen.width, screen.height);
  blend(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  bindTexture(0, targets.cells.texture);
  programs.blit.use().int('uSource', 0).float('uAlpha', 1);
  drawQuad();
  gl.disable(gl.BLEND);
}

function drawBloom(): void {
  const { base, bright, blur } = screenTargets();
  bindTarget(bright, bright.width, bright.height);
  gl.disable(gl.BLEND);
  bindTexture(0, base.texture);
  programs.bright
    .use()
    .int('uScene', 0)
    .vec2('uTexel', 1 / screen.width, 1 / screen.height);
  drawQuad();
  bindTarget(blur, blur.width, blur.height);
  bindTexture(0, bright.texture);
  programs.blur
    .use()
    .int('uSource', 0)
    .vec2('uDirection', 1 / blur.width, 0);
  drawQuad();
  gl.bindFramebuffer(gl.FRAMEBUFFER, bright.framebuffer);
  bindTexture(0, blur.texture);
  programs.blur.vec2('uDirection', 0, 1 / blur.height);
  drawQuad();
}

function drawFinal(): void {
  const { base, bright } = screenTargets();
  bindTarget(null, screen.width, screen.height);
  gl.disable(gl.BLEND);
  bindTexture(0, base.texture);
  bindTexture(1, bright.texture);
  programs.composite
    .use()
    .int('uScene', 0)
    .int('uBloom', 1)
    .vec2('uResolution', screen.width, screen.height)
    .float('uTime', state.time);
  drawQuad();
}

export function renderFrame(dt: number): void {
  simAccumulator += dt;
  if (simAccumulator >= SIM_STEP) {
    stepFluid(SIM_STEP);
    simAccumulator = 0;
  }
  drawBase(state.time);
  drawCellLayer(state.time);
  compositeCells();
  drawBloom();
  drawFinal();
}
