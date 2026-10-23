#!/usr/bin/env node
/* Riff Mobile — static preview server.
   Serves the mobile client on its own so the interface can be reviewed without
   launching Electron. With no Riff backend reachable it opens in demo mode.

   Usage:  npm run mobile:dev      (then open http://localhost:3000)
*/

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const APP_ROOT = path.join(ROOT, '..');
const PORT = Number(process.env.PORT) || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
};

function sendFile(res, filePath, extraHeaders) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const headers = Object.assign({
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache'
    }, extraHeaders || {});
    res.writeHead(200, headers);
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://localhost');
  let pathname = decodeURIComponent(parsed.pathname);

  if (pathname === '/' && !parsed.searchParams.has('demo')) {
    res.writeHead(302, { Location: '/?demo=1' });
    res.end();
    return;
  }
  if (pathname === '/') pathname = '/index.html';

  if (pathname === '/audio-engine.js') {
    return sendFile(res, path.join(APP_ROOT, 'audio-engine.js'));
  }
  if (pathname.startsWith('/assets/')) {
    const asset = path.normalize(path.join(APP_ROOT, pathname));
    if (!asset.startsWith(path.join(APP_ROOT, 'assets') + path.sep)) {
      res.writeHead(403);
      return res.end('Forbidden');
    }
    return sendFile(res, asset);
  }

  const target = path.normalize(path.join(ROOT, pathname));
  if (!target.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    sendFile(res, target, pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : null);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Riff Mobile preview: http://localhost:' + PORT + '/?demo=1');
});
