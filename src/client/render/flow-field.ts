import { at, sampleGrid, WORLD } from '../../shared/math.ts';
import { drawQuad, gl, bindTexture } from '../gl/context.ts';
import { programs } from '../gl/programs.ts';
import { bindTarget, FIELD_SIZE, fieldTarget, fluidSize, velocity } from '../gl/targets.ts';

const READ_INTERVAL = 0.09;
const pixels = new Uint8Array(FIELD_SIZE * FIELD_SIZE * 4);
const flowX = new Float32Array(FIELD_SIZE * FIELD_SIZE);
const flowY = new Float32Array(FIELD_SIZE * FIELD_SIZE);
let valid = false;
let accumulator = 0;

export function readFlowField(dt: number): void {
  accumulator += dt;
  if (accumulator < READ_INTERVAL) return;
  accumulator = 0;
  bindTarget(fieldTarget, FIELD_SIZE, FIELD_SIZE);
  gl.disable(gl.BLEND);
  bindTexture(0, velocity.read.texture);
  programs.field.use().int('uVelocity', 0);
  drawQuad();
  gl.readPixels(0, 0, FIELD_SIZE, FIELD_SIZE, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const scale = WORLD / fluidSize / 0.004;
  for (let i = 0; i < FIELD_SIZE * FIELD_SIZE; i += 1) {
    flowX[i] = (at(pixels, i * 4) / 255 - 0.5) * scale;
    flowY[i] = (at(pixels, i * 4 + 1) / 255 - 0.5) * scale;
  }
  valid = true;
}

export function sampleClientFlow(x: number, y: number): [number, number] | null {
  if (!valid) return null;
  const gx = (x / WORLD) * (FIELD_SIZE - 1);
  const gy = (y / WORLD) * (FIELD_SIZE - 1);
  return [sampleGrid(flowX, FIELD_SIZE, gx, gy), sampleGrid(flowY, FIELD_SIZE, gx, gy)];
}
