import { clamp } from '../shared/math.ts';
import { toggleSound } from './audio.ts';
import { canvas, ejectButton, intro, joystick, joystickKnob, nameInput, splitButton } from './dom.ts';
import type { Net } from './net.ts';
import { playerCenter, shake, state } from './state.ts';

const JOYSTICK_LIMIT = 52;
const JOYSTICK_REACH = 640;
const MIN_ZOOM = 0.72;
const MAX_ZOOM = 1.5;

const stick = { active: false, id: -1, x: 0, y: 0, dx: 0, dy: 0 };
const pointers = new Map<number, { x: number; y: number }>();
const pinch = { active: false, distance: 0, zoom: 1 };

function pointerWorld(clientX: number, clientY: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const nx = (clientX - rect.left) / rect.width - 0.5;
  const ny = (clientY - rect.top) / rect.height - 0.5;
  return { x: state.camera.x + nx * state.camera.width, y: state.camera.y - ny * state.camera.height };
}

function aimAt(clientX: number, clientY: number): void {
  const world = pointerWorld(clientX, clientY);
  state.target.x = world.x;
  state.target.y = world.y;
}

export function stopJoystick(): void {
  stick.active = false;
  stick.id = -1;
  joystick.hidden = true;
  const center = playerCenter();
  if (!center) return;
  state.target.x = center.x;
  state.target.y = center.y;
}

function beginJoystick(event: PointerEvent): boolean {
  if (event.clientX > window.innerWidth * 0.52 || !playerCenter()) return false;
  Object.assign(stick, { active: true, id: event.pointerId, x: event.clientX, y: event.clientY, dx: 0, dy: 0 });
  joystick.hidden = false;
  joystick.style.left = `${event.clientX}px`;
  joystick.style.top = `${event.clientY}px`;
  joystickKnob.style.transform = 'translate(-50%, -50%)';
  return true;
}

function moveJoystick(event: PointerEvent): void {
  if (!stick.active || event.pointerId !== stick.id) return;
  let dx = event.clientX - stick.x;
  let dy = event.clientY - stick.y;
  const length = Math.hypot(dx, dy);
  if (length > JOYSTICK_LIMIT) {
    dx = (dx / length) * JOYSTICK_LIMIT;
    dy = (dy / length) * JOYSTICK_LIMIT;
  }
  stick.dx = dx / JOYSTICK_LIMIT;
  stick.dy = dy / JOYSTICK_LIMIT;
  joystickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

export function steerWithJoystick(): void {
  if (!stick.active) return;
  const center = playerCenter();
  if (!center) return;
  const length = Math.hypot(stick.dx, stick.dy);
  const reach = length > 0.08 ? JOYSTICK_REACH / length : 0;
  state.target.x = center.x + stick.dx * reach;
  state.target.y = center.y - stick.dy * reach;
}

function pinchPair(): [{ x: number; y: number }, { x: number; y: number }] | null {
  const [a, b] = [...pointers.values()];
  return a && b ? [a, b] : null;
}

function startPinch(): void {
  const pair = pinchPair();
  if (!pair) return;
  stopJoystick();
  pinch.active = true;
  pinch.distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
  pinch.zoom = state.zoom.target;
}

function onPointerDown(event: PointerEvent): void {
  if (!intro.classList.contains('leaving') || state.dead) return;
  if (event.pointerType === 'mouse') {
    if (event.button === 0) aimAt(event.clientX, event.clientY);
    return;
  }
  document.body.classList.add('touch-mode');
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size === 2) {
    startPinch();
    event.preventDefault();
    return;
  }
  if (pointers.size > 2 || !beginJoystick(event)) return;
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (event.pointerType === 'mouse') {
    aimAt(event.clientX, event.clientY);
    return;
  }
  if (pointers.has(event.pointerId)) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const pair = pinch.active ? pinchPair() : null;
  if (!pair || pointers.size !== 2) {
    moveJoystick(event);
    return;
  }
  const distance = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
  if (pinch.distance > 8) {
    state.zoom.target = clamp(pinch.zoom * (pinch.distance / Math.max(distance, 8)), MIN_ZOOM, MAX_ZOOM);
  }
}

function onPointerEnd(event: PointerEvent): void {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinch.active = false;
  if (stick.active && event.pointerId === stick.id) stopJoystick();
}

function holdButton(button: HTMLButtonElement, action: () => void, vibration: number): void {
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    action();
    if ('vibrate' in navigator) navigator.vibrate(vibration);
  });
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
}

function onKey(event: KeyboardEvent, net: Net): void {
  if (event.target === nameInput) return;
  if (event.code === 'Space') {
    event.preventDefault();
    net.split();
    shake(1.3);
  } else if (event.code === 'KeyW') {
    event.preventDefault();
    net.eject();
  } else if (event.code === 'KeyM') {
    toggleSound();
  }
}

export function bindInput(net: Net): void {
  holdButton(
    splitButton,
    () => {
      net.split();
    },
    8,
  );
  holdButton(
    ejectButton,
    () => {
      net.eject();
    },
    6,
  );
  window.addEventListener('keydown', (event) => {
    onKey(event, net);
  });
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      state.zoom.target = clamp(state.zoom.target * Math.exp(event.deltaY * 0.0012), MIN_ZOOM, MAX_ZOOM);
    },
    { passive: false },
  );
  canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
  });
  window.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') moveJoystick(event);
  });
  window.addEventListener('pointerup', onPointerEnd);
  window.addEventListener('pointercancel', onPointerEnd);
}
