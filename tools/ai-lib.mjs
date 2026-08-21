/**
 * AI কল শেয়ার্ড লাইব্রেরি — Groq ও Gemini দুই প্রোভাইডারই চলে
 * ------------------------------------------------------------
 * ai-extract-voters.mjs (আপলোড-টাইম পুরো PDF পড়া) এবং
 * ai-find-person.mjs (সার্চ-টাইম ব্যক্তি খোঁজা) — দুটোই এটি ব্যবহার করে।
 *
 * কনফিগ: ai-config.json → { provider: "groq"|"gemini", api_key, model,
 *          chunk_pages, request_interval_ms, groq_pages, find_pages }
 * env: AI_PROVIDER, AI_API_KEY, AI_MODEL
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';

export const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
export const CONFIG_FILE = path.join(ROOT, 'ai-config.json');
export const ENTRIES_FILE = path.join(ROOT, 'js', 'pdf-voter-entries.js');
export const OVERRIDES_FILE = path.join(ROOT, 'js', 'pdf-name-overrides.js');
export const FIND_STATE_FILE = path.join(ROOT, '.ai-find-state.json');

export const DEFAULT_MODEL_GROQ = 'meta-llama/llama-4-scout-8b-17e-instruct';
export const DEFAULT_MODEL_GEMINI = 'gemini-2.5-flash';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- কনফিগ ---------- */
export function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* নেই/ভাঙা */ }
  const provider = (process.env.AI_PROVIDER || cfg.provider || 'groq').toLowerCase() === 'gemini' ? 'gemini' : 'groq';
  const model = process.env.AI_MODEL || cfg.model || (provider === 'gemini' ? DEFAULT_MODEL_GEMINI : DEFAULT_MODEL_GROQ);
  return {
    provider,
    api_key: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GROQ_API_KEY || cfg.api_key || '',
    model,
    is_mock: (process.env.AI_API_KEY || cfg.api_key) === 'mock',
    chunk_pages: parseInt(cfg.chunk_pages, 10) > 0 ? parseInt(cfg.chunk_pages, 10) : 25,
    request_interval_ms: parseInt(cfg.request_interval_ms, 10) >= 0 ? parseInt(cfg.request_interval_ms, 10) : 2500,
    groq_pages: parseInt(cfg.groq_pages, 10) > 0 ? parseInt(cfg.groq_pages, 10) : 3,
    find_pages: parseInt(cfg.find_pages, 10) > 0 ? parseInt(cfg.find_pages, 10) : 4
  };
}

/* ---------- বাংলা অঙ্ক + এন্ট্রি পরিষ্কারকরণ ---------- */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
export const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

export function cleanField(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s'"|_\-:,;.()]+/, '')
    .replace(/[\s'"|_\-:,;.()]+$/, '')
    .trim();
}

export function normalizeEntry(e, extra = {}) {
  const entry = {
    serial: toBn(String(e.serial ?? '').replace(/[^0-9০-৯]/g, '')),
    name: cleanField(e.name),
    voter_no: toBn(String(e.voter_no ?? '').replace(/[^0-9০-৯]/g, '')),
    father: cleanField(e.father),
    mother: cleanField(e.mother),
    occupation: cleanField(e.occupation),
    dob: toBn(String(e.dob ?? '').replace(/[^0-9০-৯/.-]/g, '')),
    address: cleanField(e.address),
    ...extra
  };
  if (!entry.name && !entry.voter_no && !entry.father) return null;
  return entry;
}

export function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    const key = e.voter_no || (e.name + '|' + e.father + '|' + e.mother);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/* ---------- PDF হ্যান্ডলিং (mupdf) ---------- */
export const openPdf = (buf) => new mupdf.PDFDocument(buf);

// একটি পেজ PNG ছবিতে রেন্ডার (0-ইনডেক্সড pageIndex)
export function renderPagePng(doc, pageIndex, scale = 2.0) {
  const page = doc.loadPage(pageIndex);
  const b = page.getBounds();
  const w = Math.ceil((b[2] - b[0]) * scale);
  const h = Math.ceil((b[3] - b[1]) * scale);
  const pm = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  pm.clear(255);
  const dev = new mupdf.DrawDevice(mupdf.Matrix.scale(scale, scale), pm);
  page.run(dev, mupdf.Matrix.identity);
  dev.close();
  return Buffer.from(pm.asPNG());
}

// from..to পেজ (১-ইনডেক্সড) দিয়ে নতুন PDF-এর base64 (Gemini PDF-চাংকের জন্য)
export function slicePagesPdf(buf, from, to) {
  const src = openPdf(buf);
  const doc = new mupdf.PDFDocument();
  for (let i = from - 1; i < to && i < src.countPages(); i++) doc.graftPage(-1, src, i);
  return Buffer.from(doc.saveToBuffer('compress=yes')).toString('base64');
}

/* ---------- রেট-লিমিট পেসিং ---------- */
let lastRequestAt = 0;
export async function pacedWait(cfg) {
  const wait = cfg.request_interval_ms - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
}
export const markRequest = () => { lastRequestAt = Date.now(); };

/* ---------- JSON পার্সিং ---------- */
// মডেলের উত্তর থেকে JSON অবজেক্ট বের করা (```json ফেন্স/বাড়তি লেখা সহ্য করে)
export function parseJsonBlock(text) {
  let raw = String(text || '').replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s > -1 && e > s) raw = raw.slice(s, e + 1);
  return JSON.parse(raw); // ভাঙলে throw — কলার ঠিক করবে
}

/* ---------- Groq (OpenAI-সামঞ্জস্যপূর্ণ vision API) ---------- */
// payload: { text, images: [base64...], pdfB64, maxTokens }
// রিটার্ন: { finish: 'stop'|'length'|..., text }
export async function callGroq(cfg, payload, retries = 3) {
  const content = [{ type: 'text', text: payload.text }];
  for (const b64 of payload.images || []) {
    content.push({ type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } });
  }
  const body = {
    model: cfg.model,
    messages: [{ role: 'user', content }],
    temperature: 0,
    max_completion_tokens: payload.maxTokens || 8192,
    response_format: { type: 'json_object' },
    stream: false
  };
  const url = 'https://api.groq.com/openai/v1/chat/completions';

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      await pacedWait(cfg);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.api_key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000)
      });
      markRequest();
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data?.error?.message || ('HTTP ' + resp.status);
        if (resp.status === 401) throw new Error('Groq API key ভুল বা অবৈধ — অ্যাডমিন প্যানেলে সঠিক key দিন');
        if (resp.status === 404 || /model_not_found|decommission|does not exist/i.test(msg)) {
          throw new Error('মডেল পাওয়া যায়নি: ' + cfg.model + ' — অ্যাডমিন প্যানেলে অন্য মডেল বেছে নিন');
        }
        if (resp.status === 413) throw new Error('ছবির ব্যাচ অনেক বড় — কনফিগে groq_pages কমান');
        const retriable = resp.status === 429 || resp.status >= 500;
        if (!retriable || attempt > retries) throw new Error(msg);
        const ra = parseFloat(resp.headers.get('retry-after') || '0');
        const wait = ra > 0 ? ra * 1000 : 20000 * attempt;
        console.log(`[AI] ⚠️ Groq ${resp.status} — ${Math.round(wait / 1000)}সে পর আবার (${attempt}/${retries})`);
        await sleep(wait);
        continue;
      }
      const choice = data?.choices?.[0];
      return { finish: choice?.finish_reason || 'stop', text: choice?.message?.content || '' };
    } catch (err) {
      markRequest();
      if (/ভুল বা অবৈধ|মডেল পাওয়া যায়নি|ব্যাচ অনেক বড়/.test(String(err.message))) throw err;
      if (/fetch failed|network|ENOTFOUND|ETIMEDOUT|AbortError/i.test(String(err.message) + String(err.cause || ''))) {
        if (attempt > retries) throw new Error('Groq-এর সাথে যোগাযোগ হয়নি (ইন্টারনেট?)');
        console.log(`[AI] ⚠️ নেটওয়ার্ক সমস্যা — আবার চেষ্টা (${attempt}/${retries})`);
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

/* ---------- Gemini ---------- */
export async function callGemini(cfg, payload, retries = 3) {
  const parts = [];
  if (payload.pdfB64) parts.push({ inline_data: { mime_type: 'application/pdf', data: payload.pdfB64 } });
  if (payload.text) parts.push({ text: payload.text });
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: payload.maxTokens || 65536,
      ...(String(cfg.model).includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
    }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      await pacedWait(cfg);
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.api_key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(300000)
      });
      markRequest();
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data?.error?.message || ('HTTP ' + resp.status);
        if (resp.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) {
          throw new Error('Gemini API key ভুল বা অবৈধ — অ্যাডমিন প্যানেলে সঠিক key দিন');
        }
        if (resp.status === 404) throw new Error('মডেল পাওয়া যায়নি: ' + cfg.model);
        const retriable = resp.status === 429 || resp.status === 503 || resp.status === 500;
        if (!retriable || attempt > retries) {
          if (resp.status === 429) throw new Error('কোটা/রেট লিমিট শেষ (৪২৯) — কিছুক্ষণ পর আবার চালান। ' + msg);
          throw new Error(msg);
        }
        await sleep(30000 * attempt);
        continue;
      }
      const cand = data?.candidates?.[0];
      const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
      return { finish: cand?.finishReason || 'stop', text };
    } catch (err) {
      markRequest();
      if (/ভুল বা অবৈধ|মডেল পাওয়া যায়নি|কোটা/.test(String(err.message))) throw err;
      if (/fetch failed|network|ENOTFOUND|ETIMEDOUT|AbortError/i.test(String(err.message) + String(err.cause || ''))) {
        if (attempt > retries) throw new Error('Google-এর সাথে যোগাযোগ হয়নি (ইন্টারনেট?)');
        await sleep(15000 * attempt);
        continue;
      }
      throw err;
    }
  }
}

/* ---------- প্রোভাইডার-নির্বিশেষে কল ---------- */
export function callAi(cfg, payload) {
  return cfg.provider === 'gemini' ? callGemini(cfg, payload) : callGroq(cfg, payload);
}

/* ---------- ডেটা-ফাইল পড়া/লেখা (এন্ট্রি + ওভাররাইড) ---------- */
export function readJsObject(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const st = src.indexOf('{');
    const en = src.lastIndexOf('}');
    if (st > -1 && en > st) return JSON.parse(src.slice(st, en + 1));
  } catch (e) { /* ফাইল নেই/ভাঙা */ }
  return {};
}

export function saveEntries(relPdf, entries) {
  const entriesDb = readJsObject(ENTRIES_FILE);
  entriesDb[relPdf] = entries;
  fs.writeFileSync(ENTRIES_FILE,
    '// ⚠️ AI (Groq/Gemini)/OCR দিয়ে পড়া ভোটার তালিকা — সার্ভার নিজে থেকে লিখে (হাতে এডিট করবেন না)\n' +
    'const PDF_VOTER_ENTRIES = ' + JSON.stringify(entriesDb, null, 2) + ';\n');

  const overrides = readJsObject(OVERRIDES_FILE);
  overrides[relPdf] = entries.map((x) => x.name).filter(Boolean);
  fs.writeFileSync(OVERRIDES_FILE,
    '// ⚠️ অ্যাডমিন প্যানেল/AI/OCR থেকে দেওয়া সঠিক নামের তালিকা — সার্ভার নিজে থেকে লিখে\n' +
    'const PDF_NAME_OVERRIDES = ' + JSON.stringify(overrides, null, 2) + ';\n');
}
