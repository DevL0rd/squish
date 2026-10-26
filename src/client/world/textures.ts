import type { CellVisual } from '../cell/cell.ts';
import { gl } from '../gl/context.ts';
import { createTexture } from '../gl/targets.ts';
import { state } from '../state.ts';

export function uploadInterior(cell: CellVisual): WebGLTexture {
  const { interior } = cell;
  if (cell.texture) {
    gl.bindTexture(gl.TEXTURE_2D, cell.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, interior.n, interior.n, gl.RGBA, gl.UNSIGNED_BYTE, interior.textureData);
    return cell.texture;
  }
  const texture = createTexture(gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, interior.n, interior.n, 0, gl.RGBA, gl.UNSIGNED_BYTE, interior.textureData);
  cell.texture = texture;
  return texture;
}

export function interiorTexture(cell: CellVisual): WebGLTexture {
  return cell.texture ?? uploadInterior(cell);
}

export function removeCell(cellId: number): void {
  const cell = state.cells.get(cellId);
  if (cell?.texture) gl.deleteTexture(cell.texture);
  state.cells.delete(cellId);
}
