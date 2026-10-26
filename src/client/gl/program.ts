import { gl, required } from './context.ts';

function compileShader(type: number, source: string): WebGLShader {
  const shader = required(gl.createShader(type), 'shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info ?? 'shader compilation failed');
  }
  return shader;
}

function linkProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
  const vertex = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const program = required(gl.createProgram(), 'program');
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info ?? 'program link failed');
  }
  return program;
}

export class ShaderProgram {
  private readonly program: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(vertexSource: string, fragmentSource: string) {
    this.program = linkProgram(vertexSource, fragmentSource);
    const count = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS) as number;
    for (let i = 0; i < count; i += 1) {
      const info = gl.getActiveUniform(this.program, i);
      if (info) this.uniforms.set(info.name.replace(/\[0\]$/, ''), gl.getUniformLocation(this.program, info.name));
    }
  }

  private at(name: string): WebGLUniformLocation | null {
    return this.uniforms.get(name) ?? null;
  }

  use(): this {
    gl.useProgram(this.program);
    return this;
  }

  int(name: string, value: number): this {
    gl.uniform1i(this.at(name), value);
    return this;
  }

  float(name: string, value: number): this {
    gl.uniform1f(this.at(name), value);
    return this;
  }

  vec2(name: string, x: number, y: number): this {
    gl.uniform2f(this.at(name), x, y);
    return this;
  }

  vec3(name: string, color: readonly [number, number, number]): this {
    gl.uniform3f(this.at(name), color[0], color[1], color[2]);
    return this;
  }

  floats(name: string, values: Float32Array): this {
    gl.uniform1fv(this.at(name), values);
    return this;
  }

  vec2s(name: string, values: Float32Array): this {
    gl.uniform2fv(this.at(name), values);
    return this;
  }

  vec3s(name: string, values: Float32Array): this {
    gl.uniform3fv(this.at(name), values);
    return this;
  }

  vec4s(name: string, values: Float32Array): this {
    gl.uniform4fv(this.at(name), values);
    return this;
  }
}
