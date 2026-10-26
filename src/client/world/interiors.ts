import type { Rgb } from '../../shared/math.ts';
import { colorForHue, hexSeed } from '../color.ts';
import { gl } from '../gl/context.ts';
import { createTexture } from '../gl/targets.ts';
import { Interior } from '../interior/interior.ts';
import { state, type CellVisual, type InteriorRecord } from '../state.ts';

const INTERIOR_RESOLUTION = 40;

export function newRecord(id: number, color: Rgb | null): InteriorRecord {
  const interior = new Interior(INTERIOR_RESOLUTION, hexSeed(id * 7919 + 17), color);
  return { interior, texture: null, lastSeen: performance.now(), fluidColor: null, colorTimer: 0 };
}

export function interiorFor(cell: CellVisual): InteriorRecord {
  let record = state.interiors.get(cell.id);
  if (!record) {
    record = newRecord(cell.id, cell.hue >= 0 ? colorForHue(cell.hue) : null);
    record.fluidColor = record.interior.averageColor();
    state.interiors.set(cell.id, record);
  }
  record.lastSeen = performance.now();
  return record;
}

export function interiorTexture(record: InteriorRecord): WebGLTexture {
  const { interior } = record;
  if (record.texture) {
    gl.bindTexture(gl.TEXTURE_2D, record.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, interior.n, interior.n, gl.RGBA, gl.UNSIGNED_BYTE, interior.textureData);
    return record.texture;
  }
  const texture = createTexture(gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, interior.n, interior.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, interior.textureData);
  record.texture = texture;
  return texture;
}

export function ensureTexture(record: InteriorRecord): WebGLTexture {
  return record.texture ?? interiorTexture(record);
}

export function releaseRecord(record: InteriorRecord): void {
  if (record.texture) gl.deleteTexture(record.texture);
  record.texture = null;
}

export function removeCell(cellId: number): void {
  state.cells.delete(cellId);
  const record = state.interiors.get(cellId);
  if (!record) return;
  releaseRecord(record);
  state.interiors.delete(cellId);
}

export function refreshFluidColor(record: InteriorRecord): Rgb {
  record.fluidColor = record.interior.averageColor();
  return record.fluidColor;
}

export function cellFluidColor(cell: CellVisual): Rgb {
  const record = interiorFor(cell);
  return record.fluidColor ?? refreshFluidColor(record);
}
