import { canvas, coarsePointer, labelCanvas } from '../dom.ts';
import { createScreenTargets, deleteScreenTargets, type ScreenTargets } from './targets.ts';

const PIXEL_RATIO_CAP = coarsePointer ? 1.5 : 1.6;

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

export function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, PIXEL_RATIO_CAP);
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
