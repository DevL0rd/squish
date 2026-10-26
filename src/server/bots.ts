import { clamp, WORLD } from '../shared/math.ts';
import { splitPlayer } from './actions.ts';
import type { Cell, Food, Player, Point } from './types.ts';
import { world } from './world.ts';

interface Threat {
  x: number;
  y: number;
  weight: number;
}

interface Surroundings {
  readonly threat: Threat;
  readonly prey: Cell | null;
}

function largestCell(player: Player): Cell | undefined {
  return player.cells.reduce<Cell | undefined>(
    (largest, cell) => (largest && largest.mass >= cell.mass ? largest : cell),
    undefined,
  );
}

function scan(player: Player, main: Cell): Surroundings {
  const threat: Threat = { x: 0, y: 0, weight: 0 };
  let prey: Cell | null = null;
  let preyScore = 1e9;
  for (const other of world.players.values()) {
    if (other.id === player.id) continue;
    for (const cell of other.cells) {
      const dx = cell.x - main.x;
      const dy = cell.y - main.y;
      const distance = Math.hypot(dx, dy);
      if (cell.mass > main.mass * 1.24 && distance < 980) {
        const weight = cell.mass / main.mass / Math.max(distance, 40);
        threat.x -= dx * weight;
        threat.y -= dy * weight;
        threat.weight += weight;
      } else if (main.mass > cell.mass * 1.28 && distance < 820 && distance / Math.sqrt(cell.mass) < preyScore) {
        preyScore = distance / Math.sqrt(cell.mass);
        prey = cell;
      }
    }
  }
  return { threat, prey };
}

function nearestFood(player: Player, main: Cell): Food | null {
  let best: Food | null = null;
  let bestScore = 1e9;
  for (const food of world.foods.values()) {
    if (food.ejecta && food.owner === player.id) continue;
    const dx = food.x - main.x;
    const dy = food.y - main.y;
    const distance = dx * dx + dy * dy;
    const score = distance / (food.mass + 1);
    if (distance < 950 * 950 && score < bestScore) {
      bestScore = score;
      best = food;
    }
  }
  return best;
}

function chooseTarget(player: Player, main: Cell, surroundings: Surroundings): Point {
  if (surroundings.prey) return { x: surroundings.prey.x, y: surroundings.prey.y };
  const { threat } = surroundings;
  if (threat.weight > 0) {
    const length = Math.hypot(threat.x, threat.y) || 1;
    return { x: main.x + (threat.x / length) * 760, y: main.y + (threat.y / length) * 760 };
  }
  const food = nearestFood(player, main);
  if (food) return { x: food.x, y: food.y };
  const phase = player.wanderPhase + world.now * 0.00013;
  return { x: main.x + Math.cos(phase) * 620, y: main.y + Math.sin(phase * 1.21) * 620 };
}

function avoidWalls(main: Cell, target: Point): Point {
  const margin = 240 + main.radius;
  let { x, y } = target;
  if (main.x < margin) x = main.x + 600;
  if (main.x > WORLD - margin) x = main.x - 600;
  if (main.y < margin) y = main.y + 600;
  if (main.y > WORLD - margin) y = main.y - 600;
  return { x, y };
}

export function updateBot(player: Player): void {
  const main = largestCell(player);
  if (!main) return;
  const surroundings = scan(player, main);
  const target = avoidWalls(main, chooseTarget(player, main, surroundings));
  player.target.x = clamp(target.x, 60, WORLD - 60);
  player.target.y = clamp(target.y, 60, WORLD - 60);
  const hunting = surroundings.prey && main.mass > 150 && player.cells.length < 4;
  if (hunting && Math.random() < 0.006) splitPlayer(player);
}
