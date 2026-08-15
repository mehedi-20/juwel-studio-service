const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`[Request] ${req.method} ${req.url}`);

  // Strip query parameters and hash fragments
  const rawPath = (req.url || '/').split('?')[0].split('#')[0];

  let pathname;
  try {
    pathname = decodeURIComponent(rawPath);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Bad Request');
    return;
  }

  // Default to index.html for the root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Resolve the requested path strictly inside the project root
  // (normalize neutralizes ../ traversal attempts)
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    console.log(`[403] Forbidden path attempt: ${pathname}`);
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      console.log(`[404] Not Found: ${pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('File Not Found');
      return;
    }

    const extname = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[extname] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
    });

    // Stream the file (binary-safe, unlike encoding-forced end())
    const stream = fs.createReadStream(filePath);
    stream.on('error', (err) => {
      console.log(`[500] Stream error: ${err.code}`);
      res.destroy();
    });
    stream.pipe(res);
  });
});

server.on('error', (err) => {
  console.error(`[Server] Fatal error: ${err.message}`);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Juwel Telecom E-Sheba Server running live at http://0.0.0.0:${PORT}/`);
});
