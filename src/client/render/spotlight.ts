import type { Rgb } from '../../shared/math.ts';
import { SkyTool, SpotPhase, type WireSpot } from '../../shared/protocol.ts';
import { vividColor } from '../color.ts';
import { bindTexture, blend, drawQuad, gl } from '../gl/context.ts';
import { backdrop, screenTargets } from '../gl/screen.ts';
import { programs } from '../gl/programs.ts';
import { inView, state } from '../state.ts';
import { hazardView } from '../world/hazards.ts';
import { shadowSteps } from './lights.ts';
import { activeInjections } from '../world/injections.ts';
import { lastStrike } from '../world/strike.ts';
import { setScreen, setView } from './view.ts';

const NEEDLE_DIRECTION = { x: 0.5, y: 0.866 };

function visibleSpots(): WireSpot[] {
  return hazardView().spots.filter((spot) => inView(spot, 1, spot.radius * 1.4));
}

export function drawSpotlight(time: number): void {
  const spots = visibleSpots();
  if (!spots.length) return;
  bindTexture(0, screenTargets().cells.texture);
  blend(gl.ONE, gl.ONE);
  for (const spot of spots) spotQuad(spot, time);
  gl.disable(gl.BLEND);
}

function spotQuad(spot: WireSpot, time: number): void {
  setView(programs.spot)
    .int('uOccluder', 0)
    .int('uSteps', shadowSteps())
    .vec2('uLight', NEEDLE_DIRECTION.x, NEEDLE_DIRECTION.y)
    .vec2('uCenter', spot.x, spot.y)
    .float('uExtent', spot.radius * 1.4)
    .float('uRadius', spot.radius)
    .float('uPhase', spot.phase)
    .float('uProgress', spot.progress)
    .float('uTime', time);
  drawQuad();
}

interface Needle {
  readonly tip: { readonly x: number; readonly y: number };
  readonly direction: { readonly x: number; readonly y: number };
  readonly tool: number;
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
    .vec2('uDirection', item.direction.x, item.direction.y)
    .float('uTool', item.tool)
    .float('uProgress', item.progress)
    .vec3('uFluid', vividColor(item.fluid))
    .float('uGift', item.gift ? 1 : 0);
  drawQuad();
}

const HOLD_SECONDS = 60;
const HOLD_MOVE = 1.5;

function toolProgress(tool: number, progress: number): number {
  if (tool !== SkyTool.Holder) return progress;
  const elapsed = progress * HOLD_SECONDS;
  if (elapsed < HOLD_MOVE) return (elapsed / HOLD_MOVE) * 0.3;
  if (elapsed > HOLD_SECONDS - HOLD_MOVE) return 0.8 + ((elapsed - HOLD_SECONDS + HOLD_MOVE) / HOLD_MOVE) * 0.2;
  return 0.5;
}

function knifeOffset(spot: WireSpot, radius: number): { x: number; y: number } {
  if (spot.tool !== SkyTool.Knife) return { x: 0, y: 0 };
  const sweep = (spot.progress - 0.5) * 2 * Math.max(500, radius * 3);
  return { x: Math.cos(spot.angle) * sweep, y: Math.sin(spot.angle) * sweep };
}

function toolDirection(spot: WireSpot): { x: number; y: number } {
  return spot.tool === SkyTool.Knife ? { x: -Math.sin(spot.angle), y: Math.cos(spot.angle) } : NEEDLE_DIRECTION;
}

function strikeFluid(target: { readonly fluidColor: Rgb } | null): { fluid: Rgb; gift: boolean } {
  const strike = lastStrike();
  if (strike) return { fluid: strike.color, gift: strike.gift };
  return { fluid: target ? target.fluidColor : [0.6, 0.7, 0.65], gift: false };
}

function strikeNeedles(): Needle[] {
  return visibleSpots()
    .filter((spot) => spot.phase === SpotPhase.Strike)
    .map(strikeNeedle);
}

function strikeNeedle(spot: WireSpot): Needle {
  const target = state.cells.get(spot.target) ?? null;
  const center = target ? target.center : spot;
  const offset = knifeOffset(spot, target ? target.radius : 100);
  return {
    tip: { x: center.x + offset.x, y: center.y + offset.y },
    direction: toolDirection(spot),
    tool: spot.tool,
    progress: toolProgress(spot.tool, spot.progress),
    ...strikeFluid(target),
  };
}

function injectionNeedles(): Needle[] {
  return activeInjections().flatMap((item) => {
    const cell = state.cells.get(item.cellId);
    return cell
      ? [
          {
            tip: cell.center,
            direction: NEEDLE_DIRECTION,
            tool: SkyTool.Needle,
            progress: item.progress,
            fluid: item.color,
            gift: true,
          },
        ]
      : [];
  });
}

export function drawNeedle(): void {
  const needles = [...strikeNeedles(), ...injectionNeedles()];
  if (!needles.length) return;
  bindTexture(0, backdrop());
  blend(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  for (const item of needles) needle(item);
  gl.disable(gl.BLEND);
}
