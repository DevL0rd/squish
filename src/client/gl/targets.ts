import { coarsePointer } from '../dom.ts';
import { floatLinear, gl, required } from './context.ts';

export interface RenderTarget {
  readonly texture: WebGLTexture;
  readonly framebuffer: WebGLFramebuffer;
  readonly width: number;
  readonly height: number;
}

interface TargetFormat {
  readonly internalFormat: number;
  readonly format: number;
  readonly type: number;
  readonly filter: number;
}

const HALF_FLOAT = { internalFormat: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT };

export function createTexture(filter: number): WebGLTexture {
  const texture = required(gl.createTexture(), 'texture');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}

function createRenderTarget(width: number, height: number, format: TargetFormat): RenderTarget {
  const texture = createTexture(format.filter);
  gl.texImage2D(gl.TEXTURE_2D, 0, format.internalFormat, width, height, 0, format.format, format.type, null);
  const framebuffer = required(gl.createFramebuffer(), 'framebuffer');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (!complete) throw new Error('incomplete framebuffer');
  return { texture, framebuffer, width, height };
}

function halfFloatTarget(width: number, height: number, filter: number): RenderTarget {
  return createRenderTarget(width, height, { ...HALF_FLOAT, filter });
}

export class PingPong {
  private index = 0;
  private readonly targets: readonly [RenderTarget, RenderTarget];

  constructor(size: number) {
    const filter = floatLinear ? gl.LINEAR : gl.NEAREST;
    this.targets = [halfFloatTarget(size, size, filter), halfFloatTarget(size, size, filter)];
  }

  get read(): RenderTarget {
    return this.index === 0 ? this.targets[0] : this.targets[1];
  }

  get write(): RenderTarget {
    return this.index === 0 ? this.targets[1] : this.targets[0];
  }

  swap(): void {
    this.index = 1 - this.index;
  }
}

export const FIELD_SIZE = 64;
export const fluidSize = Math.min(coarsePointer ? 640 : 1024, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
export const velocity = new PingPong(fluidSize);
export const dye = new PingPong(fluidSize);
export const pressure = new PingPong(fluidSize);
export const divergenceTarget = halfFloatTarget(fluidSize, fluidSize, gl.NEAREST);
export const fieldTarget = createRenderTarget(FIELD_SIZE, FIELD_SIZE, {
  internalFormat: gl.RGBA8,
  format: gl.RGBA,
  type: gl.UNSIGNED_BYTE,
  filter: gl.NEAREST,
});

export interface ScreenTargets {
  readonly base: RenderTarget;
  readonly cells: RenderTarget;
  readonly bright: RenderTarget;
  readonly blur: RenderTarget;
}

export function createScreenTargets(width: number, height: number): ScreenTargets {
  const lowWidth = Math.max(1, Math.floor(width * 0.5));
  const lowHeight = Math.max(1, Math.floor(height * 0.5));
  return {
    base: halfFloatTarget(width, height, gl.LINEAR),
    cells: halfFloatTarget(width, height, gl.LINEAR),
    bright: halfFloatTarget(lowWidth, lowHeight, gl.LINEAR),
    blur: halfFloatTarget(lowWidth, lowHeight, gl.LINEAR),
  };
}

export function deleteScreenTargets(targets: ScreenTargets): void {
  for (const target of [targets.base, targets.cells, targets.bright, targets.blur]) {
    gl.deleteTexture(target.texture);
    gl.deleteFramebuffer(target.framebuffer);
  }
}

export function bindTarget(target: RenderTarget | null, width: number, height: number): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
  gl.viewport(0, 0, width, height);
}
