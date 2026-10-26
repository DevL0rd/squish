import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { botCount, humanCount } from './players.ts';
import { world } from './world.ts';

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendHealth(response: ServerResponse): void {
  response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(
    JSON.stringify({
      ok: true,
      humans: humanCount(),
      bots: botCount(),
      players: world.players.size,
      food: world.foods.size,
      tick: world.tick,
    }),
  );
}

async function sendFile(response: ServerResponse, target: string): Promise<void> {
  try {
    const data = await readFile(target);
    const extension = path.extname(target);
    response.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'Cache-Control': extension === '.woff2' ? 'public, max-age=86400' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(data);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('not found');
  }
}

export function staticHandler(root: string): (request: IncomingMessage, response: ServerResponse) => void {
  return (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname === '/health') {
      sendHealth(response);
      return;
    }
    const pathname = decodeURIComponent(url.pathname);
    const target = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root + path.sep) && target !== root) {
      response.writeHead(403);
      response.end('forbidden');
      return;
    }
    void sendFile(response, target);
  };
}
