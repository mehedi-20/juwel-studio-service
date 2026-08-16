const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS_FILE = path.join(ROOT, 'js', 'data-uploads.js');
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

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

  // অ্যাডমিন প্যানেল থেকে রেকর্ড + PDF আপলোড (persist হয় সার্ভারে!)
  if (req.method === 'POST' && pathname === '/api/upload-record') {
    handleUpload(req, res);
    return;
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

/* ==========================================================================
   অ্যাডমিন আপলোড API
   POST /api/upload-record
   বডি: { type: 'nid'|'khatian', record: {...}, fileName?, fileBase64? }
   - PDF ফাইল pdfs/ ফোল্ডারে সেভ হয়
   - রেকর্ড js/data-uploads.js ফাইলে জমা হয় (রিফ্রেশের পরেও থাকে!)
   - PDF টেক্সট ইনডেক্স অটো রিবিল্ড হয় → সাথে সাথে সার্চযোগ্য
   ========================================================================== */

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

function readUploadedRecords() {
  try {
    const src = fs.readFileSync(UPLOADS_FILE, 'utf8');
    const start = src.indexOf('[');
    const end = src.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    return JSON.parse(src.slice(start, end + 1));
  } catch (e) {
    console.warn('[Upload] Could not read uploads file:', e.message);
    return [];
  }
}

function writeUploadedRecords(records) {
  const header = '// ⚠️ অ্যাডমিন প্যানেল থেকে আপলোডকৃত রেকর্ড — এই ফাইল সার্ভার নিজে থেকে লিখে (হাতে এডিট করবেন না)\n';
  fs.writeFileSync(UPLOADS_FILE, header + 'const UPLOADED_RECORDS = ' + JSON.stringify(records, null, 2) + ';\n');
}

let textIndexRebuildQueued = false;
function rebuildTextIndex() {
  if (textIndexRebuildQueued) return;
  textIndexRebuildQueued = true;
  const tool = path.join(ROOT, 'tools', 'build-pdf-text-index.js');
  const child = spawn(process.execPath, [tool], { cwd: ROOT, stdio: 'ignore' });
  child.on('exit', () => {
    textIndexRebuildQueued = false;
    console.log('[Upload] PDF text index rebuilt');
  });
  child.on('error', (err) => {
    textIndexRebuildQueued = false;
    console.warn('[Upload] PDF index rebuild failed:', err.message);
  });
}

function handleUpload(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > MAX_UPLOAD_BYTES + 1024 * 1024) {
      sendJson(res, 413, { ok: false, error: 'ফাইল খুব বড় (সর্বোচ্চ ২৫ MB)' });
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const { type, record, fileName, fileBase64 } = payload;

      if (type !== 'nid' && type !== 'khatian') {
        return sendJson(res, 400, { ok: false, error: 'ভুল রেকর্ড টাইপ' });
      }
      if (!record || typeof record !== 'object') {
        return sendJson(res, 400, { ok: false, error: 'রেকর্ড ডেটা নেই' });
      }

      let pdfPath = (typeof record.pdf === 'string' && record.pdf.startsWith('pdfs/'))
        ? record.pdf
        : 'pdfs/fallback.pdf';

      if (fileBase64) {
        const buf = Buffer.from(String(fileBase64), 'base64');
        if (buf.length === 0 || buf.length > MAX_UPLOAD_BYTES) {
          return sendJson(res, 400, { ok: false, error: 'PDF ফাইল সমস্যাযুক্ত' });
        }
        if (buf.slice(0, 5).toString('latin1') !== '%PDF-') {
          return sendJson(res, 400, { ok: false, error: 'শুধুমাত্র PDF ফাইল আপলোড করা যাবে' });
        }
        const safe = String(fileName || `${type}-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
        const baseName = safe.toLowerCase().endsWith('.pdf') ? safe : safe + '.pdf';
        let finalName = baseName;
        let counter = 1;
        while (fs.existsSync(path.join(ROOT, 'pdfs', finalName))) {
          finalName = `${baseName.replace(/\.pdf$/i, '')}-${counter}.pdf`;
          counter++;
        }
        fs.writeFileSync(path.join(ROOT, 'pdfs', finalName), buf);
        pdfPath = 'pdfs/' + finalName;
      }

      const clean = { type, ...record, pdf: pdfPath, uploadedAt: new Date().toISOString() };

      // ডুপ্লিকেট চেক
      const records = readUploadedRecords();
      const isDup = records.some(r => {
        if (r.type !== type) return false;
        if (type === 'nid') return String(r.nid) === String(clean.nid);
        return String(r.khatian_no) === String(clean.khatian_no) && String(r.mouza) === String(clean.mouza);
      });
      if (isDup) {
        return sendJson(res, 409, { ok: false, duplicate: true, error: 'এই রেকর্ডটি ইতিমধ্যে আছে' });
      }

      records.push(clean);
      writeUploadedRecords(records);
      rebuildTextIndex();
      console.log(`[Upload] saved ${type} record → ${pdfPath}`);
      sendJson(res, 200, { ok: true, pdf: pdfPath });
    } catch (e) {
      console.error('[Upload] Error:', e);
      sendJson(res, 500, { ok: false, error: 'সার্ভারে সেভ করতে ব্যর্থ: ' + e.message });
    }
  });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Juwel Telecom E-Sheba Server running live at http://0.0.0.0:${PORT}/`);
});
