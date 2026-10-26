import { clamp, WORLD } from '../../shared/math.ts';
import type { Point } from '../types.ts';
import type { BotMind } from './mind.ts';
import type { Plan } from './plans.ts';
import type { View } from './senses.ts';

const STRIDE = 700;
const WALL = 300;

interface Pull {
  x: number;
  y: number;
}

function add(pull: Pull, from: Point, to: Point, weight: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  pull.x += (dx / length) * weight;
  pull.y += (dy / length) * weight;
}

function standoff(view: View, at: Point, radius: number): number {
  return Math.hypot(at.x - view.main.x, at.y - view.main.y) < view.main.radius + radius + 250 ? -1 : 1;
}

function goal(view: View, plan: Plan): { at: Point; weight: number } | null {
  if (plan.kind === 'prey') return { at: plan.rival.cell, weight: 1.2 };
  if (plan.kind === 'shoot') return { at: plan.virus, weight: standoff(view, plan.virus, plan.virus.radius) };
  if (plan.kind === 'virus') return { at: plan.virus, weight: 1 };
  if (plan.kind === 'boss') return { at: plan.at, weight: (view.boss?.gap ?? 0) < 380 ? -1.5 : 0.8 };
  if (plan.kind === 'feed') return { at: plan.at, weight: 1 };
  return null;
}

function threats(pull: Pull, view: View, caution: number): void {
  for (const threat of view.threats) {
    const margin = threat.distance - threat.reach - view.main.radius;
    if (margin < 700) add(pull, threat.cell, view.main, caution * 2.2 * (1 - margin / 700));
  }
}

function hazards(pull: Pull, view: View, plan: Plan, caution: number): void {
  const { main, boss, spot } = view;
  if (boss && plan.kind !== 'boss' && boss.gap < 900) {
    add(pull, boss, main, caution * 2.5 * (1 - boss.gap / 900));
  }
  if (!spot) return;
  const reach = Math.hypot(spot.x - main.x, spot.y - main.y) - spot.radius;
  if (reach < 500) add(pull, spot, main, (spot.mine ? 3 : 1.5) * (1 - reach / 500));
}

function poisons(pull: Pull, view: View, caution: number): void {
  const { main } = view;
  for (const cloud of view.clouds) {
    const inside = Math.hypot(cloud.at.x - main.x, cloud.at.y - main.y) < cloud.radius + main.radius + 250;
    if (inside) add(pull, cloud.at, main, 2);
  }
  for (const creature of view.dangers) {
    const distance = Math.hypot(creature.x - main.x, creature.y - main.y);
    if (distance < 450) add(pull, creature, main, caution * 1.2 * (1 - distance / 450));
  }
}

function viruses(pull: Pull, view: View, plan: Plan): void {
  if (plan.kind === 'virus') return;
  for (const virus of view.viruses) {
    const distance = Math.hypot(virus.x - view.main.x, virus.y - view.main.y);
    const pops = view.main.radius > virus.radius * 1.15;
    if (pops && distance < virus.radius + view.main.radius + 200) add(pull, virus, view.main, 1.6);
  }
}

function walls(pull: Pull, main: Point): void {
  if (main.x < WALL) pull.x += 1.5;
  if (main.x > WORLD - WALL) pull.x -= 1.5;
  if (main.y < WALL) pull.y += 1.5;
  if (main.y > WORLD - WALL) pull.y -= 1.5;
}

export function steer(view: View, plan: Plan, mind: BotMind): Point {
  const { main } = view;
  const pull: Pull = { x: Math.cos(mind.wander) * 0.15, y: Math.sin(mind.wander) * 0.15 };
  const target = goal(view, plan);
  if (target) add(pull, main, target.at, target.weight);
  threats(pull, view, mind.personality.caution);
  hazards(pull, view, plan, mind.personality.caution);
  poisons(pull, view, mind.personality.caution);
  viruses(pull, view, plan);
  walls(pull, main);
  const length = Math.hypot(pull.x, pull.y) || 1;
  const jitter = mind.personality.jitter;
  return {
    x: clamp(main.x + (pull.x / length) * STRIDE + (Math.random() - 0.5) * jitter, 60, WORLD - 60),
    y: clamp(main.y + (pull.y / length) * STRIDE + (Math.random() - 0.5) * jitter, 60, WORLD - 60),
  };
}
