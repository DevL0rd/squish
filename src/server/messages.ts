import { clamp, WORLD } from '../shared/math.ts';
import { MAX_NAME } from '../shared/protocol.ts';
import { splitPlayer } from './actions.ts';
import { boostPlayer, tellBoost } from './boost.ts';
import { attack } from './combat/weapons.ts';
import { tellProgress } from './progress.ts';
import { adminCatalog, adminCommand, isAdmin } from './admin.ts';
import { foodPacket, sendPacket, snapshotPacket } from './broadcast.ts';
import { SLOTS } from './config.ts';
import { broadcastRoster, createPlayer, ensurePopulation, humanCount, randomName, spawnPlayer } from './players.ts';
import type { Client, Player, Point } from './types.ts';
import { sendJson } from './transport.ts';

const MAX_MESSAGE = 2000;

type Message = Readonly<Record<string, unknown>>;

function parse(text: string): Message | null {
  if (!text || text.length > MAX_MESSAGE) return null;
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Message) : null;
  } catch {
    return null;
  }
}

function pointOf(message: Message): Point | null {
  const x = Number(message['x']);
  const y = Number(message['y']);
  return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(x, 0, WORLD), y: clamp(y, 0, WORLD) } : null;
}

function cleanName(value: unknown): string {
  const text = typeof value === 'string' ? value : '';
  const printable = Array.from(text)
    .filter((character) => character.charCodeAt(0) > 0x1f)
    .join('');
  return printable.trim().slice(0, MAX_NAME) || randomName();
}

function join(client: Client, message: Message): void {
  if (client.player) return;
  if (humanCount() >= SLOTS) {
    sendJson(client.ws, { t: 'full' });
    return;
  }
  const hue = message['hue'];
  const name = cleanName(message['name']);
  const player = createPlayer({
    ws: client.ws,
    name,
    admin: isAdmin(name, client.local, message['key']),
    hue: typeof hue === 'number' && Number.isFinite(hue) ? hue : Math.random() * 360,
  });
  client.player = player;
  ensurePopulation();
  sendJson(client.ws, {
    t: 'welcome',
    id: player.id,
    name: player.name,
    hue: player.hue,
    world: WORLD,
    slots: SLOTS,
    admin: player.admin ? adminCatalog() : null,
  });
  broadcastRoster();
  tellBoost(player);
  tellProgress(player);
  sendPacket(client, snapshotPacket(client, false));
  sendPacket(client, foodPacket(client));
}

function respawn(client: Client, player: Player): void {
  if (player.cells.length) return;
  spawnPlayer(player, 55);
  tellBoost(player);
  tellProgress(player);
  player.lastKiller = null;
  sendJson(client.ws, { t: 'respawned' });
}

function steer(player: Player, message: Message): void {
  const point = pointOf(message);
  if (!point) return;
  player.target.x = point.x;
  player.target.y = point.y;
}

function playerCommand(client: Client, player: Player, message: Message): void {
  switch (message['t']) {
    case 'respawn':
      respawn(client, player);
      return;
    case 'input':
      steer(player, message);
      return;
    case 'split':
      splitPlayer(player);
      return;
    case 'eject':
      attack(player);
      return;
    case 'boost':
      boostPlayer(player);
      return;
    default:
      toolCommand(client, player, message);
  }
}

function toolCommand(client: Client, player: Player, message: Message): void {
  if (message['t'] === 'admin') adminCommand(player, message['action'], message['arg']);
  else if (message['t'] === 'probe' && player.admin && typeof message['at'] === 'number') {
    sendJson(client.ws, { t: 'echo', at: message['at'] });
  }
}

export function handleMessage(client: Client, text: string): void {
  const message = parse(text);
  if (!message) return;
  if (message['t'] === 'join') {
    join(client, message);
    return;
  }
  if (message['t'] === 'view') client.view = pointOf(message) ?? client.view;
  if (client.player) playerCommand(client, client.player, message);
}
