import { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';
import { countBytes } from './stats.ts';

export function send(socket: WebSocket | null, data: Uint8Array | string): void {
  if (socket?.readyState !== WebSocket.OPEN) return;
  socket.send(data);
  countBytes(typeof data === 'string' ? data.length : data.byteLength);
}

export function sendJson(socket: WebSocket | null, message: ServerMessage): void {
  send(socket, JSON.stringify(message));
}
