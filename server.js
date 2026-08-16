const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOADS_FILE = path.join(ROOT, 'js', 'data-uploads.js');
const OVERRIDES_FILE = path.join(ROOT, 'js', 'pdf-name-overrides.js');
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

  // বাল্ক ইমপোর্ট (একসাথে অনেক রেকর্ড — ভোটার তালিকা ইত্যাদি)
  if (req.method === 'POST' && pathname === '/api/bulk-import') {
    handleBulkImport(req, res);
    return;
  }

  // বাল্ক PDF আপলোড (একসাথে অনেক PDF — খতিয়ান/ভোটার তালিকার স্ক্যান)
  if (req.method === 'POST' && pathname === '/api/bulk-pdf-upload') {
    handleBulkPdfUpload(req, res);
    return;
  }

  // PDF তালিকা + নাম-ওভাররাইড (অ্যাডমিনের নাম সংশোধন টুলের জন্য)
  if (req.method === 'GET' && pathname === '/api/pdf-list') {
    handlePdfList(req, res);
    return;
  }
  if (req.method === 'POST' && pathname === '/api/pdf-names') {
    handlePdfNames(req, res);
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

function readOverrides() {
  try {
    const src = fs.readFileSync(OVERRIDES_FILE, 'utf8');
    const start = src.indexOf('{');
    const end = src.lastIndexOf('}');
    if (start === -1 || end === -1) return {};
    return JSON.parse(src.slice(start, end + 1));
  } catch (e) {
    console.warn('[Overrides] read error:', e.message);
    return {};
  }
}

function writeOverrides(obj) {
  const header = '// ⚠️ অ্যাডমিন প্যানেল থেকে দেওয়া সঠিক নামের তালিকা — সার্ভার নিজে থেকে লিখে\n';
  fs.writeFileSync(OVERRIDES_FILE, header + 'const PDF_NAME_OVERRIDES = ' + JSON.stringify(obj, null, 2) + ';\n');
}

function handlePdfList(req, res) {
  try {
    const overrides = readOverrides();
    const files = fs.readdirSync(path.join(ROOT, 'pdfs'))
      .filter(f => f.endsWith('.pdf'))
      .sort()
      .map(f => ({
        pdf: 'pdfs/' + f,
        file_name: f,
        size: fs.statSync(path.join(ROOT, 'pdfs', f)).size,
        names: overrides['pdfs/' + f] || []
      }));
    sendJson(res, 200, { ok: true, files, overrides });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: e.message });
  }
}

function handlePdfNames(req, res) {
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const pdf = String(payload.pdf || '');
      const names = Array.isArray(payload.names) ? payload.names.map(n => String(n).trim()).filter(Boolean) : [];
      if (!pdf || !pdf.startsWith('pdfs/') || !fs.existsSync(path.join(ROOT, pdf))) {
        return sendJson(res, 400, { ok: false, error: 'ভুল PDF পাথ' });
      }
      if (names.length > 1000) return sendJson(res, 400, { ok: false, error: 'সর্বোচ্চ ১০০০ নাম' });
      const overrides = readOverrides();
      overrides[pdf] = names;
      writeOverrides(overrides);
      console.log(`[Overrides] ${pdf}: ${names.length} টি নাম সেভ হয়েছে`);
      sendJson(res, 200, { ok: true, count: names.length });
    } catch (e) {
      sendJson(res, 500, { ok: false, error: e.message });
    }
  });
}

async function handleBulkPdfUpload(req, res) {
  const MAX_PDF_UPLOAD = 120 * 1024 * 1024; // 120 MB per request
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > MAX_PDF_UPLOAD + 1024 * 1024) {
      sendJson(res, 413, { ok: false, error: 'একসাথে অনেক বড় আপলোড — ছোট ব্যাচে করুন' });
      req.destroy();
    }
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const files = Array.isArray(payload.files) ? payload.files : [];
      if (!files.length) return sendJson(res, 400, { ok: false, error: 'কোনো ফাইল নেই' });
      if (files.length > 100) return sendJson(res, 400, { ok: false, error: 'একবারে সর্বোচ্চ ১০০ ফাইল' });

      const saved = [], failed = [];
      for (const f of files) {
        const fname = (f && f.name) || 'unknown.pdf';
        try {
          if (!f || !f.base64) throw new Error('ফাইল ডেটা নেই');
          const buf = Buffer.from(String(f.base64), 'base64');
          if (!buf.length) throw new Error('ফাইল খালি');
          if (buf.slice(0, 5).toString('latin1') !== '%PDF-') throw new Error('PDF ফাইল নয়');

          // নিরাপদ ফাইলের নাম (বাংলা নামও চলবে)
          let name = String(fname).replace(/[^a-zA-Z0-9._\u0980-\u09FF -]/g, '_').trim() || ('upload-' + Date.now());
          if (!/\.pdf$/i.test(name)) name += '.pdf';
          let finalName = name, counter = 1;
          while (fs.existsSync(path.join(ROOT, 'pdfs', finalName))) {
            finalName = name.replace(/\.pdf$/i, '') + '-' + counter + '.pdf';
            counter++;
          }
          fs.writeFileSync(path.join(ROOT, 'pdfs', finalName), buf);

          // টেক্সট লেয়ার আছে কিনা (স্ক্যান করা PDF-এ থাকে না)
          // আসল eporcha PDF-এ কনটেন্ট কমপ্রেসড থাকে, তাই pdf-parse দিয়ে চেক করা হয়
          let hasText = false;
          try {
            let pdfParse = null;
            try { pdfParse = require('pdf-parse'); } catch (e) { pdfParse = null; }
            if (pdfParse) {
              hasText = await pdfParse(buf).then(d => String(d.text || '').trim().length > 10).catch(() => false);
            }
            if (!hasText) {
              const text = buf.toString('latin1');
              const matches = text.match(/\(([^()]*)\)\s*Tj/g) || [];
              hasText = matches.join(' ').replace(/\s/g, '').length > 0;
            }
          } catch (e) { /* ignore */ }

          saved.push({ name: finalName, hasText });
          console.log('[BulkPDF] saved', finalName, hasText ? '(text layer ✓)' : '(scanned — no text)');
        } catch (e) {
          failed.push({ name: fname, error: e.message });
        }
      }

      if (saved.length) rebuildTextIndex();
      sendJson(res, 200, { ok: true, saved, failed });
    } catch (e) {
      console.error('[BulkPDF] Error:', e);
      sendJson(res, 500, { ok: false, error: 'আপলোড ব্যর্থ: ' + e.message });
    }
  });
}

function handleBulkImport(req, res) {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > MAX_UPLOAD_BYTES + 1024 * 1024) {
      sendJson(res, 413, { ok: false, error: 'ডেটা খুব বড়' });
      req.destroy();
    }
  });

  req.on('end', () => {
    try {
      const payload = JSON.parse(raw || '{}');
      const { type, records } = payload;
      if (type !== 'nid' && type !== 'khatian') {
        return sendJson(res, 400, { ok: false, error: 'ভুল টাইপ' });
      }
      if (!Array.isArray(records) || records.length === 0) {
        return sendJson(res, 400, { ok: false, error: 'কোনো রেকর্ড নেই' });
      }
      if (records.length > 20000) {
        return sendJson(res, 400, { ok: false, error: 'একসাথে সর্বোচ্চ ২০০০০ রেকর্ড' });
      }

      const existing = readUploadedRecords();
      let added = 0, skipped = 0;
      const now = new Date().toISOString();

      for (const r of records) {
        if (!r || typeof r !== 'object') { skipped++; continue; }
        if (type === 'nid') {
          if (!r.nid || !r.name) { skipped++; continue; }
          const dup = existing.some(e => e.type === 'nid' && String(e.nid) === String(r.nid)) ||
            (() => { try { const d = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8'); return d.includes('"nid": "' + String(r.nid) + '"'); } catch (e) { return false; } })();
          if (dup) { skipped++; continue; }
          existing.push({
            type: 'nid',
            sl: r.sl || (existing.length + 1),
            name: String(r.name || '').trim(),
            name_en: String(r.name_en || '').trim(),
            nid: String(r.nid).trim(),
            father: String(r.father || '').trim(),
            mother: String(r.mother || '').trim(),
            dob: String(r.dob || '').trim(),
            village: String(r.village || '').trim(),
            union: String(r.union || 'গড়াগ্রাম').trim(),
            post: String(r.post || '').trim(),
            upazila: String(r.upazila || 'কিশোরগঞ্জ').trim(),
            district: String(r.district || 'নীলফামারী').trim(),
            phone: String(r.phone || '01738782255').trim(),
            voter_no: String(r.voter_no || r.nid).trim(),
            gender: String(r.gender || '').trim(),
            occupation: String(r.occupation || '').trim(),
            search_text: String(r.search_text || '').trim(),
            pdf: String(r.pdf || 'pdfs/fallback.pdf').trim(),
            uploadedAt: now
          });
          added++;
        } else {
          if (!r.khatian_no || !r.mouza) { skipped++; continue; }
          const dup = existing.some(e => e.type === 'khatian' && String(e.khatian_no) === String(r.khatian_no) && String(e.mouza) === String(r.mouza)) ||
            (() => { try { const d = fs.readFileSync(path.join(ROOT, 'js', 'data.js'), 'utf8'); return d.includes('"khatian_no": "' + String(r.khatian_no) + '"'); } catch (e) { return false; } })();
          if (dup) { skipped++; continue; }
          existing.push({
            type: 'khatian',
            sl: r.sl || (existing.length + 1),
            khatian_no: String(r.khatian_no).trim(),
            dag_no: String(r.dag_no || '').trim(),
            owner: String(r.owner || '').trim(),
            father: String(r.father || '').trim(),
            mouza: String(r.mouza).trim(),
            jl_no: String(r.jl_no || '১২').trim(),
            upazila: String(r.upazila || 'কিশোরগঞ্জ').trim(),
            district: String(r.district || 'নীলফামারী').trim(),
            division: String(r.division || 'রংপুর').trim(),
            land_type: String(r.land_type || '').trim(),
            area: String(r.area || '').trim(),
            search_text: String(r.search_text || '').trim(),
            people: Array.isArray(r.people) ? r.people : [],
            pdf: String(r.pdf || 'pdfs/fallback.pdf').trim(),
            uploadedAt: now
          });
          added++;
        }
      }

      writeUploadedRecords(existing);
      rebuildTextIndex();
      console.log(`[BulkImport] ${type}: +${added} নতুন, ${skipped} বাদ`);
      sendJson(res, 200, { ok: true, added, skipped });
    } catch (e) {
      console.error('[BulkImport] Error:', e);
      sendJson(res, 500, { ok: false, error: 'বাল্ক ইমপোর্ট ব্যর্থ: ' + e.message });
    }
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
