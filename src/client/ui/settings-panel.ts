import { settingsBody, settingsNote } from '../dom.ts';
import { onSettings, settings, updateSettings, type Settings } from './settings.ts';

type Control =
  | { readonly kind: 'range'; readonly key: KeysOf<number>; readonly label: string }
  | { readonly kind: 'switch'; readonly key: KeysOf<boolean>; readonly label: string; readonly hint?: string }
  | {
      readonly kind: 'choice';
      readonly key: 'quality' | 'joystick' | 'frameLimit';
      readonly label: string;
      readonly options: readonly string[];
      readonly hint?: string;
    };

type KeysOf<T> = { [K in keyof Settings]: Settings[K] extends T ? K : never }[keyof Settings];

interface Section {
  readonly title: string;
  readonly controls: readonly Control[];
}

const SECTIONS: readonly Section[] = [
  {
    title: 'Sound',
    controls: [
      { kind: 'switch', key: 'muted', label: 'Mute everything' },
      { kind: 'range', key: 'master', label: 'Master volume' },
      { kind: 'range', key: 'effects', label: 'Effects' },
      { kind: 'range', key: 'ambience', label: 'Ambience' },
      { kind: 'switch', key: 'musicOn', label: 'Background music' },
      { kind: 'range', key: 'music', label: 'Music volume' },
    ],
  },
  {
    title: 'Visuals',
    controls: [
      {
        kind: 'choice',
        key: 'quality',
        label: 'Quality',
        options: ['high', 'balanced', 'low'],
        hint: 'fluid detail applies after reload',
      },
      { kind: 'switch', key: 'vsync', label: 'V-sync', hint: 'off renders as fast as possible' },
      {
        kind: 'choice',
        key: 'frameLimit',
        label: 'Frame limit',
        options: ['off', '30', '60', '120', '144'],
      },
      { kind: 'switch', key: 'fps', label: 'FPS counter' },
      { kind: 'switch', key: 'bloom', label: 'Bloom glow' },
      { kind: 'switch', key: 'grain', label: 'Film grain' },
      { kind: 'switch', key: 'shake', label: 'Screen shake' },
      { kind: 'switch', key: 'reducedMotion', label: 'Reduce motion', hint: 'calmer camera and interface' },
      { kind: 'switch', key: 'names', label: 'Organism names' },
    ],
  },
  {
    title: 'Controls',
    controls: [
      { kind: 'choice', key: 'joystick', label: 'Touch joystick side', options: ['left', 'right'] },
      { kind: 'switch', key: 'vibration', label: 'Vibration on touch' },
    ],
  },
  {
    title: 'Interface',
    controls: [
      { kind: 'switch', key: 'leaderboard', label: 'Population board' },
      { kind: 'switch', key: 'meals', label: 'Recent meals' },
    ],
  },
];

const refreshers: (() => void)[] = [];

function row(label: string, hint: string | undefined, control: HTMLElement): HTMLElement {
  const element = document.createElement('div');
  element.className = 'settings-row';
  const text = document.createElement('span');
  text.className = 'row-label';
  text.textContent = label;
  if (hint) {
    const small = document.createElement('small');
    small.textContent = hint;
    text.append(small);
  }
  element.append(text, control);
  return element;
}

function range(control: Extract<Control, { kind: 'range' }>): HTMLElement {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.setAttribute('aria-label', control.label);
  input.addEventListener('input', () => {
    updateSettings({ [control.key]: Number(input.value) / 100 });
  });
  refreshers.push(() => {
    input.value = String(Math.round(settings()[control.key] * 100));
  });
  return row(control.label, undefined, input);
}

function toggle(control: Extract<Control, { kind: 'switch' }>): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'switch';
  button.setAttribute('role', 'switch');
  button.setAttribute('aria-label', control.label);
  button.addEventListener('click', () => {
    updateSettings({ [control.key]: !settings()[control.key] });
  });
  refreshers.push(() => {
    button.setAttribute('aria-checked', String(settings()[control.key]));
  });
  return row(control.label, control.hint, button);
}

function choice(control: Extract<Control, { kind: 'choice' }>): HTMLElement {
  const group = document.createElement('div');
  group.className = 'segmented';
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-label', control.label);
  for (const option of control.options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.textContent = option;
    button.addEventListener('click', () => {
      updateSettings({ [control.key]: option });
    });
    refreshers.push(() => {
      button.setAttribute('aria-checked', String(settings()[control.key] === option));
    });
    group.append(button);
  }
  return row(control.label, control.hint, group);
}

function build(control: Control): HTMLElement {
  if (control.kind === 'range') return range(control);
  if (control.kind === 'switch') return toggle(control);
  return choice(control);
}

export function buildSettingsPanel(): void {
  for (const section of SECTIONS) {
    const element = document.createElement('section');
    element.className = 'settings-section';
    const title = document.createElement('div');
    title.className = 'label';
    title.textContent = section.title;
    element.append(title, ...section.controls.map(build));
    settingsBody.append(element);
  }
  onSettings(() => {
    for (const refresh of refreshers) refresh();
    settingsNote.textContent = 'Saved on this device';
  });
}
