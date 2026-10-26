import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { ByteReader } from '../src/shared/bytes.ts';
import { decodeSnapshot } from '../src/shared/codec.ts';
import { Packet, type ServerMessage } from '../src/shared/protocol.ts';

const PORT = 5600 + Math.floor(Math.random() * 300);

async function startServer(): Promise<() => void> {
  const child = spawn(process.execPath, ['src/server/main.ts'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await once(child.stdout, 'data');
  return () => child.kill();
}

function nextText(socket: WebSocket, type: ServerMessage['t']): Promise<ServerMessage> {
  return new Promise((resolve) => {
    socket.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return;
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.t === type) resolve(message);
    });
  });
}

function nextSnapshot(socket: WebSocket): Promise<ReturnType<typeof decodeSnapshot>> {
  return new Promise((resolve) => {
    socket.addEventListener('message', (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const reader = new ByteReader(new DataView(event.data));
      if (reader.u8() === Packet.Snapshot) resolve(decodeSnapshot(reader));
    });
  });
}

await test('server reports health and accepts a player', async () => {
  const stop = await startServer();
  try {
    const health = (await (await fetch(`http://localhost:${PORT}/health`)).json()) as { ok: boolean; bots: number };
    assert.equal(health.ok, true);
    assert.equal(health.bots, 12);
    const socket = new WebSocket(`ws://localhost:${PORT}/ws`);
    socket.binaryType = 'arraybuffer';
    await once(socket, 'open');
    const welcome = nextText(socket, 'welcome');
    const snapshot = nextSnapshot(socket);
    socket.send(JSON.stringify({ t: 'join', name: 'Tester\u0001', hue: -1 }));
    const message = await welcome;
    assert.equal(message.t === 'welcome' && message.name, 'Tester');
    const players = (await snapshot).players;
    assert.ok(players.some((player) => message.t === 'welcome' && player.id === message.id));
    socket.close();
  } finally {
    stop();
  }
});
