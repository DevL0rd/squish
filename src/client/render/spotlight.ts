import type { Rgb } from '../../shared/math.ts';
import { SpotPhase } from '../../shared/protocol.ts';
import { vividColor } from '../color.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { backdrop } from '../gl/screen.ts';
import { programs } from '../gl/programs.ts';
import { state } from '../state.ts';
import { hazardView } from '../world/hazards.ts';
import { activeInjections } from '../world/injections.ts';
import { lastStrike } from '../world/strike.ts';
import { setScreen, setView } from './view.ts';

const NEEDLE_DIRECTION = { x: 0.5, y: 0.866 };

export function drawSpotlight(time: number): void {
  const { spot } = hazardView();
  if (!spot) return;
  blend(gl.ONE, gl.ONE);
  setView(programs.spot)
    .vec2('uCenter', spot.x, spot.y)
    .float('uExtent', spot.radius * 1.4)
    .float('uRadius', spot.radius)
    .float('uPhase', spot.phase)
    .float('uProgress', spot.progress)
    .float('uTime', time);
  drawQuad();
  gl.disable(gl.BLEND);
}

interface Needle {
  readonly tip: { readonly x: number; readonly y: number };
  readonly progress: number;
  readonly fluid: Rgb;
  readonly gift: boolean;
}

function needle(item: Needle): void {
  setScreen(setView(programs.needle))
    .int('uBackground', 0)
    .vec2('uCenter', state.camera.x, state.camera.y)
    .float('uExtent', Math.max(state.camera.width, state.camera.height))
    .vec2('uTip', item.tip.x, item.tip.y)
    .vec2('uDirection', NEEDLE_DIRECTION.x, NEEDLE_DIRECTION.y)
    .float('uProgress', item.progress)
    .vec3('uFluid', vividColor(item.fluid))
    .float('uGift', item.gift ? 1 : 0);
  drawQuad();
}

function strikeNeedle(): Needle | null {
  const { spot } = hazardView();
  if (spot?.phase !== SpotPhase.Strike) return null;
  const target = state.cells.get(spot.target);
  const strike = lastStrike();
  return {
    tip: target ? target.center : spot,
    progress: spot.progress,
    fluid: strike?.color ?? target?.fluidColor ?? [0.6, 0.7, 0.65],
    gift: strike?.gift ?? false,
  };
}

function injectionNeedles(): Needle[] {
  return activeInjections().flatMap((item) => {
    const cell = state.cells.get(item.cellId);
    return cell ? [{ tip: cell.center, progress: item.progress, fluid: item.color, gift: true }] : [];
  });
}

export function drawNeedle(): void {
  const strike = strikeNeedle();
  const needles = strike ? [strike, ...injectionNeedles()] : injectionNeedles();
  if (!needles.length) return;
  bindTexture(0, backdrop());
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const item of needles) needle(item);
  gl.disable(gl.BLEND);
}
