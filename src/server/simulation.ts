import { clamp, digestionRate, radiusFor, WORLD, digestSpeed } from '../shared/math.ts';
import { rejoinCells } from './actions.ts';
import { updateBot } from './bots/brain.ts';
import { resolveCells } from './collisions.ts';
import { THING_TARGET } from './config.ts';
import { updateCreatures } from './life/creatures.ts';
import { addFood, feedPlayers, trimEjecta, updateFoods } from './food.ts';
import { hazardSlowdown, updateHazards } from './hazards/events.ts';
import { applyInfections, speedFactor } from './infection.ts';
import { updateProgress } from './progress.ts';
import { updateCombat } from './combat/clouds.ts';
import { updateFlow } from './flow.ts';
import { collideBody, updateObstacles } from './obstacles.ts';
import { bounceInside } from './physics.ts';
import { playerColor, spawnPlayer } from './players.ts';
import type { Cell, Player } from './types.ts';
import { allMembers, playerCenter, playerMass, thingCount, world } from './world.ts';

const BOT_MASS_CAP = 250;
const LAUNCH_DRAG = 2.4;
const BASE_SPEED = 540;
const DIGEST_TIME = 10;
const SOFT_CORE = 0.3;
const MASS_SLOWDOWN = 0.3;
const MASS_SLOWDOWN_AT = 10000;

function steerCell(player: Player, cell: Cell, dt: number): void {
  if (cell.gut >= 0) return;
  if (world.now < cell.heldUntil) {
    cell.vx = 0;
    cell.vy = 0;
    return;
  }
  const dx = player.target.x - cell.x;
  const dy = player.target.y - cell.y;
  const distance = Math.hypot(dx, dy);
  cell.digesting *= Math.exp((-dt * digestionRate(cell.radius)) / DIGEST_TIME);
  const heft = 1 - MASS_SLOWDOWN * Math.min(1, cell.mass / MASS_SLOWDOWN_AT);
  const speed = BASE_SPEED * digestSpeed(cell.digesting, cell.mass) * heft * speedFactor(player) * hazardSlowdown(cell);
  let desiredX = 0;
  let desiredY = 0;
  if (distance > cell.radius * 0.18) {
    const arrival = distance < cell.radius * 0.6 ? distance / (cell.radius * 0.6) : 1;
    desiredX = (dx / distance) * speed * arrival;
    desiredY = (dy / distance) * speed * arrival;
  }
  const blend = 1 - Math.exp(-dt * 5.4);
  const steerX = cell.vx - cell.boostX;
  const steerY = cell.vy - cell.boostY;
  const glide = Math.exp(-dt * LAUNCH_DRAG);
  cell.boostX *= glide;
  cell.boostY *= glide;
  cell.vx = steerX + (desiredX - steerX) * blend + cell.boostX;
  cell.vy = steerY + (desiredY - steerY) * blend + cell.boostY;
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
    applyInfections(player, dt);
    updateProgress(player, dt);
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
      mass: 8 ** 2 / 27.04,
      radius: 8,
      variety: 0,
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

function* allCells(): Generator<Cell> {
  for (const player of world.players.values()) yield* player.cells;
}

function collideAll(): void {
  for (const member of allMembers()) collideBody(member.cell, member.cell.radius * SOFT_CORE);
  for (const food of world.foods.values()) if ((food.id + world.tick) % 2 === 0) collideBody(food);
  for (const creature of world.creatures.values()) collideBody(creature);
}

export function update(dt: number): void {
  world.now = Date.now();
  world.tick += 1;
  movePlayers(dt);
  resolveCells();
  limitBots(dt);
  updateFlow(dt, allCells());
  updateFoods(dt);
  updateCreatures(dt);
  updateObstacles(dt);
  updateHazards(dt);
  updateCombat(dt);
  collideAll();
  if (thingCount() > THING_TARGET + 140) trimEjecta(THING_TARGET, thingCount);
  feedPlayers(world.players.values());
  for (const player of world.players.values()) respawnBotIfDue(player);
}
