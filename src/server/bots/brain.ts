import type { Cell, Player } from '../types.ts';
import { world } from '../world.ts';
import { act } from './act.ts';
import { refreshMood } from './mind.ts';
import { choosePlan } from './plans.ts';
import { look } from './senses.ts';
import { steer } from './steer.ts';

function largestCell(player: Player): Cell | undefined {
  return player.cells.reduce<Cell | undefined>(
    (best, cell) => (best && best.mass >= cell.mass ? best : cell),
    undefined,
  );
}

export function updateBot(player: Player): void {
  const mind = player.mind;
  const main = largestCell(player);
  if (!mind || !main || world.now < mind.nextThink) return;
  mind.nextThink = world.now + mind.personality.reaction * (0.7 + Math.random() * 0.6);
  refreshMood(mind, world.now);
  const view = look(player, main);
  const plan = choosePlan(player, view, mind);
  const target = steer(view, plan, mind);
  player.target.x = target.x;
  player.target.y = target.y;
  act(player, view, plan, mind);
}
