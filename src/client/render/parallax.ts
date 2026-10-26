import { bindTexture, drawQuad, gl } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { screen, screenTargets } from '../gl/screen.ts';
import { bindTarget } from '../gl/targets.ts';
import { layerCamera, layers, type Layer } from '../world/parallax.ts';
import { drawCreatures, drawFood } from './sprites.ts';
import { withCamera } from './view.ts';

function blurLayer(layer: Layer): void {
  const { bright, blur } = screenTargets();
  bindTarget(blur, blur.width, blur.height);
  gl.disable(gl.BLEND);
  bindTexture(0, bright.texture);
  programs.blur
    .use()
    .int('uSource', 0)
    .vec2('uDirection', layer.blur / blur.width, 0);
  drawQuad();
  bindTarget(bright, bright.width, bright.height);
  bindTexture(0, blur.texture);
  programs.blur.vec2('uDirection', 0, layer.blur / blur.height);
  drawQuad();
}

function drawLayer(layer: Layer, time: number): void {
  const { bright, base } = screenTargets();
  bindTarget(bright, bright.width, bright.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  withCamera(layerCamera(layer), () => {
    drawFood(time, layer.food, false);
    drawCreatures(time, layer.creatures, false);
  });
  blurLayer(layer);
  bindTarget(base, screen.width, screen.height);
  gl.enable(gl.BLEND);
  gl.blendColor(0, 0, 0, layer.alpha);
  gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  bindTexture(0, bright.texture);
  programs.blit.use().int('uSource', 0).float('uAlpha', layer.alpha);
  drawQuad();
  gl.disable(gl.BLEND);
}

export function drawParallax(time: number): void {
  for (const layer of layers) drawLayer(layer, time);
}
