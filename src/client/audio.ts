import { clamp } from '../shared/math.ts';
import { soundButton } from './dom.ts';

export type Sfx = 'eat' | 'split' | 'spit' | 'merge' | 'death';

interface Audio {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly noiseBuffer: AudioBuffer;
  timer: number;
}

interface Envelope {
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly gain: number;
}

interface Tone extends Envelope {
  readonly type: OscillatorType;
  readonly delay?: number;
  readonly sweep?: number;
}

interface Hiss extends Envelope {
  readonly q: number;
}

const MASTER_LEVEL = 0.6;
let audio: Audio | null = null;
let muted = false;
const lastPlayed = new Map<Sfx, number>();

function oscillator(
  context: AudioContext,
  type: OscillatorType,
  frequency: number,
  destination: AudioNode,
): OscillatorNode {
  const node = context.createOscillator();
  node.type = type;
  node.frequency.value = frequency;
  node.connect(destination);
  return node;
}

function gainNode(context: AudioContext, value: number, destination: AudioNode): GainNode {
  const node = context.createGain();
  node.gain.value = value;
  node.connect(destination);
  return node;
}

function startDrone(context: AudioContext, master: GainNode): void {
  const lowpass = context.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 310;
  lowpass.Q.value = 0.8;
  lowpass.connect(master);
  const drone = gainNode(context, 0.022, lowpass);
  const wavering = oscillator(context, 'sine', 81.7, drone);
  const lfo = context.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = context.createGain();
  lfoGain.gain.value = 3.4;
  lfo.connect(lfoGain);
  lfoGain.connect(wavering.frequency);
  const voices = [oscillator(context, 'sine', 54, drone), wavering, oscillator(context, 'triangle', 108.6, drone), lfo];
  for (const voice of voices) voice.start();
}

function createNoise(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) channel[i] = (Math.random() * 2 - 1) * 0.7;
  return buffer;
}

function startWater(context: AudioContext, master: GainNode, buffer: AudioBuffer): void {
  const noise = context.createBufferSource();
  noise.buffer = buffer;
  noise.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 480;
  filter.Q.value = 0.7;
  noise.connect(filter);
  filter.connect(gainNode(context, 0.006, master));
  noise.start();
}

export function startAmbience(): void {
  if (audio || muted) return;
  try {
    const context = new AudioContext();
    const master = gainNode(context, MASTER_LEVEL, context.destination);
    startDrone(context, master);
    const noiseBuffer = createNoise(context);
    startWater(context, master, noiseBuffer);
    audio = { context, master, noiseBuffer, timer: 0 };
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    scheduleBubble();
  } catch {
    audio = null;
  }
}

function envelope(param: AudioParam, start: number, peak: number, attack: number, duration: number): void {
  param.setValueAtTime(0.0001, start);
  param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  param.exponentialRampToValueAtTime(0.0001, start + duration);
}

function tone(sound: Audio, level: number, spec: Tone): void {
  const { context } = sound;
  const start = context.currentTime + (spec.delay ?? 0);
  const node = context.createOscillator();
  const gain = context.createGain();
  node.type = spec.type;
  node.frequency.setValueAtTime(spec.from, start);
  node.frequency.exponentialRampToValueAtTime(Math.max(spec.to, 1), start + (spec.sweep ?? spec.duration));
  envelope(gain.gain, start, spec.gain * level, 0.012, spec.duration);
  node.connect(gain);
  gain.connect(sound.master);
  node.start(start);
  node.stop(start + spec.duration + 0.02);
}

function hiss(sound: Audio, level: number, spec: Hiss): void {
  const { context } = sound;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = sound.noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = spec.q;
  filter.frequency.setValueAtTime(spec.from, now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(spec.to, 40), now + spec.duration);
  const gain = context.createGain();
  envelope(gain.gain, now, spec.gain * level, 0.02, spec.duration);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sound.master);
  source.start(now);
  source.stop(now + spec.duration + 0.02);
}

const SOUNDS: Readonly<Record<Sfx, { readonly tones: readonly Tone[]; readonly hisses: readonly Hiss[] }>> = {
  eat: {
    tones: [{ type: 'sine', from: 210, to: 96, duration: 0.13, gain: 0.05 }],
    hisses: [{ from: 1400, to: 500, duration: 0.07, gain: 0.02, q: 1.6 }],
  },
  split: {
    tones: [{ type: 'sine', from: 150, to: 70, duration: 0.2, gain: 0.035 }],
    hisses: [{ from: 420, to: 2400, duration: 0.26, gain: 0.055, q: 0.9 }],
  },
  spit: {
    tones: [{ type: 'triangle', from: 420, to: 170, duration: 0.1, gain: 0.04 }],
    hisses: [{ from: 900, to: 260, duration: 0.12, gain: 0.02, q: 1.4 }],
  },
  merge: {
    tones: [
      { type: 'sine', from: 128, to: 62, duration: 0.42, gain: 0.06 },
      { type: 'sine', from: 760, to: 470, duration: 0.28, gain: 0.022, delay: 0.03 },
    ],
    hisses: [{ from: 620, to: 180, duration: 0.34, gain: 0.03, q: 0.8 }],
  },
  death: {
    tones: [{ type: 'sawtooth', from: 190, to: 46, duration: 0.85, gain: 0.06 }],
    hisses: [{ from: 500, to: 90, duration: 0.9, gain: 0.03, q: 0.7 }],
  },
};

export function playSfx(name: Sfx, volume: number): void {
  if (!audio || muted) return;
  const now = audio.context.currentTime;
  if (now - (lastPlayed.get(name) ?? 0) < 0.05) return;
  lastPlayed.set(name, now);
  const level = clamp(volume, 0, 1);
  const sound = SOUNDS[name];
  for (const spec of sound.tones) tone(audio, level, spec);
  for (const spec of sound.hisses) hiss(audio, level, spec);
}

function scheduleBubble(): void {
  if (!audio || muted) return;
  audio.timer = window.setTimeout(
    () => {
      if (!audio || muted) return;
      tone(audio, 1, {
        type: 'sine',
        from: 240 + Math.random() * 600,
        to: 120 + Math.random() * 220,
        duration: 0.24,
        sweep: 0.18,
        gain: 0.018,
      });
      scheduleBubble();
    },
    2600 + Math.random() * 5200,
  );
}

export function toggleSound(): void {
  muted = !muted;
  soundButton.setAttribute('aria-pressed', String(muted));
  soundButton.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  if (muted) {
    if (!audio) return;
    audio.master.gain.setTargetAtTime(0.0001, audio.context.currentTime, 0.15);
    clearTimeout(audio.timer);
    return;
  }
  startAmbience();
  if (!audio) return;
  audio.master.gain.setTargetAtTime(MASTER_LEVEL, audio.context.currentTime, 0.3);
  scheduleBubble();
}
