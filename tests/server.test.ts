import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { ByteReader } from '../src/shared/bytes.ts';
import { decodeSnapshot } from '../src/shared/codec.ts';
import { Packet, type ServerMessage } from '../src/shared/protocol.ts';

async function startServer(): Promise<{ port: number; stop: () => void }> {
  const child = spawn(process.execPath, ['src/server/main.ts', '--port', '0'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const [chunk] = (await once(child.stdout, 'data')) as [Buffer];
  const port = Number(/listening on (\d+)/.exec(chunk.toString())?.[1]);
  return { port, stop: () => child.kill() };
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

function snapshotWith(socket: WebSocket, playerId: () => number): Promise<void> {
  return new Promise((resolve) => {
    socket.addEventListener('message', (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const reader = new ByteReader(new DataView(event.data));
      if (reader.u8() !== Packet.Snapshot) return;
      if (decodeSnapshot(reader).players.some((player) => player.id === playerId())) resolve();
    });
  });
}

await test('server reports health and accepts a player', async () => {
  const { port, stop } = await startServer();
  try {
    const health = (await (await fetch(`http://localhost:${port}/health`)).json()) as { ok: boolean; bots: number };
    assert.equal(health.ok, true);
    assert.equal(health.bots, 12);
    const socket = new WebSocket(`ws://localhost:${port}/ws`);
    socket.binaryType = 'arraybuffer';
    await once(socket, 'open');
    let joinedId = -1;
    const welcome = nextText(socket, 'welcome');
    const snapshot = snapshotWith(socket, () => joinedId);
    socket.send(JSON.stringify({ t: 'join', name: 'Tester\u0001', hue: -1 }));
    const message = await welcome;
    assert.ok(message.t === 'welcome');
    assert.equal(message.name, 'Tester');
    joinedId = message.id;
    await snapshot;
    socket.close();
  } finally {
    stop();
  }
});
