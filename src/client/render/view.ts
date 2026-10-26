import type { ShaderProgram } from '../gl/program.ts';
import { screen } from '../gl/screen.ts';
import { state } from '../state.ts';

export interface ViewCamera {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly ox: number;
  readonly oy: number;
}

let override: ViewCamera | null = null;

export function withCamera(camera: ViewCamera, draw: () => void): void {
  override = camera;
  try {
    draw();
  } finally {
    override = null;
  }
}

export function setView(program: ShaderProgram): ShaderProgram {
  const camera = override ?? state.camera;
  return program
    .use()
    .vec2('uCamera', camera.x + camera.ox, camera.y + camera.oy)
    .vec2('uView', camera.width, camera.height);
}

export function setScreen(program: ShaderProgram): ShaderProgram {
  return program.vec2('uResolution', screen.width, screen.height);
}
