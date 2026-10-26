import { QUALITY, settings } from '../ui/settings.ts';
import { canvas, coarsePointer, labelCanvas } from '../dom.ts';
import { createScreenTargets, deleteScreenTargets, type ScreenTargets } from './targets.ts';

export const labelContext = (() => {
  const context = labelCanvas.getContext('2d');
  if (!context) throw new Error('2d canvas is not available');
  return context;
})();

export const screen: { width: number; height: number; targets: ScreenTargets | null } = {
  width: 0,
  height: 0,
  targets: null,
};

export function screenTargets(): ScreenTargets {
  if (!screen.targets) throw new Error('screen targets are not ready');
  return screen.targets;
}

let backdropTexture: WebGLTexture | null = null;

export function setBackdrop(texture: WebGLTexture): void {
  backdropTexture = texture;
}

export function backdrop(): WebGLTexture {
  return backdropTexture ?? screenTargets().base.texture;
}

export function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const cap = Math.min(QUALITY[settings().quality].pixelRatio, coarsePointer ? 1.5 : 2);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, cap);
  const width = Math.max(1, Math.floor(Math.max(1, Math.floor(rect.width)) * pixelRatio));
  const height = Math.max(1, Math.floor(Math.max(1, Math.floor(rect.height)) * pixelRatio));
  if (width === screen.width && height === screen.height) return;
  screen.width = width;
  screen.height = height;
  canvas.width = width;
  canvas.height = height;
  labelCanvas.width = width;
  labelCanvas.height = height;
  labelContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (screen.targets) deleteScreenTargets(screen.targets);
  screen.targets = createScreenTargets(width, height);
}
