import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const types = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  svg: 'image/svg+xml; charset=utf-8',
  json: 'application/json; charset=utf-8',
};
const port = Number(process.env.MONTAGE_PORT || 8776);
createServer(async (request, response) => {
  try {
    const path = new URL(request.url, 'http://localhost').pathname;
    const name = path === '/' ? 'index.html' : path.slice(1);
    const type = types[name.split('.').at(-1)];
    if (!/^[a-z0-9_-]+\.[a-z]+$/i.test(name) || !type) throw Error('Unknown file');
    const body = await readFile(new URL(`../dist/${name}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Монтаж: http://127.0.0.1:${port}`));
