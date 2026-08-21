/**
 * ভোটার তালিকার PDF → Google Gemini AI → নাম ও ভোটার নং এক্সট্রাকশন
 * ----------------------------------------------------------------
 * OCR (Tesseract) বাংলা লেখায় প্রায়ই ভুল করে। এই টুল PDF-কে ছোট ছোট
 * চাংকে ভাগ করে সরাসরি Google Gemini API-কে পাঠায় — Gemini নিজেই
 * ভোটার তালিকা পড়ে সাজানো JSON (নাম, ভোটার নং, পিতা, মাতা, জন্ম
 * তারিখ, ঠিকানা) ফেরত দেয়। এরপর আগের মতোই js/pdf-voter-entries.js
 * ও js/pdf-name-overrides.js ফাইলে সেভ হয় — সার্চ instant থাকে।
 *
 * ব্যবহার: node tools/ai-extract-voters.mjs <pdf-পাথ> [--save] [--json]
 * কনফিগ:  ai-config.json → { "api_key": "AIza...", "model": "gemini-2.5-flash",
 *           "chunk_pages": 25, "request_interval_ms": 7000 }
 * env:     GEMINI_API_KEY, AI_MODEL (কনফিগের উপরে প্রাধান্য পায়)
 *
 * টেস্ট মোড: api_key হিসেবে "mock" দিলে নেটওয়ার্ক ছাড়া নকল এন্ট্রি
 * তৈরি হয় (পাইপলাইন পরীক্ষার জন্য)।
 */

import fs from 'fs';
import path from 'path';
import mupdf from 'mupdf';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const CONFIG_FILE = path.join(ROOT, 'ai-config.json');
const ENTRIES_FILE = path.join(ROOT, 'js', 'pdf-voter-entries.js');
const OVERRIDES_FILE = path.join(ROOT, 'js', 'pdf-name-overrides.js');

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_CHUNK_PAGES = 25;      // প্রতি রিকোয়েস্টে কত পেজ (আউটপুট টোকেন লিমিটের ভেতরে থাকতে)
const DEFAULT_INTERVAL_MS = 7000;    // দুই রিকোয়েস্টের মাঝে ফাঁক — ফ্রি কোটার 10 RPM-এর নিচে
const MAX_RETRIES = 4;
const MAX_OUTPUT_TOKENS = 65536;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- কনফিগ ---------- */
function loadConfig() {
  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); } catch (e) { /* নেই বা ভাঙা */ }
  return {
    api_key: process.env.GEMINI_API_KEY || cfg.api_key || '',
    model: process.env.AI_MODEL || cfg.model || DEFAULT_MODEL,
    chunk_pages: parseInt(cfg.chunk_pages, 10) > 0 ? parseInt(cfg.chunk_pages, 10) : DEFAULT_CHUNK_PAGES,
    request_interval_ms: parseInt(cfg.request_interval_ms, 10) >= 0 ? parseInt(cfg.request_interval_ms, 10) : DEFAULT_INTERVAL_MS
  };
}

/* ---------- বাংলা অঙ্ক ---------- */
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const toBn = (s) => String(s ?? '').replace(/[0-9]/g, (d) => BN_DIGITS[+d]);

/* ---------- এন্ট্রি পরিষ্কারকরণ ---------- */
// AI/OCR-এর ফাঁকা ঘরে চিহ্ন ঢুকে গেলে সেগুলো ফেলে দেওয়া
function cleanField(v) {
  return String(v ?? '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s'"|_\-:,;.()]+/, '')
    .replace(/[\s'"|_\-:,;.()]+$/, '')
    .trim();
}

function normalizeEntry(e) {
  const entry = {
    serial: toBn(String(e.serial ?? '').replace(/[^0-9০-৯]/g, '')),
    name: cleanField(e.name),
    voter_no: toBn(String(e.voter_no ?? '').replace(/[^0-9০-৯]/g, '')),
    father: cleanField(e.father),
    mother: cleanField(e.mother),
    occupation: cleanField(e.occupation),
    dob: toBn(String(e.dob ?? '').replace(/[^0-9০-৯/.-]/g, '')),
    address: cleanField(e.address)
  };
  // নাম, ভোটার নং, পিতা — তিনটাই ফাঁকা হলে এন্ট্রিটা অবৈধ
  if (!entry.name && !entry.voter_no && !entry.father) return null;
  return entry;
}

function dedupeEntries(entries) {
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

/* ---------- PDF পেজ-স্লাইসিং (mupdf দিয়ে পেজ কপি) ---------- */
// from..to পেজ (১-ইনডেক্সড, অন্তর্ভুক্ত) দিয়ে নতুন PDF-এর base64
function slicePages(buf, from, to) {
  const src = new mupdf.PDFDocument(buf);
  const doc = new mupdf.PDFDocument();
  for (let i = from - 1; i < to && i < src.countPages(); i++) doc.graftPage(-1, src, i);
  const bytes = doc.saveToBuffer('compress=yes');
  return Buffer.from(bytes).toString('base64');
}

/* ---------- Gemini API ---------- */
const PROMPT = `আপনি বাংলাদেশের ভোটার তালিকার (ইপর্চা/eporcha) PDF পড়ার বিশেষজ্ঞ। সংযুক্ত PDF-টি মনোযোগ দিয়ে পড়ে প্রতিটি ভোটারের পূর্ণ তথ্য JSON আকারে বের করুন।

প্রতিটি ভোটারের জন্য এই ঘরগুলো দিন:
- "serial": ক্রমিক নম্বর
- "name": ভোটারের পূর্ণ নাম (মোঃ / মোছাঃ / শ্রী / শ্রীমতি ইত্যাদিসহ, যেমন লেখা আছে তেমনই)
- "voter_no": ভোটার নং (বাংলা অঙ্কে, যেমন ৭৩০৬৫৯০৩৬৭৬৮)
- "father": পিতার নাম
- "mother": মাতার নাম
- "occupation": পেশা
- "dob": জন্ম তারিখ (যেমন ০৩/০১/১৯৮৫)
- "address": ঠিকানা

কঠোর নিয়ম:
1. সব লেখা PDF-এ যেমন আছে হুবহু তেমনই লিখুন — বানান নিজে থেকে বদলাবেন না।
2. সংখ্যা ও তারিখ বাংলা অঙ্কে (০১২৩৪৫৬৭৮৯) দিন।
3. কোনো তথ্য না পেলে খালি স্ট্রিং "" দিন — আন্দাজে/কল্পনা করে কিছু লিখবেন না।
4. PDF-এ যতজন ভোটার আছে সবাইকে দিন — একজনও বাদ দেবেন না, কাউকে দুইবার দেবেন না। পেজের ক্রম অনুযায়ী সাজান।
5. শুধুমাত্র JSON দিন, অন্য কোনো ব্যাখ্যা না: {"voters": [ ... ]}`;

// রেট-লিমিট মানার জন্য দুই রিকোয়েস্টের মাঝে ন্যূনতম ফাঁক
let lastRequestAt = 0;
async function pacedWait(cfg) {
  const wait = cfg.request_interval_ms - (Date.now() - lastRequestAt);
  if (wait > 0) await sleep(wait);
}

async function callGeminiOnce(cfg, pdfB64) {
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { inline_data: { mime_type: 'application/pdf', data: pdfB64 } },
        { text: PROMPT }
      ]
    }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // 2.5 মডেলে "thinking" বন্ধ রাখলে দ্রুত ও সস্তা হয়
      ...(String(cfg.model).includes('2.5') ? { thinkingConfig: { thinkingBudget: 0 } } : {})
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.api_key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000) // ৫ মিনিট টাইমআউট
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(data?.error?.message || `HTTP ${resp.status}`);
    err.status = resp.status;
    err.apiMessage = data?.error?.message || '';
    throw err;
  }
  return data;
}

// ৪২৯ (রেট লিমিট) বা ৫০৩ হলে অপেক্ষা করে আবার চেষ্টা
async function callGemini(cfg, pdfB64) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await pacedWait(cfg);
      const out = await callGeminiOnce(cfg, pdfB64);
      lastRequestAt = Date.now();
      return out;
    } catch (err) {
      lastRequestAt = Date.now();
      lastErr = err;
      const msg = String(err.apiMessage || err.message || '');
      if (err.status === 400 && /API key not valid|API_KEY_INVALID/i.test(msg)) {
        throw new Error('API key ভুল বা অবৈধ — অ্যাডমিন প্যানেলে সঠিক key দিন');
      }
      if (err.status === 404) {
        throw new Error(`মডেল পাওয়া যায়নি: ${cfg.model} — কনফিগে সঠিক মডেলের নাম দিন`);
      }
      const retriable = err.status === 429 || err.status === 503 || err.status === 500 || /fetch failed|network|ENOTFOUND|ETIMEDOUT/i.test(msg + ' ' + err.message);
      if (!retriable || attempt === MAX_RETRIES) break;
      const wait = 30000 * attempt; // ৩০সে → ৬০সে → ৯০সে
      console.log(`[AI] ⚠️ সমস্যা (${err.status || 'নেটওয়ার্ক'}) — ${wait / 1000} সেকেন্ড পর আবার চেষ্টা (${attempt}/${MAX_RETRIES})`);
      await sleep(wait);
    }
  }
  const msg = String(lastErr?.apiMessage || lastErr?.message || '');
  if (lastErr?.status === 429) {
    throw new Error('কোটা/রেট লিমিট শেষ (৪২৯)। ফ্রি টায়ারে দিনে সীমিত বার পড়া যায় — কিছুক্ষণ পর আবার চালান, বা মডেল বদলে দেখুন। ' + msg);
  }
  throw lastErr || new Error('AI কল ব্যর্থ হয়েছে');
}

function parseAiJson(data) {
  const cand = data?.candidates?.[0];
  const finish = cand?.finishReason || '';
  const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
  let raw = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  if (s > -1 && e > s) raw = raw.slice(s, e + 1);
  let parsed;
  try { parsed = JSON.parse(raw); } catch (err) { throw new Error('AI-এর উত্তর JSON আকারে আসেনি'); }
  const voters = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.voters) ? parsed.voters : []);
  return { finish, voters };
}

/**
 * from..to পেজ পড়ে ভোটার তালিকা দেয়।
 * উত্তর টোকেন লিমিটে কাটা পড়লে (MAX_TOKENS) বা JSON ভেঙে এলে
 * পেজ-রেঞ্জটা দুই ভাগ করে আলাদা করে পড়া হয় (সর্বোচ্চ ২ স্তর)।
 */
async function extractRange(cfg, buf, from, to, depth = 0) {
  const b64 = slicePages(buf, from, to);
  const data = await callGemini(cfg, b64);
  let parsed;
  try {
    parsed = parseAiJson(data);
  } catch (e) {
    parsed = { finish: 'PARSE_ERROR', voters: [] };
  }

  const pages = to - from + 1;
  const broken = parsed.finish === 'MAX_TOKENS' || parsed.finish === 'PARSE_ERROR';
  if (broken && pages > 6 && depth < 2) {
    const mid = Math.floor((from + to) / 2);
    console.log(`[AI] ✂️ পেজ ${from}-${to}-এর উত্তর বড় হয়ে কেটে গিয়েছিল — দুই ভাগে পড়ছি`);
    const left = await extractRange(cfg, buf, from, mid, depth + 1);
    const right = await extractRange(cfg, buf, mid + 1, to, depth + 1);
    return [...left, ...right];
  }
  return parsed.voters || [];
}

/* ---------- মূল এক্সট্রাকশন ---------- */
async function extractPdf(cfg, pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const total = new mupdf.PDFDocument(buf).countPages();
  const chunks = [];
  for (let start = 1; start <= total; start += cfg.chunk_pages) {
    chunks.push([start, Math.min(start + cfg.chunk_pages - 1, total)]);
  }
  console.log(`[AI] পড়া শুরু: ${path.basename(pdfPath)} (${total} পেজ, ${chunks.length}টি চাংক, মডেল: ${cfg.model})`);

  const all = [];
  for (let i = 0; i < chunks.length; i++) {
    const [from, to] = chunks[i];
    const voters = await extractRange(cfg, buf, from, to);
    all.push(...voters);
    console.log(`[AI] চাংক ${i + 1}/${chunks.length} সম্পন্ন (পেজ ${from}-${to}) — ${voters.length} জন`);
  }

  return dedupeEntries(all.map(normalizeEntry).filter(Boolean));
}

/* ---------- মক মোড (পাইপলাইন টেস্ট, নেটওয়ার্ক লাগে না) ---------- */
async function extractPdfMock(cfg, pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const total = new mupdf.PDFDocument(buf).countPages();
  console.log(`[AI-MOCK] নকল মোড — ${total} পেজ, ${cfg.chunk_pages} পেজ/চাংক`);
  const all = [];
  for (let p = 1; p <= total; p++) {
    for (let v = 1; v <= 17; v++) {
      const n = (p - 1) * 17 + v;
      all.push(normalizeEntry({
        serial: String(n).padStart(4, '0'),
        name: `মক-ভোটার ${toBn(n)}`,
        voter_no: String(1000000000000 + n),
        father: 'মক পিতা',
        mother: 'মক মাতা',
        occupation: 'মক পেশা',
        dob: '০১/০১/১৯৯০',
        address: 'মক ঠিকানা'
      }));
    }
  }
  await sleep(300);
  return all;
}

/* ---------- সেভ (OCR টুলের মতোই একই ফরম্যাট) ---------- */
function readJsObject(file) {
  try {
    const src = fs.readFileSync(file, 'utf8');
    const st = src.indexOf('{');
    const en = src.lastIndexOf('}');
    if (st > -1 && en > st) return JSON.parse(src.slice(st, en + 1));
  } catch (e) { /* ফাইল নেই/ভাঙা */ }
  return {};
}

function saveEntries(relPdf, entries) {
  // ১) ভোটার এন্ট্রি
  const entriesDb = readJsObject(ENTRIES_FILE);
  entriesDb[relPdf] = entries;
  fs.writeFileSync(ENTRIES_FILE,
    '// ⚠️ AI (Gemini)/OCR দিয়ে পড়া ভোটার তালিকা — সার্ভার নিজে থেকে লিখে (হাতে এডিট করবেন না)\n' +
    'const PDF_VOTER_ENTRIES = ' + JSON.stringify(entriesDb, null, 2) + ';\n');

  // ২) নাম-ওভাররাইড (সার্চে নাম দিয়ে পাওয়ার জন্য)
  const overrides = readJsObject(OVERRIDES_FILE);
  overrides[relPdf] = entries.map((x) => x.name).filter(Boolean);
  fs.writeFileSync(OVERRIDES_FILE,
    '// ⚠️ অ্যাডমিন প্যানেল/AI/OCR থেকে দেওয়া সঠিক নামের তালিকা — সার্ভার নিজে থেকে লিখে\n' +
    'const PDF_NAME_OVERRIDES = ' + JSON.stringify(overrides, null, 2) + ';\n');
}

/* ---------- CLI ---------- */
const pdfArg = process.argv[2];
if (!pdfArg) {
  console.log('ব্যবহার: node tools/ai-extract-voters.mjs <pdf-পাথ> [--save] [--json]');
  process.exit(1);
}

const cfg = loadConfig();
const pdfPath = path.resolve(ROOT, pdfArg);
const isMock = cfg.api_key === 'mock';

if (!fs.existsSync(pdfPath)) {
  console.error('✗ PDF পাওয়া যায়নি: ' + pdfPath);
  process.exit(1);
}
if (!cfg.api_key) {
  console.error('✗ Gemini API key নেই। ai-config.json ফাইলে {"api_key": "AIza..."} দিন বা GEMINI_API_KEY এনভায়রনমেন্ট সেট করুন।');
  console.error('  ফ্রি key: https://aistudio.google.com/app/apikey');
  process.exit(2);
}

let relPdf = pdfArg.replace(/^\.?\/+/, '').replace(/\\/g, '/');
if (!relPdf.startsWith('pdfs/')) relPdf = 'pdfs/' + path.basename(pdfPath);

const t0 = Date.now();
try {
  const entries = isMock
    ? await extractPdfMock(cfg, pdfPath)
    : await extractPdf(cfg, pdfPath);

  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`[AI] মোট পাওয়া গেছে ${entries.length} জন ভোটার (${secs} সেকেন্ড)`);

  if (process.argv.includes('--save')) {
    saveEntries(relPdf, entries);
    console.log(`✓ সেভ হয়েছে: ${entries.length} জন (${relPdf})`);
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify(entries, null, 2));
  } else {
    entries.slice(0, 10).forEach((e) =>
      console.log(`#${e.serial} | ${e.name} | ${e.voter_no} | পিতা: ${e.father || '?'}`)
    );
    if (entries.length > 10) console.log('... আরও', entries.length - 10, 'জন');
  }
} catch (err) {
  console.error('✗ ' + (err.message || err));
  process.exit(3);
}
