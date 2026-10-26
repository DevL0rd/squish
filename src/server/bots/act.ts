import { BOMB_RANGE, DART_RANGE, pulseReach, VOLLEY_RANGE } from '../../shared/combat.ts';
import { splitPlayer } from '../actions.ts';
import { boostPlayer } from '../boost.ts';
import { attack } from '../combat/weapons.ts';
import type { Player, Point } from '../types.ts';
import type { BotMind } from './mind.ts';
import { safe, type Plan } from './plans.ts';
import type { View } from './senses.ts';

const RANGES = [600, VOLLEY_RANGE, DART_RANGE, 0, BOMB_RANGE] as const;
const SPLIT_REACH = 420;
const MAX_HUNT_CELLS = 4;

function aim(player: Player, at: Point): void {
  player.target.x = at.x;
  player.target.y = at.y;
}

function lead(cell: { x: number; y: number; vx: number; vy: number }): Point {
  return { x: cell.x + cell.vx * 0.25, y: cell.y + cell.vy * 0.25 };
}

function range(player: Player, view: View): number {
  if (player.level === 4) return pulseReach(view.main.radius);
  return (RANGES[player.level - 1] ?? 0) + view.main.radius;
}

function splitKill(player: Player, view: View, plan: Plan, mind: BotMind): boolean {
  if (plan.kind !== 'prey' || player.cells.length >= MAX_HUNT_CELLS || !safe(view)) return false;
  const { cell, distance } = plan.rival;
  if (distance - cell.radius > view.main.radius + SPLIT_REACH) return false;
  if (view.main.mass * 0.5 < cell.mass * 1.35 || Math.random() > mind.personality.aggression * 0.35) return false;
  aim(player, lead(cell));
  splitPlayer(player);
  return true;
}

function escape(player: Player, view: View): boolean {
  const close = view.threats.some((threat) => threat.distance - threat.reach - view.main.radius < 150);
  if (!close || player.boost < 1 || Math.random() > 0.6) return false;
  boostPlayer(player);
  return true;
}

function fireTarget(player: Player, view: View, plan: Plan, mind: BotMind): Point | null {
  if (plan.kind === 'shoot') return plan.virus;
  if (player.level < 2) return null;
  const reach = range(player, view);
  if (plan.kind === 'boss' && view.boss && view.boss.gap < reach) return view.boss;
  const enemies = [...view.prey, ...view.threats].filter((rival) => rival.distance < reach);
  const pick = enemies.find((rival) => rival.cell.mass < view.main.mass * (1 + mind.personality.bravado));
  return pick ? lead(pick.cell) : null;
}

function shoot(player: Player, view: View, plan: Plan, mind: BotMind): void {
  const at = fireTarget(player, view, plan, mind);
  if (!at || Math.random() > mind.personality.trigger * 0.45) return;
  aim(player, at);
  attack(player);
}

export function act(player: Player, view: View, plan: Plan, mind: BotMind): void {
  if (player.cells.some((cell) => cell.gut >= 0)) {
    splitPlayer(player);
    return;
  }
  if (escape(player, view) || splitKill(player, view, plan, mind)) return;
  shoot(player, view, plan, mind);
}
