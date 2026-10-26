import { MAX_NAME } from '../shared/protocol.ts';
import { bindAudioSettings, playSfx, startAmbience, toggleMusic, toggleSound } from './audio.ts';
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
  musicButton,
  soundButton,
  specimenName,
} from './dom.ts';
import { resize } from './gl/screen.ts';
import { drawLabels, updateOccupancy, updateUI } from './hud.ts';
import { bindInput, steerWithJoystick, stopJoystick } from './input.ts';
import { Net } from './net.ts';
import { enableAdmin } from './ui/admin.ts';
import { receiveEcho, receiveStats, updatePerfHud } from './ui/perf-hud.ts';
import { beginFrame, endFrame, gpuStage, stage } from './perf.ts';
import { nextFrame } from './frame-loop.ts';
import { showBoost } from './ui/boost.ts';
import { showProgress } from './ui/progress.ts';
import { updateEventBanner } from './ui/event-banner.ts';
import { updateCreatureChatter } from './voices.ts';
import { seedFluid } from './render/fluid.ts';
import { renderFrame } from './render/frame.ts';
import { playerCenter, state } from './state.ts';
import { resetDecor } from './world/decor.ts';
import { receiveHazards } from './world/hazards.ts';
import { receiveDrift, receiveShapes } from './world/obstacles.ts';
import { takePinches, updateSimulation } from './world/simulation.ts';
import { bindInterfaceSettings } from './ui/apply.ts';
import { clearEffects, updateEffects } from './ui/effects.ts';
import { resetMeals, updateMeals } from './ui/meals.ts';
import { bindMenus, menuOpen } from './ui/menus.ts';
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
    state.joinedAt = performance.now();
    state.dead = false;
    state.targetReady = false;
    deathScreen.hidden = true;
    intro.classList.add('leaving');
    hud.hidden = false;
    specimenName.textContent = message.name;
    resetMeals();
    clearEffects();
    resetDecor();
    startAmbience();
    enableAdmin(message.admin, net);
    admin = message.admin !== null;
    showStatus('you are in the suspension', 1600);
  },
  onRoster: (players) => {
    state.roster = new Map(players.map((player) => [player.id, player]));
    updateOccupancy();
  },
  onSnapshot: processSnapshot,
  onFood: processFood,
  onCreature: processCreatures,
  onObstacles: receiveShapes,
  onDrift: receiveDrift,
  onHazards: receiveHazards,
  onAnnounce: (text, danger) => {
    showStatus(text, danger ? 5200 : 3200);
    if (danger) playSfx('death', 0.35);
  },
  onDead: (by) => {
    state.dead = true;
    killerLabel.textContent = by || 'the culture';
    deathScreen.hidden = false;
    state.camera.shake = 7;
    playSfx('death', 1);
    stopJoystick();
    showStatus('membrane compromised', 2200);
  },
  onBoost: showBoost,
  onStats: receiveStats,
  onEcho: receiveEcho,
  onBoard: (masses) => {
    state.masses = new Map(masses);
  },
  onProgress: showProgress,
  onRespawned: () => {
    state.dead = false;
    state.joined = true;
    state.joinedAt = performance.now();
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
  musicButton.addEventListener('click', toggleMusic);
}

const timers = { input: 0, view: 0, frame: performance.now() };
let admin = false;

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

function updateHud(dt: number): void {
  updateUI();
  updateEventBanner();
  updateCreatureChatter();
  updateMeals(dt);
  updateEffects();
}

function loop(): void {
  beginFrame();
  const now = performance.now();
  const dt = Math.min(0.05, (now - timers.frame) / 1000 || 0.016);
  timers.frame = now;
  state.time += dt;
  stage('simulate', () => {
    updateSimulation(dt);
  });
  steerWithJoystick();
  sendControls(performance.now());
  for (const pinch of takePinches()) net.pinch(pinch.cell, pinch.x, pinch.y, pinch.share);
  stage('render', () => {
    gpuStage(() => {
      renderFrame(dt);
    });
  });
  stage('labels', drawLabels);
  stage('hud', () => {
    updateHud(dt);
  });
  updatePerfHud(net, admin);
  endFrame();
  nextFrame(loop);
}

window.addEventListener('resize', resize);
resize();
restoreName();
bindForms();
bindInput(net, menuOpen);
bindMenus();
bindAudioSettings();
window.addEventListener('pointerdown', startAmbience, { once: true });
window.addEventListener('keydown', startAmbience, { once: true });
bindInterfaceSettings();
resetDecor();
seedFluid();
nextFrame(loop);
function finishBoot(): void {
  boot.classList.add('done');
}

void document.fonts.ready.then(finishBoot);
setTimeout(finishBoot, 2500);
window.addEventListener('beforeunload', () => {
  net.close();
});
