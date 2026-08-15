const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  console.log(`[Request] ${req.method} ${req.url}`);
  
  // Normalize URL path
  let filePath = '.' + req.url;
  if (filePath === './' || filePath === './index.html/') {
    filePath = './index.html';
  }
  
  // Remove query parameters or hash fragments
  filePath = filePath.split('?')[0].split('#')[0];

  const extname = String(path.extname(filePath)).toLowerCase();
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        console.log(`[404] Not Found: ${filePath}`);
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
      } else {
        console.log(`[500] Server Error: ${error.code}`);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Server Error: ${error.code}`);
      }
    } else {
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
      });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Juwel Telecom E-Sheba Server running live at http://0.0.0.0:${PORT}/`);
});
