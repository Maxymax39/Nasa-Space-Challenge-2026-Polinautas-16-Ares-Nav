// Static file server for local use. Node built-ins only, so there is nothing
// to install and it works offline.
//
//   node scripts/serve.mjs [--port 5173] [--open]
//
// A busy port is not fatal: we try the next ones (up to +9).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const firstPort = portArg >= 0 ? Number(args[portArg + 1]) : 5173;
const open = args.includes('--open');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (rel === '/') rel = '/index.html';
  const file = normalize(join(root, rel));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    console.log(`404  ${rel}`);
    res.writeHead(404).end();
  }
});

function listen(port) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && port < firstPort + 9) {
      console.log(`Puerto ${port} ocupado; probando ${port + 1}.`);
      listen(port + 1);
    } else {
      console.error(`No se pudo iniciar el servidor: ${err.message}`);
      process.exit(1);
    }
  });
  server.listen(port, 'localhost', () => {
    const url = `http://localhost:${port}/`;
    console.log(`ARES-NAV en ${url}  (Ctrl+C para detener)`);
    if (!open) return;
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd);
  });
}

listen(firstPort);
