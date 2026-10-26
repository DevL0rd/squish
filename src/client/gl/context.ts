import { boot, canvas } from '../dom.ts';

function fail(message: string, reason: string): never {
  boot.innerHTML = `<span>${message}</span>`;
  throw new Error(reason);
}

function createContext(): WebGL2RenderingContext {
  try {
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: true,
    });
    if (context) return context;
  } catch {
    return fail('This specimen needs WebGL 2.', 'WebGL2 is not available');
  }
  return fail('This specimen needs WebGL 2.', 'WebGL2 is not available');
}

export const gl = createContext();

if (!gl.getExtension('EXT_color_buffer_float')) {
  fail(
    'This display cannot hold the culture. WebGL float buffers are unavailable.',
    'EXT_color_buffer_float is not available',
  );
}

export const floatLinear = gl.getExtension('OES_texture_float_linear') !== null;
gl.getExtension('EXT_float_blend');
gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
gl.disable(gl.DEPTH_TEST);
gl.disable(gl.CULL_FACE);
gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

export function required<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`could not create ${what}`);
  return value;
}

const quadBuffer = required(gl.createBuffer(), 'quad buffer');
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

export function bindQuadAttribute(): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
}

const quadVAO = required(gl.createVertexArray(), 'quad vertex array');
gl.bindVertexArray(quadVAO);
bindQuadAttribute();

export function drawQuad(): void {
  gl.bindVertexArray(quadVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

export function blend(source: number, destination: number): void {
  gl.enable(gl.BLEND);
  gl.blendFunc(source, destination);
}

export function bindTexture(unit: number, texture: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}
