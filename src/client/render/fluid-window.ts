import { WORLD } from '../../shared/math.ts';
import { drawQuad, gl, bindTexture } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { bindTarget, dye, fluidSize, pressure, velocity, type PingPong } from '../gl/targets.ts';

export const FLUID_SPAN = 4096;
const RECENTER = FLUID_SPAN * 0.18;
const TEXEL = FLUID_SPAN / fluidSize;

export const fluidWindow = { x: WORLD / 2 - FLUID_SPAN / 2, y: WORLD / 2 - FLUID_SPAN / 2 };

export function toFluid(x: number, y: number): [number, number] {
  return [(x - fluidWindow.x) / FLUID_SPAN, (y - fluidWindow.y) / FLUID_SPAN];
}

function scroll(field: PingPong, texelsX: number, texelsY: number): void {
  bindTarget(field.write, fluidSize, fluidSize);
  bindTexture(0, field.read.texture);
  programs.shift
    .use()
    .int('uSource', 0)
    .vec2('uOffset', texelsX / fluidSize, texelsY / fluidSize);
  drawQuad();
  field.swap();
}

export function followCamera(center: { readonly x: number; readonly y: number }): void {
  const dx = center.x - (fluidWindow.x + FLUID_SPAN / 2);
  const dy = center.y - (fluidWindow.y + FLUID_SPAN / 2);
  if (Math.abs(dx) < RECENTER && Math.abs(dy) < RECENTER) return;
  const texelsX = Math.round(dx / TEXEL);
  const texelsY = Math.round(dy / TEXEL);
  fluidWindow.x += texelsX * TEXEL;
  fluidWindow.y += texelsY * TEXEL;
  gl.disable(gl.BLEND);
  for (const field of [velocity, dye, pressure]) scroll(field, texelsX, texelsY);
}
