function element<T extends HTMLElement>(id: string, type: new () => T): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`missing #${id}`);
  return found;
}

export const canvas = element('culture', HTMLCanvasElement);
export const labelCanvas = element('labels', HTMLCanvasElement);
export const hud = element('hud', HTMLElement);
export const intro = element('intro', HTMLElement);
export const deathScreen = element('death', HTMLElement);
export const joinForm = element('joinForm', HTMLFormElement);
export const nameInput = element('nameInput', HTMLInputElement);
export const enterButton = element('enterBtn', HTMLButtonElement);
export const massLabel = element('mass', HTMLElement);
export const bodyCountLabel = element('bodyCount', HTMLElement);
export const rankLabel = element('rank', HTMLElement);
export const specimenName = element('specimenName', HTMLElement);
export const occupantsLabel = element('occupants', HTMLElement);
export const onlineLabel = element('online', HTMLElement);
export const ranksList = element('ranks', HTMLOListElement);
export const killerLabel = element('killer', HTMLElement);
export const respawnButton = element('respawnBtn', HTMLButtonElement);
const statusBox = element('status', HTMLElement);
export const boot = element('boot', HTMLElement);
export const soundButton = element('soundBtn', HTMLButtonElement);
export const musicButton = element('musicBtn', HTMLButtonElement);
export const splitButton = element('splitBtn', HTMLButtonElement);
export const ejectButton = element('ejectBtn', HTMLButtonElement);
export const joystick = element('joystick', HTMLElement);
export const joystickKnob = element('joystickKnob', HTMLElement);
export const guide = element('guide', HTMLElement);
export const guideOpen = element('guideOpen', HTMLButtonElement);
export const guideClose = element('guideClose', HTMLButtonElement);
export const settingsDialog = element('settings', HTMLDialogElement);
export const settingsOpen = element('settingsOpen', HTMLButtonElement);
export const settingsButton = element('settingsBtn', HTMLButtonElement);
export const settingsClose = element('settingsClose', HTMLButtonElement);
export const settingsReset = element('settingsReset', HTMLButtonElement);
export const settingsBody = element('settingsBody', HTMLElement);
export const settingsNote = element('settingsNote', HTMLElement);
export const mealsList = element('meals', HTMLOListElement);
export const effectsBox = element('effects', HTMLElement);
export const digestLabel = element('digestLabel', HTMLElement);
export const digestFill = element('digestFill', HTMLElement);
export const pigmentDot = element('pigmentDot', HTMLElement);
export const pigmentLabel = element('pigmentLabel', HTMLElement);

export const coarsePointer = window.matchMedia('(pointer: coarse)').matches;

let statusTimer = 0;

export function showStatus(text: string, duration = 2400): void {
  statusBox.textContent = text;
  statusBox.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    statusBox.classList.remove('show');
  }, duration);
}
export const adminPanel = element('admin', HTMLElement);
export const adminOpen = element('adminOpen', HTMLButtonElement);
export const eventBanner = element('eventBanner', HTMLElement);
export const boostButton = element('boostBtn', HTMLButtonElement);
export const boostMeter = element('boostMeter', HTMLElement);
export const levelLabel = element('levelLabel', HTMLElement);
export const attackLabel = element('attackLabel', HTMLElement);
export const defenseLabel = element('defenseLabel', HTMLElement);
