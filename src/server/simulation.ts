import { clamp, radiusFor, WORLD } from '../shared/math.ts';
import { rejoinCells } from './actions.ts';
import { updateBot } from './bots.ts';
import { resolveCells } from './collisions.ts';
import { THING_TARGET } from './config.ts';
import { updateCreatures } from './creatures.ts';
import { addFood, feedPlayers, trimEjecta, updateFoods } from './food.ts';
import { updateFlow } from './flow.ts';
import { bounceInside } from './physics.ts';
import { playerColor, spawnPlayer } from './players.ts';
import type { Cell, Player } from './types.ts';
import { allMembers, playerCenter, playerMass, thingCount, world } from './world.ts';

const BOT_MASS_CAP = 250;

function steerCell(player: Player, cell: Cell, dt: number): void {
  const dx = player.target.x - cell.x;
  const dy = player.target.y - cell.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.max(84, 306 * Math.pow(55 / Math.max(cell.mass, 1), 0.22));
  let desiredX = 0;
  let desiredY = 0;
  if (distance > cell.radius * 0.18) {
    const arrival = distance < cell.radius * 0.6 ? distance / (cell.radius * 0.6) : 1;
    desiredX = (dx / distance) * speed * arrival;
    desiredY = (dy / distance) * speed * arrival;
  }
  const blend = 1 - Math.exp(-dt * 5.4);
  cell.vx += (desiredX - cell.vx) * blend;
  cell.vy += (desiredY - cell.vy) * blend;
  cell.x += cell.vx * dt;
  cell.y += cell.vy * dt;
  if (cell.mass > 180) cell.mass *= 1 - dt * 0.0022;
  cell.radius = radiusFor(cell.mass);
  bounceInside(cell, cell.radius, WORLD - cell.radius, 0.3);
}

function respawnBotIfDue(player: Player): void {
  if (player.bot && !player.cells.length && player.respawnAt && world.now > player.respawnAt) {
    spawnPlayer(player, 52 + Math.random() * 8);
  }
}

function movePlayers(dt: number): void {
  for (const player of world.players.values()) {
    if (player.bot) updateBot(player);
    if (!player.cells.length) {
      respawnBotIfDue(player);
      continue;
    }
    for (const cell of player.cells) steerCell(player, cell, dt);
    rejoinCells(player);
  }
}

function shedBotMass(player: Player, total: number): void {
  const scale = BOT_MASS_CAP / total;
  for (const cell of player.cells) {
    cell.mass *= scale;
    cell.radius = radiusFor(cell.mass);
  }
  const center = playerCenter(player);
  const release = Math.min(10, Math.ceil((total - BOT_MASS_CAP) / 25));
  const color = playerColor(player, 0.8, 0.58);
  for (let i = 0; i < release; i += 1) {
    addFood({
      x: clamp(center.x + (Math.random() - 0.5) * 140, 40, WORLD - 40),
      y: clamp(center.y + (Math.random() - 0.5) * 140, 40, WORLD - 40),
      mass: 5,
      radius: 8,
      color,
    });
  }
}

function limitBots(dt: number): void {
  for (const player of world.players.values()) {
    if (!player.bot || !player.cells.length) continue;
    let total = playerMass(player);
    if (total > 260) {
      shedBotMass(player, total);
      total = BOT_MASS_CAP;
    }
    if (total > 220) {
      for (const cell of player.cells) cell.mass *= 1 - dt * 0.0015;
    }
  }
}

export function update(dt: number): void {
  world.now = Date.now();
  world.tick += 1;
  movePlayers(dt);
  resolveCells();
  limitBots(dt);
  updateFlow(
    dt,
    allMembers().map((member) => member.cell),
  );
  updateFoods(dt);
  updateCreatures(dt);
  if (thingCount() > THING_TARGET + 140) trimEjecta(THING_TARGET, thingCount);
  feedPlayers(world.players.values());
  for (const player of world.players.values()) respawnBotIfDue(player);
}
