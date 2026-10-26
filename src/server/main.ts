import { createServer, type IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { broadcastCreatures, broadcastFood, broadcastSnapshots } from './broadcast.ts';
import { CREATURE_EVERY, FOOD_EVERY, PING_INTERVAL, PORT, SLOTS, SNAPSHOT_EVERY, TICK_RATE } from './config.ts';
import { seedCreatures } from './creatures.ts';
import { seedFood } from './food.ts';
import { staticHandler } from './http.ts';
import { handleMessage } from './messages.ts';
import { broadcastRoster, createBot, removePlayer } from './players.ts';
import { update } from './simulation.ts';
import type { Client } from './types.ts';
import { world, worldCenter } from './world.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');
const MAX_PAYLOAD = 1_000_000;

function disconnect(client: Client): void {
  if (!world.clients.delete(client)) return;
  if (client.player) removePlayer(client.player);
}

function connect(ws: WebSocket): void {
  const client: Client = { ws, player: null, view: worldCenter() };
  world.clients.add(client);
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
  sockets.handleUpgrade(request, socket, head, connect);
}

function tick(): void {
  update(1 / TICK_RATE);
  if (world.tick % SNAPSHOT_EVERY === 0) broadcastSnapshots();
  if (world.tick % FOOD_EVERY === 0) broadcastFood();
  if (world.tick % CREATURE_EVERY === 0) broadcastCreatures();
}

function ping(): void {
  for (const client of world.clients) {
    if (client.ws.readyState === WebSocket.OPEN) client.ws.ping();
    else disconnect(client);
  }
}

const server = createServer(staticHandler(ROOT));
server.on('upgrade', upgrade);

seedFood();
seedCreatures();
for (let i = 0; i < SLOTS; i += 1) createBot();
setInterval(tick, 1000 / TICK_RATE);
setInterval(ping, PING_INTERVAL);
server.listen(PORT, '0.0.0.0', () => {
  console.info(`squish listening on ${PORT}`);
});
