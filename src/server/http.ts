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
  '.ogg': 'audio/ogg',
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

const CACHED = new Set(['.woff2', '.ogg']);

function byteRange(header: string | undefined, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!match) return null;
  const [, from = '', to = ''] = match;
  const start = from === '' ? Math.max(0, size - Number(to)) : Number(from);
  const end = from === '' || to === '' ? size - 1 : Math.min(Number(to), size - 1);
  return start <= end ? { start, end } : null;
}

async function sendFile(request: IncomingMessage, response: ServerResponse, target: string): Promise<void> {
  try {
    const data = await readFile(target);
    const extension = path.extname(target);
    const range = byteRange(request.headers.range, data.length);
    const headers: Record<string, string> = {
      'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
      'Cache-Control': CACHED.has(extension) ? 'public, max-age=86400' : 'no-store',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
    };
    if (range) headers['Content-Range'] = `bytes ${String(range.start)}-${String(range.end)}/${String(data.length)}`;
    response.writeHead(range ? 206 : 200, headers);
    response.end(range ? data.subarray(range.start, range.end + 1) : data);
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
    void sendFile(request, response, target);
  };
}
