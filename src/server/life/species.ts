export const Behavior = { Drift: 0, Parasite: 2, Virus: 3, Injector: 4 } as const;

export type Brain =
  | 'bacterium'
  | 'coccus'
  | 'ciliate'
  | 'flagellate'
  | 'glider'
  | 'rotifer'
  | 'jumper'
  | 'roller'
  | 'stentor'
  | 'walker'
  | 'hunter'
  | 'drifter'
  | 'phage';

export interface Species {
  readonly name: string;
  readonly size: number;
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
  readonly speed: number;
  readonly weight: number;
  readonly behavior: number;
  readonly spread: readonly [number, number];
  readonly cap: number;
  readonly brain: Brain;
  readonly grazer: boolean;
}

interface Trait {
  readonly size: number;
  readonly hue: number;
  readonly speed: number;
  readonly weight: number;
}

const species = (name: string, brain: Brain, trait: Trait, extra: Partial<Species> = {}): Species => ({
  name,
  brain,
  grazer: true,
  ...trait,
  saturation: 0.42,
  lightness: 0.52,
  behavior: Behavior.Drift,
  spread: [0.82, 1.22],
  cap: 0,
  ...extra,
});

export const SPECIES: readonly Species[] = [
  species('paramecium', 'ciliate', { size: 18, hue: 92, speed: 40, weight: 5 }),
  species('euglena', 'flagellate', { size: 16, hue: 100, speed: 44, weight: 5 }),
  species('diatom', 'glider', { size: 14, hue: 40, speed: 14, weight: 4 }, { grazer: false }),
  species('rotifer', 'rotifer', { size: 18, hue: 30, speed: 34, weight: 3 }),
  species('bacillus', 'bacterium', { size: 8, hue: 196, speed: 38, weight: 5 }, { cap: 560 }),
  species('coccus', 'coccus', { size: 6, hue: 280, speed: 0, weight: 4 }, { cap: 560 }),
  species('halteria', 'jumper', { size: 12, hue: 70, speed: 30, weight: 3 }),
  species(
    'volvox',
    'roller',
    { size: 22, hue: 112, speed: 14, weight: 2 },
    { saturation: 0.55, lightness: 0.45, grazer: false },
  ),
  species('stentor', 'stentor', { size: 26, hue: 205, speed: 22, weight: 1.5 }, { saturation: 0.6, lightness: 0.5 }),
  species('tardigrade', 'walker', { size: 40, hue: 32, speed: 16, weight: 0.4 }, { saturation: 0.25, lightness: 0.55 }),
  species(
    'bdellovibrio',
    'hunter',
    { size: 7, hue: 2, speed: 95, weight: 1.2 },
    { behavior: Behavior.Parasite, saturation: 0.75, lightness: 0.5, grazer: false },
  ),
  species(
    'virus',
    'drifter',
    { size: 22, hue: 355, speed: 0, weight: 0 },
    { behavior: Behavior.Virus, saturation: 0.8, lightness: 0.52, spread: [1.3, 2.7], grazer: false },
  ),
  species(
    'bacteriophage',
    'phage',
    { size: 14, hue: 38, speed: 55, weight: 0.8 },
    { behavior: Behavior.Injector, saturation: 0.55, lightness: 0.55, grazer: false },
  ),
];

const TOTAL_WEIGHT = SPECIES.reduce((sum, item) => sum + item.weight, 0);

export function pickSpecies(): number {
  let roll = Math.random() * TOTAL_WEIGHT;
  for (const [index, item] of SPECIES.entries()) {
    roll -= item.weight;
    if (roll <= 0) return index;
  }
  return 0;
}

export function speciesOf(kind: number): Species {
  const found = SPECIES[kind];
  if (!found) throw new Error(`unknown species ${kind}`);
  return found;
}
