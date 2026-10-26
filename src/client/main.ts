import { MAX_NAME } from '../shared/protocol.ts';
import { playSfx, startAmbience, toggleSound } from './audio.ts';
import {
  boot,
  deathScreen,
  enterButton,
  hud,
  intro,
  joinForm,
  killerLabel,
  nameInput,
  respawnButton,
  showStatus,
  soundButton,
  specimenName,
} from './dom.ts';
import { resize } from './gl/screen.ts';
import { drawLabels, updateOccupancy, updateUI } from './hud.ts';
import { bindInput, steerWithJoystick, stopJoystick } from './input.ts';
import { Net } from './net.ts';
import { seedFluid } from './render/fluid.ts';
import { renderFrame } from './render/frame.ts';
import { playerCenter, state } from './state.ts';
import { resetDecor } from './world/decor.ts';
import { updateSimulation } from './world/simulation.ts';
import { processCreatures, processFood, processSnapshot } from './world/sync.ts';

const IDENTITY_KEY = 'squish.identity';
const INPUT_INTERVAL = 52;
const VIEW_INTERVAL = 900;

function setEnterLabel(text: string): void {
  const label = enterButton.querySelector('span');
  if (label) label.textContent = text;
}

const net = new Net({
  onOpen: () => {
    if (!state.joined) showStatus('linked to the culture', 1400);
  },
  onClose: () => {
    showStatus('signal lost — rejoining', 3000);
  },
  onWelcome: (message) => {
    state.me = message.id;
    state.joined = true;
    state.dead = false;
    state.targetReady = false;
    deathScreen.hidden = true;
    intro.classList.add('leaving');
    hud.hidden = false;
    specimenName.textContent = message.name;
    resetDecor();
    startAmbience();
    showStatus('you are in the suspension', 1600);
  },
  onRoster: (players) => {
    state.roster = new Map(players.map((player) => [player.id, player]));
    updateOccupancy();
  },
  onSnapshot: processSnapshot,
  onFood: processFood,
  onCreature: processCreatures,
  onDead: (by) => {
    state.dead = true;
    killerLabel.textContent = by || 'the culture';
    deathScreen.hidden = false;
    state.camera.shake = 7;
    playSfx('death', 1);
    stopJoystick();
    showStatus('membrane compromised', 2200);
  },
  onRespawned: () => {
    state.dead = false;
    state.joined = true;
    state.targetReady = false;
    deathScreen.hidden = true;
    showStatus('re-entered the suspension', 1400);
  },
  onFull: () => {
    enterButton.disabled = false;
    setEnterLabel('Enter the suspension');
    showStatus('the culture is full', 2600);
  },
});

function restoreName(): void {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(IDENTITY_KEY) ?? 'null');
    if (saved && typeof saved === 'object' && 'name' in saved && typeof saved.name === 'string') {
      nameInput.value = saved.name;
    }
  } catch {
    return;
  }
}

function bindForms(): void {
  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (state.joined) return;
    const name = nameInput.value.trim().slice(0, MAX_NAME) || 'Unnamed organism';
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name }));
    enterButton.disabled = true;
    setEnterLabel('Entering…');
    net.join(name, -1);
  });
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') event.stopPropagation();
  });
  respawnButton.addEventListener('click', () => {
    deathScreen.hidden = true;
    net.respawn();
  });
  soundButton.addEventListener('click', toggleSound);
}

const timers = { input: 0, view: 0, frame: performance.now() };

function sendControls(now: number): void {
  if (state.joined && !state.dead && now - timers.input > INPUT_INTERVAL && playerCenter()) {
    net.input(state.target.x, state.target.y);
    timers.input = now;
  }
  if (now - timers.view > VIEW_INTERVAL) {
    net.view(state.camera.x, state.camera.y);
    timers.view = now;
  }
}

function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.05, (now - timers.frame) / 1000 || 0.016);
  timers.frame = now;
  state.time += dt;
  updateSimulation(dt);
  steerWithJoystick();
  sendControls(performance.now());
  renderFrame(dt);
  drawLabels();
  updateUI();
  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
restoreName();
bindForms();
bindInput(net);
resetDecor();
seedFluid();
requestAnimationFrame(loop);
function finishBoot(): void {
  boot.classList.add('done');
}

void document.fonts.ready.then(finishBoot);
setTimeout(finishBoot, 2500);
window.addEventListener('beforeunload', () => {
  net.close();
});
