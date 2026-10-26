import { settings } from '../ui/settings.ts';
import { clamp, lerp, WORLD } from '../../shared/math.ts';
import { canvas } from '../dom.ts';
import { screen } from '../gl/screen.ts';
import type { CellVisual } from '../cell/cell.ts';
import { ownCells, playerCenter, state, WORLD_CENTER } from '../state.ts';

const TREMOR = { joined: 0.32, watching: 0.75 };
const FULL_ZOOM_MASS = 10000;

export interface Bounds {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

interface Framing {
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export function viewBounds(margin: number): Bounds {
  const { camera } = state;
  const width = camera.width + margin * 2;
  const height = camera.height + margin * 2;
  return {
    left: camera.x - width / 2,
    right: camera.x + width / 2,
    top: camera.y + height / 2,
    bottom: camera.y - height / 2,
    width,
    height,
  };
}

function followPlayer(center: { x: number; y: number; mass: number }): Framing {
  const baseWidth = Math.max(390, Math.min(2100, canvas.clientWidth * 1.12));
  const zoom = 1 + Math.sqrt(Math.min(1, center.mass / FULL_ZOOM_MASS));
  let vx = 0;
  let vy = 0;
  for (const cell of ownCells()) {
    vx += cell.vx * cell.mass;
    vy += cell.vy * cell.mass;
  }
  const lead = 0.045 / Math.max(center.mass, 1);
  return {
    x: center.x + vx * lead,
    y: center.y + vy * lead,
    width: clamp(baseWidth * zoom * state.zoom.value, 380, 3600),
  };
}

function attractMode(): Framing {
  let subject: CellVisual | null = null;
  for (const cell of state.cells.values()) {
    if (!subject || cell.radius > subject.radius) subject = cell;
  }
  const drift = state.time * 0.07 + state.attractSeed;
  const baseWidth = Math.max(500, Math.min(2200, canvas.clientWidth * 1.25));
  if (!subject) {
    return {
      x: WORLD_CENTER + Math.cos(drift) * 780,
      y: WORLD_CENTER + Math.sin(drift * 0.83) * 420,
      width: baseWidth * 1.15,
    };
  }
  return {
    x: subject.x + Math.cos(drift) * subject.radius * 2.6,
    y: subject.y + Math.sin(drift * 0.89) * subject.radius * 2.6,
    width: clamp(baseWidth * 1.02 + subject.radius * 3.8, 580, 2600),
  };
}

function framing(): Framing {
  const center = playerCenter();
  if (center && !state.dead) return followPlayer(center);
  if (state.joined && state.dead) return { x: state.camera.x, y: state.camera.y, width: state.camera.width };
  return attractMode();
}

export function updateCamera(dt: number): void {
  const { camera, zoom } = state;
  const target = framing();
  zoom.value += (zoom.target - zoom.value) * (1 - Math.exp(-dt * 9));
  const centerBlend = 1 - Math.exp(-dt * (state.joined ? 8.2 : 3.6));
  camera.x = lerp(camera.x, target.x, centerBlend);
  camera.y = lerp(camera.y, target.y, centerBlend);
  camera.width = lerp(camera.width, target.width, 1 - Math.exp(-dt * 1.7));
  camera.height = camera.width / (screen.width / Math.max(screen.height, 1));
  const halfW = camera.width / 2;
  const halfH = camera.height / 2;
  camera.x = camera.width >= WORLD ? WORLD_CENTER : clamp(camera.x, halfW, WORLD - halfW);
  camera.y = camera.height >= WORLD ? WORLD_CENTER : clamp(camera.y, halfH, WORLD - halfH);
  camera.shake *= Math.exp(-dt * 7);
  const tremor = settings().reducedMotion ? 0 : TREMOR[state.joined ? 'joined' : 'watching'];
  camera.ox = (Math.random() - 0.5) * camera.shake + Math.sin(state.time * 1.7) * tremor;
  camera.oy = (Math.random() - 0.5) * camera.shake + Math.cos(state.time * 1.31) * tremor;
}
