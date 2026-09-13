import http from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const port = Number(option('--port', '5173'));
const host = option('--host', '127.0.0.1');
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('Utilisation : npm run dev -- --host 0.0.0.0 --port 5173');
}
const root = await realpath(fileURLToPath(new URL(args.includes('--dist') ? '../dist/' : '../', import.meta.url)));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // Serve only the game. Never expose Git history, scripts or configuration.
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    if (relative !== 'index.html' && !relative.startsWith('src/')) throw new Error('Not found');
    if (relative.split(/[\\/]/).some(part => part.startsWith('.'))) throw new Error('Not found');
    const filename = await realpath(path.resolve(root, relative));
    if (!filename.startsWith(root + path.sep) || !(await stat(filename)).isFile()) throw new Error('Not found');
    const body = await readFile(filename);
    res.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Content-Length': body.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Fichier introuvable');
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(port, host, () => console.log(`Patapon : http://${host}:${port} — Ctrl+C pour arrêter`));
