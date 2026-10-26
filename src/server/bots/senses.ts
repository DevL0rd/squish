import { cloudZones } from '../combat/clouds.ts';
import { bossClosest } from '../hazards/events.ts';
import { spotWires } from '../hazards/pipette.ts';
import { Behavior, speciesOf } from '../life/species.ts';
import { cellsNear, foodsNear } from '../life/senses.ts';
import { affinity } from '../pigment.ts';
import type { Cell, Creature, Food, Player, Point } from '../types.ts';
import { world } from '../world.ts';

const SIGHT = 1500;
const FOOD_SIGHT = 1000;
const THREAT_RATIO = 1.24;
const PREY_RATIO = 1.3;
const SPLIT_RATIO = 2.6;
const SPLIT_REACH = 520;
const ARMORED = new Set(['diatom', 'rotifer', 'stentor', 'tardigrade']);

export interface Rival {
  readonly player: Player;
  readonly cell: Cell;
  readonly distance: number;
  readonly reach: number;
}

interface Spot extends Point {
  readonly radius: number;
  readonly mine: boolean;
}

export interface View {
  readonly main: Cell;
  readonly threats: Rival[];
  readonly prey: Rival[];
  readonly viruses: Creature[];
  readonly edible: Creature[];
  readonly dangers: Creature[];
  readonly boss: { readonly x: number; readonly y: number; readonly gap: number } | null;
  readonly spot: Spot | null;
  readonly clouds: readonly { readonly at: Point; readonly radius: number }[];
  readonly food: Food | null;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rival(player: Player, cell: Cell, main: Cell): Rival {
  const splits = cell.mass > main.mass * SPLIT_RATIO;
  return { player, cell, distance: distance(cell, main), reach: cell.radius + (splits ? SPLIT_REACH : 0) };
}

function rivals(self: Player, main: Cell): { threats: Rival[]; prey: Rival[] } {
  const threats: Rival[] = [];
  const prey: Rival[] = [];
  for (const { player, cell } of cellsNear(main.x, main.y, SIGHT)) {
    if (player === self || cell.gut >= 0 || distance(cell, main) > SIGHT) continue;
    if (cell.mass > main.mass * THREAT_RATIO) threats.push(rival(player, cell, main));
    else if (main.mass > cell.mass * PREY_RATIO) prey.push(rival(player, cell, main));
  }
  return { threats, prey };
}

function creatures(main: Cell): Pick<View, 'viruses' | 'edible' | 'dangers'> {
  const viruses: Creature[] = [];
  const edible: Creature[] = [];
  const dangers: Creature[] = [];
  for (const creature of world.creatures.values()) {
    if (distance(creature, main) > SIGHT) continue;
    const behavior = speciesOf(creature.kind).behavior;
    if (behavior === Behavior.Virus) viruses.push(creature);
    else if (behavior !== Behavior.Drift) dangers.push(creature);
    else if (main.radius > creature.radius * 1.4) edible.push(creature);
  }
  return { viruses, edible, dangers };
}

export function armored(creature: Creature): boolean {
  return ARMORED.has(speciesOf(creature.kind).name);
}

function bestFood(self: Player, main: Cell): Food | null {
  let best: Food | null = null;
  let bestScore = 0;
  for (const food of foodsNear(main.x, main.y, FOOD_SIGHT)) {
    if (food.ejecta && food.owner === self.id) continue;
    const gap = distance(food, main);
    if (gap > FOOD_SIGHT || main.radius < food.radius * 1.35) continue;
    const score = (food.mass * (1 + 2 * affinity(main.pigment, food.color))) / (gap + 80);
    if (score > bestScore) {
      bestScore = score;
      best = food;
    }
  }
  return best;
}

function spot(main: Cell): Spot | null {
  let best: Spot | null = null;
  let bestGap = Infinity;
  for (const wire of spotWires()) {
    const mine = wire.target === main.id;
    const gap = mine ? -1 : Math.hypot(wire.x - main.x, wire.y - main.y) - wire.radius;
    if (gap >= bestGap) continue;
    bestGap = gap;
    best = { x: wire.x, y: wire.y, radius: wire.radius, mine };
  }
  return best;
}

export function look(self: Player, main: Cell): View {
  return {
    main,
    ...rivals(self, main),
    ...creatures(main),
    boss: bossClosest(main),
    spot: spot(main),
    clouds: cloudZones(),
    food: bestFood(self, main),
  };
}
