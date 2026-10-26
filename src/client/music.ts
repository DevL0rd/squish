const TRACK = '/music/ambient.ogg';

export interface Music {
  readonly element: HTMLAudioElement;
  readonly gain: GainNode;
}

export function createMusic(context: AudioContext, destination: AudioNode): Music {
  const element = new Audio(TRACK);
  element.loop = true;
  element.preload = 'auto';
  const gain = context.createGain();
  gain.gain.value = 0.0001;
  context.createMediaElementSource(element).connect(gain);
  gain.connect(destination);
  return { element, gain };
}

export function setMusic(music: Music, context: AudioContext, level: number): void {
  const on = level > 0;
  music.gain.gain.setTargetAtTime(on ? level : 0.0001, context.currentTime, 0.6);
  if (on && music.element.paused) void music.element.play().catch(() => undefined);
  if (!on && !music.element.paused) {
    window.setTimeout(() => {
      if (music.gain.gain.value < 0.001) music.element.pause();
    }, 3000);
  }
}
