import { bindQuadAttribute, gl, required } from './context.ts';

export class InstanceBatch {
  private readonly data: Float32Array;
  private readonly stride: number;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly capacity: number;
  private size = 0;

  constructor(vec4Count: number, capacity: number) {
    this.capacity = capacity;
    this.stride = vec4Count * 4;
    this.data = new Float32Array(capacity * this.stride);
    this.vao = required(gl.createVertexArray(), 'instance vertex array');
    this.buffer = required(gl.createBuffer(), 'instance buffer');
    gl.bindVertexArray(this.vao);
    bindQuadAttribute();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (let i = 0; i < vec4Count; i += 1) {
      gl.enableVertexAttribArray(i + 1);
      gl.vertexAttribPointer(i + 1, 4, gl.FLOAT, false, this.stride * 4, i * 16);
      gl.vertexAttribDivisor(i + 1, 1);
    }
    gl.bindVertexArray(null);
  }

  get count(): number {
    return this.size;
  }

  begin(): void {
    this.size = 0;
  }

  add(values: readonly number[]): boolean {
    this.data.set(values, this.size * this.stride);
    this.size += 1;
    return this.size < this.capacity;
  }

  draw(): void {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.subarray(0, this.size * this.stride), gl.DYNAMIC_DRAW);
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.size);
  }
}
