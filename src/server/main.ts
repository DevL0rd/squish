import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { recordTick, reportStats } from './stats.ts';
import { broadcastBoard, broadcastCreatures, broadcastFood, broadcastSnapshots } from './broadcast.ts';
import { CREATURE_EVERY, FOOD_EVERY, PING_INTERVAL, PORT, SLOTS, SNAPSHOT_EVERY, TICK_RATE } from './config.ts';
import { seedCreatures } from './life/creatures.ts';
import { seedFood } from './food.ts';
import { obstaclePositions, obstacleShapes, seedObstacles } from './obstacles.ts';
import { staticHandler } from './http.ts';
import { handleMessage } from './messages.ts';
import { broadcastRoster, createBot, removePlayer } from './players.ts';
import { update } from './simulation.ts';
import type { Client } from './types.ts';
import { hazardPacket } from './hazards/events.ts';
import { send, sendJson } from './transport.ts';
import { world, worldCenter } from './world.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const MAX_PAYLOAD = 1_000_000;
const DRIFT_EVERY = 15;
const HAZARD_EVERY = 3;

function disconnect(client: Client): void {
  if (!world.clients.delete(client)) return;
  if (client.player) removePlayer(client.player);
}

const PRIVATE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|::ffff:127\.|f[cd])/;

function isLocal(request: IncomingMessage): boolean {
  if (request.headers['cf-connecting-ip'] || request.headers['cf-ray']) return false;
  return PRIVATE.test(request.socket.remoteAddress ?? '');
}

function connect(ws: WebSocket, request: IncomingMessage): void {
  const client: Client = { ws, local: isLocal(request), player: null, view: worldCenter() };
  world.clients.add(client);
  sendJson(ws, { t: 'obstacles', items: obstacleShapes() });
  broadcastRoster();
  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (!isBinary && Buffer.isBuffer(data)) handleMessage(client, data.toString('utf8'));
  });
  ws.on('close', () => {
    disconnect(client);
  });
  ws.on('error', () => {
    disconnect(client);
  });
}

const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

function upgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
  if (new URL(request.url ?? '/', 'http://localhost').pathname !== '/ws') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return;
  }
  sockets.handleUpgrade(request, socket, head, (ws) => {
    connect(ws, request);
  });
}

function tick(): void {
  const start = performance.now();
  update(1 / TICK_RATE);
  if (world.tick % SNAPSHOT_EVERY === 0) broadcastSnapshots();
  if (world.tick % TICK_RATE === 0) broadcastBoard();
  if (world.tick % FOOD_EVERY === 0) broadcastFood();
  if (world.tick % CREATURE_EVERY === 0) broadcastCreatures();
  if (world.tick % DRIFT_EVERY === 0) broadcastDrift();
  if (world.tick % HAZARD_EVERY === 0) broadcastHazards();
  recordTick(performance.now() - start);
  if (world.tick % TICK_RATE === 0) reportStats();
}

function broadcastHazards(): void {
  const packet = hazardPacket();
  for (const client of world.clients) send(client.ws, packet);
}

function broadcastDrift(): void {
  const items = obstaclePositions();
  for (const client of world.clients) sendJson(client.ws, { t: 'drift', items });
}

function ping(): void {
  for (const client of world.clients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.ping();
    else disconnect(client);
  }
}

const server = createServer(staticHandler(ROOT));
server.on('upgrade', upgrade);

seedObstacles();
seedFood();
seedCreatures();
for (let i = 0; i < SLOTS; i += 1) createBot();
setInterval(tick, 1000 / TICK_RATE);
setInterval(ping, PING_INTERVAL);
server.listen(PORT, '0.0.0.0', () => {
  const address = server.address();
  console.info(`squish listening on ${typeof address === 'object' && address ? address.port : PORT}`);
});
