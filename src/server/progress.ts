import { EventKind } from '../shared/protocol.ts';
import { sendJson } from './transport.ts';
import type { Cell, Player } from './types.ts';
import { biggestCell, emit, ownerOf, toBytes } from './world.ts';
import { hslToRgb } from '../shared/math.ts';

const LEVEL_MASS = [0, 2500, 5000, 7500, 10000] as const;
const MAX_DEFENSE = 0.6;
const DEFENSE_HALF_LIFE = 240;
const ARMOR: Readonly<Record<string, number>> = {
  diatom: 0.06,
  rotifer: 0.08,
  stentor: 0.1,
  tardigrade: 0.22,
};
const DNA_COLOR = toBytes(hslToRgb(186, 0.9, 0.62));

export function tellProgress(player: Player): void {
  if (player.ws) sendJson(player.ws, { t: 'progress', level: player.level, defense: player.defense });
}

function levelUp(player: Player): void {
  player.level += 1;
  tellProgress(player);
  const cell = biggestCell(player);
  if (!cell) return;
  emit({
    kind: EventKind.LevelUp,
    cellId: cell.id,
    predatorId: player.id,
    x: cell.x,
    y: cell.y,
    color: DNA_COLOR,
    amount: player.level,
  });
}

export function armorFrom(cell: Cell, speciesName: string): void {
  const gain = ARMOR[speciesName];
  const player = gain ? ownerOf(cell) : undefined;
  if (!player || !gain) return;
  player.defense = Math.min(MAX_DEFENSE, player.defense + gain);
  tellProgress(player);
}

export function updateProgress(player: Player, dt: number): void {
  const mass = player.cells.reduce((sum, cell) => sum + cell.mass, 0);
  const next = LEVEL_MASS[player.level];
  if (next !== undefined && mass >= next) levelUp(player);
  if (player.defense <= 0) return;
  const before = player.defense;
  player.defense *= Math.pow(0.5, dt / DEFENSE_HALF_LIFE);
  if (player.defense < 0.005) player.defense = 0;
  if (Math.floor(before * 100) !== Math.floor(player.defense * 100)) tellProgress(player);
}
