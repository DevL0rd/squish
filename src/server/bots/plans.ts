import type { Creature, Player, Point } from '../types.ts';
import type { BotMind } from './mind.ts';
import { armored, type Rival, type View } from './senses.ts';

export type Plan =
  | { readonly kind: 'prey'; readonly rival: Rival }
  | { readonly kind: 'shoot'; readonly virus: Creature; readonly victim: Rival }
  | { readonly kind: 'virus'; readonly virus: Creature }
  | { readonly kind: 'boss'; readonly at: Point }
  | { readonly kind: 'feed'; readonly at: Point }
  | { readonly kind: 'wander' };

interface Option {
  readonly plan: Plan;
  readonly score: number;
}

const SIGHT = 1500;
const SHOT_ANGLE = 0.45;
const SHOT_RANGE = 900;

function gap(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function safe(view: View): boolean {
  return view.threats.every((threat) => threat.distance - threat.reach - view.main.radius > 400);
}

function preyOption(view: View, mind: BotMind): Option | null {
  const rival = view.prey.reduce<Rival | null>(
    (best, item) => (best && best.distance <= item.distance ? best : item),
    null,
  );
  if (!rival) return null;
  const { aggression } = mind.personality;
  const score = aggression * mind.mood * (1.2 - rival.distance / SIGHT) * (safe(view) ? 1 : 0.3);
  return { plan: { kind: 'prey', rival }, score };
}

function lined(view: View, virus: Creature, victim: Rival): boolean {
  const toVirus = Math.atan2(virus.y - view.main.y, virus.x - view.main.x);
  const toVictim = Math.atan2(victim.cell.y - virus.y, victim.cell.x - virus.x);
  const off = Math.abs(Math.atan2(Math.sin(toVictim - toVirus), Math.cos(toVictim - toVirus)));
  return off < SHOT_ANGLE && gap(virus, victim.cell) < SHOT_RANGE;
}

function shootOption(view: View, mind: BotMind): Option | null {
  if (mind.personality.trickery < 0.5) return null;
  for (const virus of view.viruses) {
    if (gap(virus, view.main) > SHOT_RANGE) continue;
    const victim = view.threats.find((threat) => lined(view, virus, threat));
    if (victim) return { plan: { kind: 'shoot', virus, victim }, score: mind.personality.trickery * 1.1 };
  }
  return null;
}

function virusOption(player: Player, view: View, mind: BotMind): Option | null {
  const { bravado } = mind.personality;
  if (bravado < 0.6 || player.cells.length > 2 || !safe(view)) return null;
  const virus = view.viruses.find((item) => view.main.radius > item.radius * 1.15);
  if (!virus) return null;
  return { plan: { kind: 'virus', virus }, score: bravado * 0.7 * (1 - gap(virus, view.main) / SIGHT) };
}

function bossOption(player: Player, view: View, mind: BotMind): Option | null {
  if (!view.boss || player.level < 3 || view.main.mass < 500) return null;
  return { plan: { kind: 'boss', at: view.boss }, score: mind.personality.bravado * mind.mood * 1.1 };
}

function feedOption(player: Player, view: View, mind: BotMind): Option | null {
  let best: Option | null = null;
  for (const creature of view.edible) {
    const value = 0.4 + (player.boost < 2 ? 0.3 : 0) + (armored(creature) ? mind.personality.caution * 0.3 : 0);
    const score = value * (1 - gap(creature, view.main) / SIGHT);
    if (!best || score > best.score) best = { plan: { kind: 'feed', at: creature }, score };
  }
  const food = view.food;
  const foodScore = food ? mind.personality.greed * 0.6 * (1 - gap(food, view.main) / 1000) : 0;
  if (food && (!best || foodScore > best.score)) best = { plan: { kind: 'feed', at: food }, score: foodScore };
  return best;
}

export function choosePlan(player: Player, view: View, mind: BotMind): Plan {
  const options = [
    preyOption(view, mind),
    shootOption(view, mind),
    virusOption(player, view, mind),
    bossOption(player, view, mind),
    feedOption(player, view, mind),
  ].filter((option): option is Option => option !== null);
  const best = options.reduce<Option>((top, option) => (option.score > top.score ? option : top), {
    plan: { kind: 'wander' },
    score: 0.1,
  });
  return best.plan;
}
