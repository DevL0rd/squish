import { CreatureState } from '../shared/protocol.ts';
import { hiss, soundOut, tone, type Audio, type Hiss, type Tone } from './audio.ts';
import { state, type CreatureVisual } from './state.ts';

interface Voice {
  readonly tones: readonly Tone[];
  readonly hisses?: readonly Hiss[];
}

const HEARING = 0.62;
const COOLDOWN = 1400;
const CHATTER_INTERVAL = 320;
const CHATTER_QUIET = 3200;
const SWISH_SPEED = 160;
const MAX_PER_SECOND = 7;

const chirp = (from: number, to: number, duration: number, type: OscillatorType = 'sine'): Tone => ({
  type,
  from,
  to,
  duration,
  gain: 0.03,
});

const SPECIES: readonly Voice[] = [
  { tones: [{ ...chirp(520, 690, 0.16, 'triangle'), wobble: [26, 30] }] },
  { tones: [{ ...chirp(980, 1380, 0.22), wobble: [7, 40] }] },
  { tones: [{ ...chirp(1900, 1750, 0.3), gain: 0.018 }] },
  { tones: [{ ...chirp(310, 360, 0.26, 'triangle'), wobble: [19, 45] }] },
  { tones: [chirp(1500, 1120, 0.06)] },
  { tones: [{ ...chirp(1750, 1650, 0.05), gain: 0.022 }] },
  { tones: [chirp(420, 1250, 0.09, 'triangle')] },
  {
    tones: [
      { ...chirp(660, 640, 0.34), gain: 0.02 },
      { ...chirp(990, 960, 0.3), gain: 0.014, delay: 0.02 },
    ],
  },
  { tones: [{ ...chirp(230, 180, 0.32, 'triangle'), wobble: [5, 8] }] },
  {
    tones: [{ ...chirp(170, 260, 0.2, 'triangle'), wobble: [11, 20] }],
    hisses: [{ from: 500, to: 300, duration: 0.14, gain: 0.012, q: 2 }],
  },
  { tones: [{ ...chirp(250, 210, 0.28, 'sawtooth'), gain: 0.016, wobble: [31, 24] }] },
  { tones: [], hisses: [{ from: 3200, to: 1800, duration: 0.12, gain: 0.03, q: 6 }] },
  {
    tones: [
      { ...chirp(2400, 2300, 0.03, 'square'), gain: 0.012 },
      { ...chirp(700, 1600, 0.12), delay: 0.04 },
    ],
  },
];

const DIVIDE: Voice = {
  tones: [
    { ...chirp(620, 380, 0.14), wobble: [14, 30] },
    { ...chirp(900, 260, 0.1), delay: 0.16, gain: 0.035 },
  ],
  hisses: [{ from: 2600, to: 900, duration: 0.05, gain: 0.02, q: 3, delay: 0.16 }],
};

const LATCH: Voice = {
  tones: [{ ...chirp(2600, 2500, 0.025, 'square'), gain: 0.016 }],
  hisses: [{ from: 900, to: 3600, duration: 0.3, gain: 0.02, q: 4, delay: 0.05 }],
};

const SNAP: Voice = {
  tones: [chirp(1400, 240, 0.07, 'triangle')],
  hisses: [{ from: 3000, to: 600, duration: 0.08, gain: 0.03, q: 1.2 }],
};

function scaled(source: Voice, pitch: number, glide = 1, times = 1): Voice {
  const tones = source.tones.flatMap((spec) =>
    Array.from({ length: times }, (_, i) => ({
      ...spec,
      from: spec.from * pitch,
      to: spec.to * pitch * glide,
      delay: (spec.delay ?? 0) + i * (spec.duration * 0.75),
    })),
  );
  return source.hisses ? { tones, hisses: source.hisses } : { tones };
}

function stateVoice(kind: number, next: number): Voice | null {
  const base = SPECIES[kind];
  if (!base) return null;
  if (next === CreatureState.Divide) return DIVIDE;
  if (next === CreatureState.Latch) return LATCH;
  if (next === CreatureState.Contract) return SNAP;
  if (next === CreatureState.Flee) return scaled(base, 1.45, 1.6);
  if (next === CreatureState.Hunt) return scaled(base, 0.72, 0.8);
  if (next === CreatureState.Feed) return scaled(base, 1.1, 0.9, 2);
  if (next === CreatureState.Tumble) return scaled(base, 1.2, 1, 3);
  if (next === CreatureState.Reverse) return scaled(base, 1, 0.6);
  return null;
}

const recent = new Map<number, number>();
let budget = { second: 0, count: 0 };
let lastChatter = 0;

function placement(creature: CreatureVisual): { pan: number; level: number } | null {
  const camera = state.camera;
  const range = camera.width * HEARING;
  const dx = creature.x - camera.x;
  const distance = Math.hypot(dx, creature.y - camera.y);
  if (distance > range) return null;
  const near = 1 - distance / range;
  return { pan: Math.max(-1, Math.min(1, dx / (camera.width * 0.5))) * 0.8, level: near * near };
}

function allowed(now: number): boolean {
  const second = Math.floor(now / 1000);
  if (second !== budget.second) budget = { second, count: 0 };
  budget.count += 1;
  return budget.count <= MAX_PER_SECOND;
}

function voice(sound: Audio, spec: Voice, pan: number, level: number): void {
  const panner = sound.context.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(sound.effects);
  for (const item of spec.tones) tone(sound, level, item, panner);
  for (const item of spec.hisses ?? []) hiss(sound, level, item, panner);
  window.setTimeout(() => {
    panner.disconnect();
  }, 2000);
}

function speak(creature: CreatureVisual, spec: Voice | null, gain: number): void {
  const sound = soundOut();
  const now = performance.now();
  if (!sound || !spec || now - (recent.get(creature.id) ?? -COOLDOWN) < COOLDOWN) return;
  const place = placement(creature);
  if (!place || !allowed(now)) return;
  recent.set(creature.id, now);
  voice(sound, spec, place.pan, place.level * gain);
}

export function creatureStateSound(creature: CreatureVisual, next: number): void {
  speak(creature, stateVoice(creature.kind, next), 1);
}

const SWISH: Voice = { tones: [], hisses: [{ from: 380, to: 1500, duration: 0.32, gain: 0.03, q: 1.1 }] };

function chatterFor(creature: CreatureVisual, speed: number): Voice | null {
  if (speed > SWISH_SPEED) return SWISH;
  return SPECIES[creature.kind] ?? null;
}

export function updateCreatureChatter(): void {
  const now = performance.now();
  if (now - lastChatter < CHATTER_INTERVAL) return;
  lastChatter = now;
  const candidates = [...state.creatures.values()].filter(
    (creature) => now - (recent.get(creature.id) ?? -CHATTER_QUIET) > CHATTER_QUIET && placement(creature),
  );
  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  if (!pick || Math.random() > 0.55) return;
  const speed = Math.hypot(pick.tx - pick.x, pick.ty - pick.y) * 9;
  speak(pick, chatterFor(pick, speed), 0.7);
  for (const [id, at] of recent) if (now - at > CHATTER_QUIET * 3) recent.delete(id);
}
