interface Personality {
  readonly style: string;
  readonly aggression: number;
  readonly caution: number;
  readonly greed: number;
  readonly trickery: number;
  readonly bravado: number;
  readonly trigger: number;
  readonly reaction: number;
  readonly jitter: number;
}

export interface BotMind {
  readonly personality: Personality;
  nextThink: number;
  wander: number;
  mood: number;
  moodUntil: number;
}

type Traits = Omit<Personality, 'style'>;

const ARCHETYPES: Readonly<Record<string, Traits>> = {
  hunter: {
    aggression: 0.9,
    caution: 0.6,
    greed: 0.5,
    trickery: 0.3,
    bravado: 0.5,
    trigger: 0.7,
    reaction: 170,
    jitter: 30,
  },
  grazer: {
    aggression: 0.25,
    caution: 0.9,
    greed: 1,
    trickery: 0.1,
    bravado: 0.2,
    trigger: 0.3,
    reaction: 300,
    jitter: 60,
  },
  coward: {
    aggression: 0.15,
    caution: 1.4,
    greed: 0.8,
    trickery: 0.2,
    bravado: 0.05,
    trigger: 0.25,
    reaction: 220,
    jitter: 50,
  },
  trickster: {
    aggression: 0.6,
    caution: 0.8,
    greed: 0.6,
    trickery: 1,
    bravado: 0.4,
    trigger: 0.6,
    reaction: 200,
    jitter: 25,
  },
  brawler: {
    aggression: 0.8,
    caution: 0.45,
    greed: 0.5,
    trickery: 0.3,
    bravado: 1,
    trigger: 0.9,
    reaction: 190,
    jitter: 40,
  },
  opportunist: {
    aggression: 0.6,
    caution: 0.9,
    greed: 0.8,
    trickery: 0.5,
    bravado: 0.3,
    trigger: 0.5,
    reaction: 240,
    jitter: 45,
  },
};

function vary(value: number, spread: number): number {
  return Math.max(0, value * (1 + (Math.random() * 2 - 1) * spread));
}

export function createMind(): BotMind {
  const styles = Object.keys(ARCHETYPES);
  const style = styles[Math.floor(Math.random() * styles.length)] ?? 'grazer';
  const base = ARCHETYPES[style] ?? ARCHETYPES['grazer'];
  const traits = Object.fromEntries(
    Object.entries(base ?? {}).map(([key, value]) => [key, vary(value, 0.25)]),
  ) as Traits;
  return {
    personality: { style, ...traits },
    nextThink: 0,
    wander: Math.random() * Math.PI * 2,
    mood: 1,
    moodUntil: 0,
  };
}

export function refreshMood(mind: BotMind, now: number): void {
  if (now < mind.moodUntil) return;
  mind.mood = 0.6 + Math.random() * 0.8;
  mind.moodUntil = now + 8000 + Math.random() * 20000;
  mind.wander += (Math.random() - 0.5) * 2;
}
