import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT || 5173);
const WORLD = 4096;
const SLOTS = 12;
const FOOD_TARGET = 720;
const THING_TARGET = 760;
const MAX_CELLS = 8;
const TICK = 1 / 30;
const SNAPSHOT_EVERY = 2;
const FOOD_EVERY = 6;
const FLOW_N = 64;
const FLOW_CELL = WORLD / FLOW_N;

const HUE_MIN = 0;
const HUE_MAX = 359;

const BOT_NAMES = [
  'B. subtilis', 'S. aureus', 'P. aeruginosa', 'E. coli',
  'V. cholerae', 'S. cerevisiae', 'A. niger', 'T. thermophilus',
  'M. luteus', 'L. lactis', 'C. glutamicum', 'R. rubrum',
  'N. oceanica', 'D. radiodurans', 'H. salinarum', 'C. crescentus'
];

const FOOD_HUES = [154, 172, 190, 302, 326, 44, 92, 264, 12];

let nextPlayerId = 1;
let nextCellId = 1;
let nextFoodId = 1;
let tick = 0;
let now = Date.now();

const CREATURE_KINDS = [
  { name: 'paramecium', size: 9, hue: 92, speed: 34 },
  { name: 'euglena', size: 8, hue: 88, speed: 42 },
  { name: 'diatom', size: 7, hue: 44, speed: 18 },
  { name: 'rotifer', size: 9, hue: 26, speed: 28 },
  { name: 'bacillus', size: 4, hue: 196, speed: 30 },
  { name: 'coccus', size: 3, hue: 280, speed: 12 }
];
const CREATURE_TARGET = 34;

const clients = new Set();
const players = new Map();
const foods = new Map();
const creatures = new Map();
let nextCreatureId = 1;
const events = [];
let flowU = new Float32Array(FLOW_N * FLOW_N);
let flowV = new Float32Array(FLOW_N * FLOW_N);
let flowU2 = new Float32Array(FLOW_N * FLOW_N);
let flowV2 = new Float32Array(FLOW_N * FLOW_N);
let flowPressure = new Float32Array(FLOW_N * FLOW_N);
let flowPressure2 = new Float32Array(FLOW_N * FLOW_N);
const flowDivergence = new Float32Array(FLOW_N * FLOW_N);
let flowTime = 0;

function clamp(value, low, high) {
  return value < low ? low : value > high ? high : value;
}

function hslToRgb(hue, saturation, lightness) {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = clamp(saturation, 0, 1);
  const l = clamp(lightness, 0, 1);
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToRgb = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [
    Math.round(hueToRgb(h + 1 / 3) * 255),
    Math.round(hueToRgb(h) * 255),
    Math.round(hueToRgb(h - 1 / 3) * 255)
  ];
}

function worldHueAt(x, y) {
  const nx = x / WORLD;
  const ny = y / WORLD;
  const hue = 168
    + 82 * Math.sin(nx * 5.3 + 0.6)
    + 46 * Math.sin(ny * 4.1 - 0.35)
    + 24 * Math.sin((nx + ny) * 8.2 + 1.1)
    + 16 * Math.cos((nx - ny) * 10.4);
  return ((hue % 360) + 360) % 360;
}

function radiusFor(mass) {
  return 5.2 * Math.sqrt(Math.max(mass, 1));
}

function speedFor(mass) {
  return Math.max(84, 306 * Math.pow(55 / Math.max(mass, 1), 0.22));
}

function randomWorld(margin) {
  return margin + Math.random() * (WORLD - margin * 2);
}

function randomName() {
  return BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
}

function playerCenter(player) {
  if (!player.cells.length) return { x: WORLD / 2, y: WORLD / 2 };
  let x = 0;
  let y = 0;
  let total = 0;
  for (const cell of player.cells) {
    x += cell.x * cell.mass;
    y += cell.y * cell.mass;
    total += cell.mass;
  }
  return { x: x / total, y: y / total };
}

function playerMass(player) {
  let total = 0;
  for (const cell of player.cells) total += cell.mass;
  return total;
}

function makeCell(x, y, mass, vx = 0, vy = 0, mergeAt = 0) {
  return {
    id: nextCellId++,
    x,
    y,
    vx,
    vy,
    mass,
    radius: radiusFor(mass),
    mergeAt
  };
}

function addFood(options = {}) {
  const x = options.x ?? randomWorld(40);
  const y = options.y ?? randomWorld(40);
  const hue = options.hue ?? worldHueAt(x, y);
  const food = {
    id: nextFoodId++,
    x,
    y,
    vx: options.vx ?? 0,
    vy: options.vy ?? 0,
    mass: options.mass ?? 1.5,
    radius: options.radius ?? (4 + Math.random() * 2.5),
    hue,
    color: options.color ?? null,
    ejecta: Boolean(options.ejecta),
    owner: options.owner ?? 0,
    born: now
  };
  if (!food.color) food.color = hslToRgb(food.hue, 0.92, food.ejecta ? 0.66 : 0.55);
  foods.set(food.id, food);
  return food;
}

function addCreature(options = {}) {
  const kind = options.kind ?? Math.floor(Math.random() * CREATURE_KINDS.length);
  const meta = CREATURE_KINDS[kind];
  const x = options.x ?? randomWorld(180);
  const y = options.y ?? randomWorld(180);
  const creature = {
    id: nextCreatureId++,
    kind,
    x,
    y,
    vx: (Math.random() - 0.5) * meta.speed,
    vy: (Math.random() - 0.5) * meta.speed,
    radius: meta.size * (0.82 + Math.random() * 0.4),
    angle: Math.random() * Math.PI * 2,
    phase: Math.random() * Math.PI * 2,
    energy: 0.4 + Math.random() * 0.6,
    color: hslToRgb(meta.hue + (Math.random() * 16 - 8), 0.42, 0.52)
  };
  creatures.set(creature.id, creature);
  return creature;
}

function thingCount() {
  return foods.size + creatures.size;
}

function seedCreatures() {
  for (let i = 0; i < CREATURE_TARGET && thingCount() < THING_TARGET; i += 1) addCreature();
}

function updateCreatures(dt) {
  for (const creature of creatures.values()) {
    const gx = clamp(creature.x / FLOW_CELL, 0, FLOW_N - 1.001);
    const gy = clamp(creature.y / FLOW_CELL, 0, FLOW_N - 1.001);
    const fieldX = sampleField(flowU, gx, gy);
    const fieldY = sampleField(flowV, gx, gy);
    creature.phase += dt * (1.6 + creature.energy);
    creature.vx += (fieldX * 1.6 + Math.cos(creature.phase * 0.7) * 12) * dt;
    creature.vy += (fieldY * 1.6 + Math.sin(creature.phase * 0.55) * 12) * dt;
    const drag = Math.exp(-dt * 0.9);
    creature.vx *= drag;
    creature.vy *= drag;
    const speed = Math.hypot(creature.vx, creature.vy);
    const maxSpeed = CREATURE_KINDS[creature.kind].speed;
    if (speed > maxSpeed) {
      creature.vx = (creature.vx / speed) * maxSpeed;
      creature.vy = (creature.vy / speed) * maxSpeed;
    }
    creature.x += creature.vx * dt;
    creature.y += creature.vy * dt;
    creature.angle = Math.atan2(creature.vy, creature.vx);
    const margin = 60;
    if (creature.x < margin || creature.x > WORLD - margin) creature.vx *= -0.8;
    if (creature.y < margin || creature.y > WORLD - margin) creature.vy *= -0.8;
    creature.x = clamp(creature.x, margin, WORLD - margin);
    creature.y = clamp(creature.y, margin, WORLD - margin);

    const reach = creature.radius + 16;
    for (const food of foods.values()) {
      const dx = food.x - creature.x;
      const dy = food.y - creature.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      foods.delete(food.id);
      creature.energy = Math.min(1.6, creature.energy + 0.12);
      creature.radius = Math.min(CREATURE_KINDS[creature.kind].size * 1.5, creature.radius + 0.35);
      creature.color = [
        creature.color[0] * 0.86 + food.color[0] * 0.14,
        creature.color[1] * 0.86 + food.color[1] * 0.14,
        creature.color[2] * 0.86 + food.color[2] * 0.14
      ];
      break;
    }

    for (const player of players.values()) {
      if (!player.cells.length) continue;
      let eatenBy = null;
      for (const cell of player.cells) {
        if (cell.radius < creature.radius * 1.08) continue;
        const dx = creature.x - cell.x;
        const dy = creature.y - cell.y;
        const limit = cell.radius * 0.96;
        if (dx * dx + dy * dy < limit * limit) {
          eatenBy = cell;
          break;
        }
      }
      if (!eatenBy) continue;
      events.push({
        kind: 6 + creature.kind,
        cellId: eatenBy.id,
        predatorId: eatenBy.id,
        x: creature.x,
        y: creature.y,
        color: creature.color
      });
      creatures.delete(creature.id);
      if (thingCount() < THING_TARGET) addCreature();
      break;
    }
  }
  while (creatures.size < CREATURE_TARGET && thingCount() < THING_TARGET) addCreature();
}

function creatureBuffer(client) {
  let center = { x: WORLD / 2, y: WORLD / 2 };
  if (client.player && client.player.cells.length) center = playerCenter(client.player);
  else if (client.view) center = client.view;
  const limit = 2200;
  const visible = [];
  for (const creature of creatures.values()) {
    const dx = creature.x - center.x;
    const dy = creature.y - center.y;
    if (dx * dx + dy * dy < limit * limit) visible.push(creature);
  }
  const size = 1 + 2 + 2 + visible.length * 13;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, 3); offset += 1;
  view.setUint16(offset, tick & 0xffff, true); offset += 2;
  view.setUint16(offset, visible.length, true); offset += 2;
  for (const creature of visible) {
    view.setUint16(offset, creature.id, true); offset += 2;
    view.setUint16(offset, clamp(Math.round(creature.x), 0, 65535), true); offset += 2;
    view.setUint16(offset, clamp(Math.round(creature.y), 0, 65535), true); offset += 2;
    view.setUint8(offset, clamp(Math.round(creature.radius), 1, 255)); offset += 1;
    view.setUint8(offset, creature.kind); offset += 1;
    view.setUint8(offset, clamp(Math.round(((creature.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI * 2) * 255), 0, 255)); offset += 1;
    view.setUint8(offset, creature.color[0]); offset += 1;
    view.setUint8(offset, creature.color[1]); offset += 1;
    view.setUint8(offset, creature.color[2]); offset += 1;
    view.setUint8(offset, clamp(Math.round(creature.phase * 24) & 255, 0, 255)); offset += 1;
  }
  return new Uint8Array(buffer);
}

function seedFood() {
  for (let i = 0; i < FOOD_TARGET; i += 1) addFood();
}

function spawnPoint(minDistance) {
  let best = { x: randomWorld(220), y: randomWorld(220) };
  let bestScore = -1;
  for (let attempt = 0; attempt < 28; attempt += 1) {
    const x = randomWorld(260);
    const y = randomWorld(260);
    let score = 1e9;
    for (const player of players.values()) {
      for (const cell of player.cells) {
        const distance = Math.hypot(cell.x - x, cell.y - y) - cell.radius;
        if (distance < score) score = distance;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
      if (score > minDistance) break;
    }
  }
  return best;
}

function spawnPlayer(player, mass = 55) {
  const point = spawnPoint(700);
  player.cells = [makeCell(point.x, point.y, mass)];
  player.target.x = point.x;
  player.target.y = point.y;
  player.alive = true;
  player.graceUntil = now + (player.bot ? 2600 : 9000);
  player.respawnAt = 0;
}

function hueOf(player) {
  return player.hue >= 0 ? player.hue : 198;
}

function createPlayer(options) {
  const hue = options.hue === -1 ? -1 : clamp(Math.round(options.hue ?? Math.random() * 360), HUE_MIN, HUE_MAX);
  const player = {
    id: nextPlayerId++,
    name: options.name || randomName(),
    hue,
    color: hslToRgb(hue, 0.86, 0.62),
    bot: Boolean(options.bot),
    ws: options.ws || null,
    cells: [],
    target: { x: WORLD / 2, y: WORLD / 2 },
    alive: false,
    graceUntil: 0,
    respawnAt: 0,
    lastSplit: 0,
    lastEject: 0,
    wanderPhase: Math.random() * Math.PI * 2,
  };
  players.set(player.id, player);
  spawnPlayer(player);
  return player;
}

function createBot() {
  const used = new Set([...players.values()].filter((p) => p.bot).map((p) => p.name));
  const available = BOT_NAMES.filter((name) => !used.has(name));
  const name = available.length ? available[Math.floor(Math.random() * available.length)] : randomName();
  return createPlayer({ bot: true, name, hue: -1 });
}

function humanCount() {
  let count = 0;
  for (const player of players.values()) if (!player.bot) count += 1;
  return count;
}

function botCount() {
  let count = 0;
  for (const player of players.values()) if (player.bot) count += 1;
  return count;
}

function ensurePopulation() {
  const humans = humanCount();
  let desired = Math.max(0, SLOTS - humans);
  let bots = [...players.values()].filter((player) => player.bot);
  while (bots.length < desired) {
    bots.push(createBot());
  }
  while (bots.length > desired) {
    const bot = bots.pop();
    players.delete(bot.id);
    if (bot.ws) closeSocket(bot.ws);
  }
  broadcastRoster();
}

function removePlayer(player) {
  players.delete(player.id);
  ensurePopulation();
}

function broadcastRoster() {
  const roster = [...players.values()].map((player) => ({
    id: player.id,
    name: player.name,
    hue: player.hue,
    bot: player.bot,
    alive: player.alive
  }));
  for (const client of clients) sendJSON(client, { t: 'roster', players: roster });
}

function closeSocket(socket) {
  try {
    socket.end();
  } catch {
  }
}

function eatFood(player, cell, food) {
  foods.delete(food.id);
  cell.mass += (food.radius * food.radius) / 27.04;
  cell.radius = radiusFor(cell.mass);
  events.push({
    kind: 1,
    cellId: cell.id,
    predatorId: cell.id,
    x: food.x,
    y: food.y,
    color: food.color
  });
  if (food.ejecta) {
    addFood();
  } else {
    addFood();
  }
}

function markPlayerDead(player, killer) {
  player.alive = false;
  if (player.bot) {
    player.respawnAt = now + 1800 + Math.random() * 1400;
  } else {
    player.respawnAt = now + 100000;
    sendJSON({ ws: player.ws }, {
      t: 'dead',
      by: killer || player.lastKiller || 'the culture'
    });
  }
}


function mergeCellPair(a, b) {
  if (!a.player.cells.includes(a.cell) || !b.player.cells.includes(b.cell)) return false;
  const survivor = a.cell.mass >= b.cell.mass ? a : b;
  const absorbed = survivor === a ? b : a;
  const total = survivor.cell.mass + absorbed.cell.mass;
  const contactX = (survivor.cell.x * survivor.cell.mass + absorbed.cell.x * absorbed.cell.mass) / total;
  const contactY = (survivor.cell.y * survivor.cell.mass + absorbed.cell.y * absorbed.cell.mass) / total;
  survivor.cell.x = contactX;
  survivor.cell.y = contactY;
  survivor.cell.vx = (survivor.cell.vx * survivor.cell.mass + absorbed.cell.vx * absorbed.cell.mass) / total;
  survivor.cell.vy = (survivor.cell.vy * survivor.cell.mass + absorbed.cell.vy * absorbed.cell.mass) / total;
  survivor.cell.mass = total;
  survivor.cell.radius = radiusFor(total);
  survivor.cell.mergeAt = Math.max(survivor.cell.mergeAt, now + 900);
  const index = absorbed.player.cells.indexOf(absorbed.cell);
  if (index >= 0) absorbed.player.cells.splice(index, 1);
  events.push({
    kind: 4,
    cellId: absorbed.cell.id,
    predatorId: survivor.cell.id,
    x: contactX,
    y: contactY,
    color: hslToRgb(hueOf(absorbed.player), 0.82, 0.58)
  });
  if (absorbed.player.id !== survivor.player.id) {
    absorbed.player.lastKiller = survivor.player.name;
    if (!absorbed.player.cells.length) markPlayerDead(absorbed.player, survivor.player.name);
  }
  return true;
}

function splitPlayer(player) {
  if (now - player.lastSplit < 260) return;
  if (player.cells.length >= MAX_CELLS) return;
  player.lastSplit = now;
  const source = [...player.cells];
  for (const cell of source) {
    if (player.cells.length >= MAX_CELLS) break;
    if (cell.mass < 44) continue;
    let dx = player.target.x - cell.x;
    let dy = player.target.y - cell.y;
    if (Math.hypot(dx, dy) < 8) {
      dx = Math.cos(player.wanderPhase);
      dy = Math.sin(player.wanderPhase);
    }
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const half = cell.mass * 0.5;
    cell.mass = half;
    cell.radius = radiusFor(half);
    cell.mergeAt = now + 10500;
    const child = makeCell(
      cell.x + dx * cell.radius * 0.7,
      cell.y + dy * cell.radius * 0.7,
      half,
      cell.vx + dx * 560,
      cell.vy + dy * 560,
      now + 10500
    );
    player.cells.push(child);
    events.push({ kind: 3, cellId: cell.id, predatorId: child.id, x: child.x, y: child.y, color: hslToRgb(hueOf(player), 0.86, 0.62) });
  }
}

function ejectMass(player) {
  if (now - player.lastEject < 240) return;
  player.lastEject = now;
  for (const cell of player.cells) {
    if (cell.mass < 50) continue;
    cell.mass -= 17;
    cell.radius = radiusFor(cell.mass);
    let dx = player.target.x - cell.x;
    let dy = player.target.y - cell.y;
    const length = Math.hypot(dx, dy) || 1;
    dx /= length;
    dy /= length;
    const spawnX = cell.x + dx * (cell.radius + 8);
    const spawnY = cell.y + dy * (cell.radius + 8);
    addFood({
      x: spawnX,
      y: spawnY,
      vx: dx * 620,
      vy: dy * 620,
      mass: 14,
      radius: 15,
      hue: player.hue,
      color: hslToRgb(hueOf(player), 0.92, 0.66),
      ejecta: true,
      owner: player.id
    });
    events.push({
      kind: 5,
      cellId: cell.id,
      predatorId: 0,
      x: spawnX,
      y: spawnY,
      color: hslToRgb(hueOf(player), 0.92, 0.66)
    });
  }
}

function mergeCells(player) {
  const cells = player.cells;
  for (let i = 0; i < cells.length; i += 1) {
    const a = cells[i];
    if (!a) continue;
    for (let j = i + 1; j < cells.length; j += 1) {
      const b = cells[j];
      if (!b || now < a.mergeAt || now < b.mergeAt) continue;
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (distance > a.radius + b.radius + 8) continue;
      const total = a.mass + b.mass;
      a.x = (a.x * a.mass + b.x * b.mass) / total;
      a.y = (a.y * a.mass + b.y * b.mass) / total;
      a.vx = (a.vx * a.mass + b.vx * b.mass) / total;
      a.vy = (a.vy * a.mass + b.vy * b.mass) / total;
      a.mass = total;
      a.radius = radiusFor(total);
      events.push({
        kind: 4,
        cellId: b.id,
        predatorId: a.id,
        x: a.x,
        y: a.y,
        color: hslToRgb(hueOf(player), 0.82, 0.58)
      });
      cells.splice(j, 1);
      j -= 1;
    }
  }
}

function sampleField(field, x, y) {
  const cx = clamp(x, 0, FLOW_N - 1.001);
  const cy = clamp(y, 0, FLOW_N - 1.001);
  const x0 = cx | 0;
  const y0 = cy | 0;
  const fx = cx - x0;
  const fy = cy - y0;
  const i00 = y0 * FLOW_N + x0;
  const top = field[i00] * (1 - fx) + field[i00 + 1] * fx;
  const bottom = field[i00 + FLOW_N] * (1 - fx) + field[i00 + FLOW_N + 1] * fx;
  return top * (1 - fy) + bottom * fy;
}

function updateFlow(dt) {
  flowTime += dt;
  for (const player of players.values()) {
    for (const cell of player.cells) {
      const gx = cell.x / FLOW_CELL;
      const gy = cell.y / FLOW_CELL;
      const radius = Math.max(2.2, cell.radius / FLOW_CELL * 1.8);
      const lowX = Math.max(1, Math.floor(gx - radius));
      const highX = Math.min(FLOW_N - 2, Math.ceil(gx + radius));
      const lowY = Math.max(1, Math.floor(gy - radius));
      const highY = Math.min(FLOW_N - 2, Math.ceil(gy + radius));
      for (let j = lowY; j <= highY; j += 1) {
        const dy = (j - gy) / radius;
        for (let i = lowX; i <= highX; i += 1) {
          const dx = (i - gx) / radius;
          const falloff = Math.exp(-(dx * dx + dy * dy) * 2.4);
          const index = j * FLOW_N + i;
          flowU[index] += cell.vx * 0.006 * falloff;
          flowV[index] += cell.vy * 0.006 * falloff;
        }
      }
    }
  }
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    const y = j / FLOW_N * Math.PI * 2;
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const x = i / FLOW_N * Math.PI * 2;
      const index = j * FLOW_N + i;
      flowU[index] += Math.sin(y * 1.7 + flowTime * 0.18) * 0.32 + Math.cos(x * 2.3 - flowTime * 0.11) * 0.22;
      flowV[index] += Math.cos(x * 1.9 - flowTime * 0.15) * 0.3 + Math.sin(y * 2.1 + flowTime * 0.09) * 0.2;
    }
  }
  for (let j = 0; j < FLOW_N; j += 1) {
    for (let i = 0; i < FLOW_N; i += 1) {
      const index = j * FLOW_N + i;
      const gx = i - flowU[index] * dt / FLOW_CELL;
      const gy = j - flowV[index] * dt / FLOW_CELL;
      flowU2[index] = sampleField(flowU, gx, gy) * 0.992;
      flowV2[index] = sampleField(flowV, gx, gy) * 0.992;
    }
  }
  let swap = flowU; flowU = flowU2; flowU2 = swap;
  swap = flowV; flowV = flowV2; flowV2 = swap;
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      flowDivergence[index] = -0.5 * (flowU[index + 1] - flowU[index - 1] + flowV[index + FLOW_N] - flowV[index - FLOW_N]);
      flowPressure[index] = 0;
    }
  }
  for (let iteration = 0; iteration < 6; iteration += 1) {
    for (let j = 1; j < FLOW_N - 1; j += 1) {
      for (let i = 1; i < FLOW_N - 1; i += 1) {
        const index = j * FLOW_N + i;
        flowPressure2[index] = (flowDivergence[index] + flowPressure[index - 1] + flowPressure[index + 1] + flowPressure[index - FLOW_N] + flowPressure[index + FLOW_N]) * 0.25;
      }
    }
    const temp = flowPressure;
    flowPressure = flowPressure2;
    flowPressure2 = temp;
  }
  for (let j = 1; j < FLOW_N - 1; j += 1) {
    for (let i = 1; i < FLOW_N - 1; i += 1) {
      const index = j * FLOW_N + i;
      flowU[index] -= 0.5 * (flowPressure[index + 1] - flowPressure[index - 1]);
      flowV[index] -= 0.5 * (flowPressure[index + FLOW_N] - flowPressure[index - FLOW_N]);
    }
  }
}

function applyFoodCohesion() {
  const buckets = new Map();
  for (const food of foods.values()) {
    const bx = Math.floor(food.x / 48);
    const by = Math.floor(food.y / 48);
    const key = by * 128 + bx;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(food);
  }
  for (const food of foods.values()) {
    const bx = Math.floor(food.x / 48);
    const by = Math.floor(food.y / 48);
    for (let oy = -1; oy <= 1; oy += 1) {
      for (let ox = -1; ox <= 1; ox += 1) {
        const bucket = buckets.get((by + oy) * 128 + (bx + ox));
        if (!bucket) continue;
        for (const other of bucket) {
          if (other.id <= food.id) continue;
          const dx = other.x - food.x;
          const dy = other.y - food.y;
          const distance = Math.hypot(dx, dy);
          if (distance <= 0.001 || distance > 34) continue;
          const force = (1 - distance / 34) * 0.055;
          food.vx += (dx / distance) * force;
          food.vy += (dy / distance) * force;
          other.vx -= (dx / distance) * force;
          other.vy -= (dy / distance) * force;
        }
      }
    }
  }
}

function updateBot(player, dt) {
  if (!player.cells.length) return;
  const main = player.cells.reduce((largest, cell) => cell.mass > largest.mass ? cell : largest, player.cells[0]);
  let threatX = 0;
  let threatY = 0;
  let threatWeight = 0;
  let prey = null;
  let preyScore = 1e9;
  for (const other of players.values()) {
    if (other.id === player.id) continue;
    for (const cell of other.cells) {
      const dx = cell.x - main.x;
      const dy = cell.y - main.y;
      const distance = Math.hypot(dx, dy);
      if (cell.mass > main.mass * 1.24 && distance < 980) {
        const weight = (cell.mass / main.mass) / Math.max(distance, 40);
        threatX -= dx * weight;
        threatY -= dy * weight;
        threatWeight += weight;
      } else if (main.mass > cell.mass * 1.28 && distance < 820) {
        const score = distance / Math.sqrt(cell.mass);
        if (score < preyScore) {
          preyScore = score;
          prey = cell;
        }
      }
    }
  }
  const phase = player.wanderPhase + now * 0.00013;
  let targetX = main.x + Math.cos(phase) * 620;
  let targetY = main.y + Math.sin(phase * 1.21) * 620;
  if (prey) {
    targetX = prey.x;
    targetY = prey.y;
  } else if (threatWeight > 0) {
    const length = Math.hypot(threatX, threatY) || 1;
    targetX = main.x + (threatX / length) * 760;
    targetY = main.y + (threatY / length) * 760;
  } else {
    let bestFood = null;
    let bestScore = 1e9;
    for (const food of foods.values()) {
      if (food.ejecta && food.owner === player.id) continue;
      const dx = food.x - main.x;
      const dy = food.y - main.y;
      const distance = dx * dx + dy * dy;
      if (distance < 950 * 950) {
        const score = distance / (food.mass + 1);
        if (score < bestScore) {
          bestScore = score;
          bestFood = food;
        }
      }
    }
    if (bestFood) {
      targetX = bestFood.x;
      targetY = bestFood.y;
    }
  }
  const margin = 240 + main.radius;
  if (main.x < margin) targetX = main.x + 600;
  if (main.x > WORLD - margin) targetX = main.x - 600;
  if (main.y < margin) targetY = main.y + 600;
  if (main.y > WORLD - margin) targetY = main.y - 600;
  player.target.x = clamp(targetX, 60, WORLD - 60);
  player.target.y = clamp(targetY, 60, WORLD - 60);
  if (prey && main.mass > 150 && player.cells.length < 4 && Math.random() < 0.006) splitPlayer(player);
}

function updatePlayer(player, dt) {
  if (!player.cells.length) return;
  for (const cell of player.cells) {
    let dx = player.target.x - cell.x;
    let dy = player.target.y - cell.y;
    const distance = Math.hypot(dx, dy);
    const speed = speedFor(cell.mass);
    let desiredX = 0;
    let desiredY = 0;
    if (distance > cell.radius * 0.18) {
      desiredX = (dx / distance) * speed;
      desiredY = (dy / distance) * speed;
      if (distance < cell.radius * 0.6) {
        desiredX *= distance / (cell.radius * 0.6);
        desiredY *= distance / (cell.radius * 0.6);
      }
    }
    const blend = 1 - Math.exp(-dt * 5.4);
    cell.vx += (desiredX - cell.vx) * blend;
    cell.vy += (desiredY - cell.vy) * blend;
    cell.x += cell.vx * dt;
    cell.y += cell.vy * dt;
    if (cell.mass > 180) cell.mass *= 1 - dt * 0.0022;
    cell.radius = radiusFor(cell.mass);
    const low = cell.radius;
    const high = WORLD - cell.radius;
    if (cell.x < low) { cell.x = low; cell.vx = Math.abs(cell.vx) * 0.3; }
    if (cell.x > high) { cell.x = high; cell.vx = -Math.abs(cell.vx) * 0.3; }
    if (cell.y < low) { cell.y = low; cell.vy = Math.abs(cell.vy) * 0.3; }
    if (cell.y > high) { cell.y = high; cell.vy = -Math.abs(cell.vy) * 0.3; }
  }
  mergeCells(player);
}

function resolveCells() {
  const all = [];
  for (const player of players.values()) {
    for (const cell of player.cells) all.push({ player, cell });
  }
  const mergeCandidates = [];
  for (let i = 0; i < all.length; i += 1) {
    const a = all[i];
    for (let j = i + 1; j < all.length; j += 1) {
      const b = all[j];
      const dx = b.cell.x - a.cell.x;
      const dy = b.cell.y - a.cell.y;
      const distance = Math.hypot(dx, dy) || 0.001;
      const overlap = a.cell.radius + b.cell.radius - distance;
      if (overlap <= 0) continue;
      const nx = dx / distance;
      const ny = dy / distance;
      if (a.player.id === b.player.id) {
        const mergeAt = Math.max(a.cell.mergeAt || 0, b.cell.mergeAt || 0);
        if (now < mergeAt) {
          const remaining = mergeAt - now;
          const resistance = clamp(remaining / 10500, 0.12, 1);
          const push = overlap * (0.36 + 0.18 * resistance);
          a.cell.x -= nx * push * (b.cell.mass / (a.cell.mass + b.cell.mass));
          a.cell.y -= ny * push * (b.cell.mass / (a.cell.mass + b.cell.mass));
          b.cell.x += nx * push * (a.cell.mass / (a.cell.mass + b.cell.mass));
          b.cell.y += ny * push * (a.cell.mass / (a.cell.mass + b.cell.mass));
          const relative = (b.cell.vx - a.cell.vx) * nx + (b.cell.vy - a.cell.vy) * ny;
          if (relative < 0) {
            const impulse = -relative * 0.25;
            a.cell.vx -= nx * impulse * (b.cell.mass / (a.cell.mass + b.cell.mass));
            a.cell.vy -= ny * impulse * (b.cell.mass / (a.cell.mass + b.cell.mass));
            b.cell.vx += nx * impulse * (a.cell.mass / (a.cell.mass + b.cell.mass));
            b.cell.vy += ny * impulse * (a.cell.mass / (a.cell.mass + b.cell.mass));
          }
        }
        continue;
      }
      const totalMass = a.cell.mass + b.cell.mass;
      const push = overlap * 0.34;
      a.cell.x -= nx * push * (b.cell.mass / totalMass);
      a.cell.y -= ny * push * (b.cell.mass / totalMass);
      b.cell.x += nx * push * (a.cell.mass / totalMass);
      b.cell.y += ny * push * (a.cell.mass / totalMass);
      const relative = (b.cell.vx - a.cell.vx) * nx + (b.cell.vy - a.cell.vy) * ny;
      if (relative < 0) {
        const impulse = -relative * 0.22;
        a.cell.vx -= nx * impulse * (b.cell.mass / totalMass);
        a.cell.vy -= ny * impulse * (b.cell.mass / totalMass);
        b.cell.vx += nx * impulse * (a.cell.mass / totalMass);
        b.cell.vy += ny * impulse * (a.cell.mass / totalMass);
      }
      if (now <= a.player.graceUntil || now <= b.player.graceUntil) continue;
      const survivorIsBot = a.cell.mass >= b.cell.mass ? a.player.bot : b.player.bot;
      const biggestMass = Math.max(a.cell.mass, b.cell.mass);
      if (survivorIsBot && biggestMass > 250) continue;
      const sizeRatio = a.cell.mass / b.cell.mass;
      const contact = overlap / Math.max(1, Math.min(a.cell.radius, b.cell.radius));
      const smash = -relative;
      if (sizeRatio >= 0.45 && sizeRatio <= 2.2) {
        if (contact > 0.28 || (contact > 0.14 && smash > 42)) mergeCandidates.push([a, b]);
        continue;
      }
      const big = a.cell.mass >= b.cell.mass ? a : b;
      const small = big === a ? b : a;
      if (big.cell.mass < small.cell.mass * 1.55) continue;
      const swallow = (big.cell.radius - distance) / Math.max(1, small.cell.radius);
      if (swallow > 0.22) mergeCandidates.push([big, small]);
    }
  }
  if (mergeCandidates.length) {
    const removed = new Set();
    for (const [a, b] of mergeCandidates) {
      if (removed.has(a.cell.id) || removed.has(b.cell.id)) continue;
      if (!a.player.cells.includes(a.cell) || !b.player.cells.includes(b.cell)) continue;
      const absorbed = a.cell.mass >= b.cell.mass ? b : a;
      removed.add(absorbed.cell.id);
      mergeCellPair(a, b);
    }
  }
}

function feedCells() {
  for (const player of players.values()) {
    for (const cell of player.cells) {
      for (const food of foods.values()) {
        const reach = cell.radius + food.radius * 0.35;
        const dx = food.x - cell.x;
        const dy = food.y - cell.y;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < reach * reach) {
          eatFood(player, cell, food);
          continue;
        }
        const wake = cell.radius * 2.4 + food.radius;
        if (distanceSquared < wake * wake) {
          const distance = Math.sqrt(distanceSquared) || 1;
          const influence = 1 - distance / wake;
          food.vx += (dx / distance) * (cell.vx * 0.18 + 22) * influence * 0.12;
          food.vy += (dy / distance) * (cell.vy * 0.18 + 22) * influence * 0.12;
        }
      }
    }
  }
}

function updateFoods(dt) {
  applyFoodCohesion();
  for (const food of foods.values()) {
    const gx = food.x / FLOW_CELL;
    const gy = food.y / FLOW_CELL;
    const fieldX = sampleField(flowU, gx, gy);
    const fieldY = sampleField(flowV, gx, gy);
    food.x += (fieldX * 0.62 + food.vx) * dt;
    food.y += (fieldY * 0.62 + food.vy) * dt;
    const moving = food.vx !== 0 || food.vy !== 0;
    if (moving) {
      const drag = Math.exp(-dt * (food.ejecta ? 4.4 : 2.8));
      food.vx *= drag;
      food.vy *= drag;
      if (Math.abs(food.vx) < 0.4) food.vx = 0;
      if (Math.abs(food.vy) < 0.4) food.vy = 0;
      const low = food.radius + 4;
      const high = WORLD - food.radius - 4;
      if (food.x < low) { food.x = low; food.vx = Math.abs(food.vx) * 0.35; }
      if (food.x > high) { food.x = high; food.vx = -Math.abs(food.vx) * 0.35; }
      if (food.y < low) { food.y = low; food.vy = Math.abs(food.vy) * 0.35; }
      if (food.y > high) { food.y = high; food.vy = -Math.abs(food.vy) * 0.35; }
    }
    if (food.ejecta && now - food.born > 12000) foods.delete(food.id);
    for (const player of players.values()) {
      for (const cell of player.cells) {
        if (food.owner === player.id && now - food.born < 700) continue;
        const dx = food.x - cell.x;
        const dy = food.y - cell.y;
        const reach = cell.radius + food.radius * 0.3;
        if (dx * dx + dy * dy < reach * reach) {
          eatFood(player, cell, food);
          break;
        }
      }
      if (!foods.has(food.id)) break;
    }
  }
}

function update(dt) {
  now = Date.now();
  tick += 1;
  for (const player of players.values()) {
    if (player.bot) updateBot(player, dt);
    if (!player.cells.length) {
      if (player.bot && now > player.respawnAt && player.respawnAt) {
        spawnPlayer(player, 52 + Math.random() * 8);
      }
      continue;
    }
    updatePlayer(player, dt);
  }
  resolveCells();
  for (const player of players.values()) {
    if (!player.bot || !player.cells.length) continue;
    let total = playerMass(player);
    if (total > 260) {
      const scale = 250 / total;
      for (const cell of player.cells) {
        cell.mass *= scale;
        cell.radius = radiusFor(cell.mass);
      }
      const center = playerCenter(player);
      const release = Math.min(10, Math.ceil((total - 250) / 25));
      for (let i = 0; i < release; i += 1) {
        addFood({
          x: clamp(center.x + (Math.random() - 0.5) * 140, 40, WORLD - 40),
          y: clamp(center.y + (Math.random() - 0.5) * 140, 40, WORLD - 40),
          mass: 5,
          radius: 8,
          color: hslToRgb(hueOf(player), 0.8, 0.58)
        });
      }
      total = 250;
    }
    if (total > 220) {
      for (const cell of player.cells) cell.mass *= 1 - dt * 0.0015;
    }
  }
  updateFlow(dt);
  updateFoods(dt);
  updateCreatures(dt);
  if (thingCount() > THING_TARGET + 140) {
    const ejecta = [...foods.values()].filter((item) => item.ejecta).sort((a, b) => a.born - b.born);
    for (const item of ejecta) {
      if (thingCount() <= THING_TARGET) break;
      foods.delete(item.id);
    }
  }
  feedCells();
  for (const player of players.values()) {
    if (player.bot && !player.cells.length && player.respawnAt && now > player.respawnAt) {
      spawnPlayer(player, 52 + Math.random() * 8);
    }
  }
}

function snapshotBuffer() {
  const active = [...players.values()].filter((player) => player.cells.length > 0);
  let cells = 0;
  for (const player of active) cells += player.cells.length;
  const size = 1 + 2 + 1 + active.length * 3 + cells * 19 + 2 + events.length * 12;
  const buffer = new ArrayBuffer(size + 64);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, 1); offset += 1;
  view.setUint16(offset, tick & 0xffff, true); offset += 2;
  view.setUint8(offset, active.length); offset += 1;
  for (const player of active) {
    view.setUint16(offset, player.id, true); offset += 2;
    view.setUint8(offset, player.cells.length); offset += 1;
    for (const cell of player.cells) {
      view.setUint16(offset, cell.id, true); offset += 2;
      view.setUint16(offset, clamp(Math.round(cell.x), 0, 65535), true); offset += 2;
      view.setUint16(offset, clamp(Math.round(cell.y), 0, 65535), true); offset += 2;
      view.setFloat32(offset, cell.mass, true); offset += 4;
      view.setFloat32(offset, cell.vx, true); offset += 4;
      view.setFloat32(offset, cell.vy, true); offset += 4;
      view.setUint8(offset, cell.mergeAt > now ? 0 : 1); offset += 1;
    }
  }
  view.setUint16(offset, events.length, true); offset += 2;
  for (const event of events) {
    view.setUint16(offset, event.cellId, true); offset += 2;
    view.setUint16(offset, event.predatorId || 0, true); offset += 2;
    view.setUint16(offset, clamp(Math.round(event.x), 0, 65535), true); offset += 2;
    view.setUint16(offset, clamp(Math.round(event.y), 0, 65535), true); offset += 2;
    view.setUint8(offset, event.color[0]); offset += 1;
    view.setUint8(offset, event.color[1]); offset += 1;
    view.setUint8(offset, event.color[2]); offset += 1;
    view.setUint8(offset, event.kind); offset += 1;
  }
  events.length = 0;
  return new Uint8Array(buffer, 0, offset);
}

function foodBuffer(client) {
  let center = { x: WORLD / 2, y: WORLD / 2 };
  if (client.player && client.player.cells.length) center = playerCenter(client.player);
  else if (client.view) center = client.view;
  const limit = (client.player && client.player.cells.length) ? 2000 : 2600;
  const visible = [];
  for (const food of foods.values()) {
    const dx = food.x - center.x;
    const dy = food.y - center.y;
    if (dx * dx + dy * dy < limit * limit) visible.push(food);
  }
  const size = 1 + 2 + 2 + visible.length * 11;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  let offset = 0;
  view.setUint8(offset, 2); offset += 1;
  view.setUint16(offset, tick & 0xffff, true); offset += 2;
  view.setUint16(offset, visible.length, true); offset += 2;
  for (const food of visible) {
    view.setUint16(offset, food.id, true); offset += 2;
    view.setUint16(offset, clamp(Math.round(food.x), 0, 65535), true); offset += 2;
    view.setUint16(offset, clamp(Math.round(food.y), 0, 65535), true); offset += 2;
    view.setUint8(offset, clamp(Math.round(food.radius), 1, 255)); offset += 1;
    view.setUint8(offset, food.color[0]); offset += 1;
    view.setUint8(offset, food.color[1]); offset += 1;
    view.setUint8(offset, food.color[2]); offset += 1;
    view.setUint8(offset, food.ejecta ? 1 : 0); offset += 1;
  }
  return new Uint8Array(buffer);
}

function sendFrame(socket, opcode, payload) {
  if (!socket || socket.destroyed) return;
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x80 | opcode;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  try {
    socket.write(Buffer.concat([header, Buffer.from(payload)]));
  } catch {
  }
}

function sendJSON(client, object) {
  if (!client || !client.ws) return;
  sendFrame(client.ws, 1, Buffer.from(JSON.stringify(object)));
}

function broadcastSnapshots() {
  const payload = snapshotBuffer();
  for (const client of clients) sendFrame(client.ws, 2, payload);
}

function broadcastCreatures() {
  for (const client of clients) {
    sendFrame(client.ws, 2, creatureBuffer(client));
  }
}

function broadcastFood() {
  for (const client of clients) {
    sendFrame(client.ws, 2, foodBuffer(client));
  }
}

function handleMessage(client, text) {
  if (!text || text.length > 2000) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  if (!message || typeof message !== 'object') return;
  if (message.t === 'join') {
    if (client.player) return;
    if (humanCount() >= SLOTS) {
      sendJSON(client, { t: 'full' });
      return;
    }
    const name = String(message.name || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 16) || randomName();
    const hue = Number.isFinite(message.hue) ? message.hue : Math.random() * 360;
    const player = createPlayer({ ws: client.ws, name, hue });
    client.player = player;
    client.ws.player = player;
    ensurePopulation();
    sendJSON(client, { t: 'welcome', id: player.id, name: player.name, hue: player.hue, world: WORLD, slots: SLOTS });
    broadcastRoster();
    sendFrame(client.ws, 2, snapshotBuffer());
    sendFrame(client.ws, 2, foodBuffer(client));
    return;
  }
  if (message.t === 'respawn' && client.player) {
    const player = client.player;
    if (player.cells.length) return;
    spawnPlayer(player, 55);
    player.lastKiller = null;
    sendJSON(client, { t: 'respawned' });
    return;
  }
  if (message.t === 'view') {
    const x = Number(message.x);
    const y = Number(message.y);
    if (Number.isFinite(x) && Number.isFinite(y)) client.view = { x: clamp(x, 0, WORLD), y: clamp(y, 0, WORLD) };
    if (!client.player) return;
  }
  if (!client.player) return;
  if (message.t === 'input') {
    const x = Number(message.x);
    const y = Number(message.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      client.player.target.x = clamp(x, 0, WORLD);
      client.player.target.y = clamp(y, 0, WORLD);
    }
    return;
  }
  if (message.t === 'split') {
    splitPlayer(client.player);
    return;
  }
  if (message.t === 'eject') {
    ejectMass(client.player);
    return;
  }
}

function onSocketData(client, chunk) {
  client.buffer = client.buffer.length ? Buffer.concat([client.buffer, chunk]) : chunk;
  let buffer = client.buffer;
  while (buffer.length >= 2) {
    const first = buffer[0];
    const second = buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) break;
      length = buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      if (buffer.length < 10) break;
      const size = buffer.readBigUInt64BE(2);
      if (size > 1_000_000n) {
        closeSocket(client.ws);
        return;
      }
      length = Number(size);
      offset = 10;
    }
    let mask = null;
    if (masked) {
      if (buffer.length < offset + 4) break;
      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }
    if (buffer.length < offset + length) break;
    let payload = buffer.subarray(offset, offset + length);
    if (mask) {
      const out = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i += 1) out[i] = payload[i] ^ mask[i & 3];
      payload = out;
    }
    buffer = buffer.subarray(offset + length);
    if (opcode === 1) {
      handleMessage(client, payload.toString('utf8'));
    } else if (opcode === 8) {
      closeSocket(client.ws);
    } else if (opcode === 9) {
      sendFrame(client.ws, 10, payload);
    }
  }
  client.buffer = buffer;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({
      ok: true,
      humans: humanCount(),
      bots: botCount(),
      players: players.size,
      food: foods.size,
      tick
    }));
    return;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const target = path.resolve(ROOT, '.' + pathname);
  if (!target.startsWith(ROOT + path.sep) && target !== ROOT) {
    response.writeHead(403);
    response.end('forbidden');
    return;
  }
  try {
    const data = await fs.readFile(target);
    const extension = path.extname(target);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.woff2': 'font/woff2',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };
    response.writeHead(200, {
      'Content-Type': types[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.woff2' ? 'public, max-age=86400' : 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    response.end(data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
});

server.on('upgrade', (request, socket) => {
  const url = new URL(request.url || '/', 'http://localhost');
  if (url.pathname !== '/ws') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n'
  );
  socket.setNoDelay(true);
  const client = {
    ws: socket,
    player: null,
    view: { x: WORLD / 2, y: WORLD / 2 },
    buffer: Buffer.alloc(0)
  };
  clients.add(client);
  broadcastRoster();
  socket.on('data', (chunk) => onSocketData(client, chunk));
  socket.on('close', () => {
    clients.delete(client);
    if (client.player) removePlayer(client.player);
  });
  socket.on('error', () => {
    clients.delete(client);
    if (client.player) removePlayer(client.player);
  });
});

seedFood();
seedCreatures();
for (let i = 0; i < SLOTS; i += 1) createBot();

setInterval(() => {
  update(TICK);
  if (tick % SNAPSHOT_EVERY === 0) broadcastSnapshots();
  if (tick % FOOD_EVERY === 0) broadcastFood();
  if (tick % 2 === 0) broadcastCreatures();
}, 1000 / 30);

setInterval(() => {
  for (const client of clients) {
    if (client.ws.destroyed) {
      clients.delete(client);
      continue;
    }
    sendFrame(client.ws, 9, Buffer.alloc(0));
  }
}, 20000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`squish listening on ${PORT}`);
});
