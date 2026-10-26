import type { ShaderProgram } from '../gl/program.ts';
import { screen } from '../gl/screen.ts';
import { state } from '../state.ts';

export function setView(program: ShaderProgram): ShaderProgram {
  const { camera } = state;
  return program
    .use()
    .vec2('uCamera', camera.x + camera.ox, camera.y + camera.oy)
    .vec2('uView', camera.width, camera.height);
}

export function setScreen(program: ShaderProgram): ShaderProgram {
  return program.vec2('uResolution', screen.width, screen.height);
}
