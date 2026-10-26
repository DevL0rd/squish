import { clamp } from '../shared/math.ts';
import { musicButton, soundButton } from './dom.ts';
import { SOUNDS, type Sfx } from './sounds.ts';
import { createMusic, setMusic, type Music } from './music.ts';
import { onSettings, settings, updateSettings, type Settings } from './ui/settings.ts';

export interface Audio {
  readonly context: AudioContext;
  readonly master: GainNode;
  readonly effects: GainNode;
  readonly ambience: GainNode;
  readonly noiseBuffer: AudioBuffer;
  readonly music: Music;
  timer: number;
}

interface Envelope {
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly gain: number;
}

export interface Tone extends Envelope {
  readonly type: OscillatorType;
  readonly delay?: number;
  readonly sweep?: number;
  readonly wobble?: readonly [number, number];
}

export interface Hiss extends Envelope {
  readonly q: number;
  readonly delay?: number;
}

const MASTER_LEVEL = 0.75;
let audio: Audio | null = null;
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
  if (audio) return;
  try {
    const context = new AudioContext();
    const master = gainNode(context, 0.0001, context.destination);
    const effects = gainNode(context, 1, master);
    const ambience = gainNode(context, 1, master);
    startDrone(context, ambience);
    const noiseBuffer = createNoise(context);
    startWater(context, ambience, noiseBuffer);
    const music = createMusic(context, master);
    audio = { context, master, effects, ambience, noiseBuffer, music, timer: 0 };
    applyLevels(settings());
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

function wobble(
  context: AudioContext,
  node: OscillatorNode,
  [rate, depth]: readonly [number, number],
  start: number,
  duration: number,
): void {
  const lfo = context.createOscillator();
  lfo.frequency.value = rate;
  const amount = context.createGain();
  amount.gain.value = depth;
  lfo.connect(amount);
  amount.connect(node.frequency);
  lfo.start(start);
  lfo.stop(start + duration + 0.02);
}

export function tone(sound: Audio, level: number, spec: Tone, bus: AudioNode = sound.effects): void {
  const { context } = sound;
  const start = context.currentTime + (spec.delay ?? 0);
  const node = context.createOscillator();
  const gain = context.createGain();
  node.type = spec.type;
  node.frequency.setValueAtTime(spec.from, start);
  node.frequency.exponentialRampToValueAtTime(Math.max(spec.to, 1), start + (spec.sweep ?? spec.duration));
  envelope(gain.gain, start, spec.gain * level, 0.012, spec.duration);
  node.connect(gain);
  gain.connect(bus);
  if (spec.wobble) wobble(context, node, spec.wobble, start, spec.duration);
  node.start(start);
  node.stop(start + spec.duration + 0.02);
}

export function hiss(sound: Audio, level: number, spec: Hiss, bus: AudioNode = sound.effects): void {
  const { context } = sound;
  const now = context.currentTime + (spec.delay ?? 0);
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
  gain.connect(bus);
  source.start(now);
  source.stop(now + spec.duration + 0.02);
}

export function soundOut(): Audio | null {
  return audio && !settings().muted ? audio : null;
}

export function playSfx(name: Sfx, volume: number): void {
  if (!audio || settings().muted) return;
  const now = audio.context.currentTime;
  if (now - (lastPlayed.get(name) ?? 0) < 0.05) return;
  lastPlayed.set(name, now);
  const level = clamp(volume, 0, 1);
  const sound = SOUNDS[name];
  for (const spec of sound.tones) tone(audio, level, spec);
  for (const spec of sound.hisses) hiss(audio, level, spec);
}

function scheduleBubble(): void {
  if (!audio) return;
  clearTimeout(audio.timer);
  audio.timer = window.setTimeout(
    () => {
      if (!audio) return;
      tone(
        audio,
        1,
        {
          type: 'sine',
          from: 240 + Math.random() * 600,
          to: 120 + Math.random() * 220,
          duration: 0.24,
          sweep: 0.18,
          gain: 0.018,
        },
        audio.ambience,
      );
      scheduleBubble();
    },
    2600 + Math.random() * 5200,
  );
}

function applyLevels(levels: Settings): void {
  soundButton.setAttribute('aria-pressed', String(levels.muted));
  soundButton.setAttribute('aria-label', levels.muted ? 'Unmute sound' : 'Mute sound');
  musicButton.setAttribute('aria-pressed', String(!levels.musicOn));
  musicButton.setAttribute('aria-label', levels.musicOn ? 'Stop music' : 'Play music');
  if (!audio) return;
  const now = audio.context.currentTime;
  audio.master.gain.setTargetAtTime(levels.muted ? 0.0001 : MASTER_LEVEL * levels.master, now, 0.2);
  audio.effects.gain.setTargetAtTime(levels.effects, now, 0.1);
  audio.ambience.gain.setTargetAtTime(levels.ambience, now, 0.3);
  setMusic(audio.music, audio.context, levels.musicOn && !levels.muted ? levels.music : 0);
  if (levels.muted) clearTimeout(audio.timer);
  else scheduleBubble();
}

export function toggleSound(): void {
  updateSettings({ muted: !settings().muted });
}

export function toggleMusic(): void {
  updateSettings({ musicOn: !settings().musicOn });
}

export function bindAudioSettings(): void {
  onSettings(applyLevels);
}
