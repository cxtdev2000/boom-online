/* Serves the game files over HTTP and hosts online rooms over WebSocket (/ws) on the same port. */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');
const rooms = require('./rooms');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const PUBLIC = ['index.html', 'style.css', 'js/', 'assets/'];
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** Streams a file, honouring Range requests so long music tracks can start before fully loading. */
function serveFile(req, res, file, stat) {
  const type = TYPES[path.extname(file)] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Content-Length': end - start + 1,
      'Accept-Ranges': 'bytes',
    });
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.headers['x-forwarded-proto'] === 'http') {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    return res.end();
  }
  let rel;
  try {
    rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html';
  } catch {
    res.writeHead(400);
    return res.end();
  }
  const file = path.join(ROOT, rel);
  const allowed = file.startsWith(ROOT + path.sep) && PUBLIC.some((p) => rel === p || (p.endsWith('/') && rel.startsWith(p)));
  if (!allowed || rel.includes('..')) {
    res.writeHead(404);
    return res.end('Not found');
  }
  fs.stat(file, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    serveFile(req, res, file, stat);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
wss.on('connection', rooms.connect);

server.listen(PORT, () => {
  console.log(`Boom Online running at http://localhost:${PORT}`);
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const n of nets || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  LAN: http://${n.address}:${PORT}`);
    }
  }
});
