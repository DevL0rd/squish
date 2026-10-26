import { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/protocol.ts';

export function send(socket: WebSocket | null, data: Uint8Array | string): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(data);
}

export function sendJson(socket: WebSocket | null, message: ServerMessage): void {
  send(socket, JSON.stringify(message));
}
