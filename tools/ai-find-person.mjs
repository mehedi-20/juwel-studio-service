/**
 * সার্চ-টাইম AI ব্যক্তি-খোঁজা — সব PDF-এর পেজ ছবি হয়ে AI-এর চোখে স্ক্যান
 * ----------------------------------------------------------------------
 * ব্যবহার: node tools/ai-find-person.mjs "<নাম/ভোটার নং/NID>"
 *
 * কী করে: pdfs/ ফোল্ডারের প্রতিটি PDF-এর পেজগুলো ছোট ছোট ব্যাচে ছবি হিসেবে
 * AI (Groq vision / Gemini) কে পাঠায় — "এই ব্যক্তি এই পেজে আছে কি?" —
 * মিলে গেলে পূর্ণ তথ্য JSON আনে। প্রগ্রেস .ai-find-state.json ফাইলে লাইভ
 * লেখা হয়, ওয়েবসাইট সেটা পোল করে দেখায়।
 *
 * মক মোড: api_key "mock" দিলে নেটওয়ার্ক ছাড়া নকল স্ক্যান।
 */

import fs from 'fs';
import path from 'path';
import {
  ROOT, loadConfig, openPdf, renderPagePng,
  normalizeEntry, dedupeEntries, callAi, parseJsonBlock, FIND_STATE_FILE
} from './ai-lib.mjs';

const query = String(process.argv[2] || '').trim();
if (!query) {
  console.log('ব্যবহার: node tools/ai-find-person.mjs "<নাম বা ভোটার নং>"');
  process.exit(1);
}

const cfg = loadConfig();
if (!cfg.api_key) {
  console.error('✗ API key নেই — ai-config.json এ {"api_key": "..."} দিন');
  process.exit(2);
}

/* ---------- স্টেট ফাইল (ওয়েবসাইট এটা পড়ে) ---------- */
let state = {
  query,
  provider: cfg.provider,
  model: cfg.model,
  running: true,
  done: false,
  canceled: false,
  error: null,
  scanned: 0,
  total: 0,
  found: [],
  currentPdf: null,
  startedAt: Date.now(),
  finishedAt: null
};
const writeState = () => { try { fs.writeFileSync(FIND_STATE_FILE, JSON.stringify(state)); } catch (e) {} };
writeState();

const readCancelFlag = () => {
  try { return Boolean(JSON.parse(fs.readFileSync(FIND_STATE_FILE, 'utf8')).cancel); } catch (e) { return false; }
};

/* ---------- টার্গেট তালিকা: আগে যেগুলো এখনো পড়া হয়নি, তার ভোটার-তালিকা (com_) আগে ---------- */
const ENTRIES_FILE = path.join(ROOT, 'js', 'pdf-voter-entries.js');
function readEntriesDb() {
  try {
    const src = fs.readFileSync(ENTRIES_FILE, 'utf8');
    const s = src.indexOf('{'), e = src.lastIndexOf('}');
    return (s > -1 && e > s) ? JSON.parse(src.slice(s, e + 1)) : {};
  } catch (err) { return {}; }
}

const entriesDb = readEntriesDb();
const allPdfs = fs.readdirSync(path.join(ROOT, 'pdfs')).filter(f => f.endsWith('.pdf')).sort();
const targets = allPdfs
  .map(f => {
    const rel = 'pdfs/' + f;
    const buf = fs.readFileSync(path.join(ROOT, 'pdfs', f));
    const pages = openPdf(buf).countPages();
    const indexed = Object.prototype.hasOwnProperty.call(entriesDb, rel);
    const voterList = f.includes('com_');
    return { rel, f, buf, pages, indexed, voterList };
  })
  .sort((a, b) =>
    (Number(a.indexed) - Number(b.indexed)) ||          // আগে না-পড়াগুলো
    (Number(b.voterList) - Number(a.voterList)) ||      // তার মধ্যে ভোটার তালিকা আগে
    a.f.localeCompare(b.f)
  );
state.total = targets.reduce((s, t) => s + t.pages, 0);
writeState();
console.log(`[খোঁজা] "${query}" — ${targets.length}টি PDF, মোট ${state.total} পেজ (${cfg.provider}/${cfg.model})`);

/* ---------- প্রম্পট ---------- */
const findPrompt = (q) => `ছবিগুলো বাংলাদেশের সরকারি তালিকার (ভোটার তালিকা / খতিয়ান) পেজ।
খোঁজার বিষয়: « ${q} »

কাজ: প্রতিটি পেজে এই নাম / ভোটার নং / NID-এর সাথে মেলে এমন ব্যক্তি খুঁজুন।
- নামের আংশিক মিল ধরুন: "রহিম" দিলে "মোঃ রহিম মিয়া" মিলবে; সামান্য বানান-ভিন্নতাও ধরুন।
- একাধিক শব্দ দেওয়া থাকলে (যেমন নাম + পিতার নাম) যে ব্যক্তির সাথে সবগুলো মিলবে শুধু সে-ই।
- অঙ্ক দেওয়া থাকলে বাংলা/ইংরেজি অঙ্ক একই ধরুন (৭ = 7)।
- খতিয়ান পেজ হলে মালিকের নাম/খতিয়ান নং মিলিয়ে দিন (name এ মালিকের নাম, voter_no তে খতিয়ান নং)।

প্রতিটি মিলের জন্য দিন:
{"page": কোন ছবিতে পেলেন (1 = প্রথম ছবি, 2 = দ্বিতীয়...), "serial", "name", "voter_no", "father", "mother", "occupation", "dob", "address"}
যে তথ্য পেজে নেই সেটাতে "" দিন — আন্দাজ করবেন না।
শুধুমাত্র JSON দিন: {"found": [ ... ]} — কোথাও কিছু না মিললে {"found": []}।`;

/* ---------- মূল স্ক্যান ---------- */
function lenientPage(v, batchLen) {
  const n = parseInt(String(v ?? '').replace(/[০-৯]/g, (d) => '০১২৩৪৫৬৭৮৯'.indexOf(d)), 10);
  if (!Number.isFinite(n) || n < 1 || n > batchLen) return 1;
  return n;
}

async function scan() {
  for (const t of targets) {
    if (readCancelFlag()) { state.canceled = true; break; }
    state.currentPdf = t.rel;
    writeState();
    const foundInThisPdf = [];
    console.log(`[খোঁজা] শুরু: ${t.f} (${t.pages} পেজ${t.indexed ? '' : ', নতুন'})`);

    for (let from = 1; from <= t.pages; from += cfg.find_pages) {
      if (readCancelFlag()) break;
      const to = Math.min(from + cfg.find_pages - 1, t.pages);

      if (cfg.is_mock) {
        // মক: আসল API নেই — দ্রুত নকল অগ্রগতি + প্রথম PDF-এর ২য় ব্যাচে একবারই নকল মিল
        await new Promise((r) => setTimeout(r, 120));
        if (t === targets[0] && from > cfg.find_pages && state.found.length === 0) {
          const e = normalizeEntry({
            serial: '০০০৭', name: `${query} (মক ফলাফল)`, voter_no: '৭৩০৬৫৯৯৯৯৯৯৯',
            father: 'মক পিতা', mother: 'মক মাতা', occupation: 'গৃহিণী',
            dob: '১১/১১/১৯৯১', address: 'মক ঠিকানা, কিশোরগঞ্জ'
          }, { pdf: t.rel, page: to });
          if (e) { state.found.push(e); foundInThisPdf.push(e); }
        }
      } else {
        const doc = openPdf(t.buf);
        const images = [];
        for (let p = from; p <= to; p++) images.push(renderPagePng(doc, p - 1, 2.0).toString('base64'));
        try {
          const res = await callAi(cfg, { text: findPrompt(query), images, maxTokens: 4096 });
          const parsed = parseJsonBlock(res.text);
          const found = Array.isArray(parsed.found) ? parsed.found : [];
          for (const f of found) {
            const e = normalizeEntry(f, { pdf: t.rel, page: from + lenientPage(f.page, images.length) - 1 });
            if (e) { state.found.push(e); foundInThisPdf.push(e); }
          }
        } catch (err) {
          // একটা ব্যাচ ব্যর্থ হলে পুরো খোঁজা থামবে না — লগ করে এগিয়ে যাই
          console.log(`[খোঁজা] ⚠️ পেজ ${from}-${to}: ${err.message}`);
        }
      }

      state.scanned = Math.min(state.scanned + (to - from + 1), state.total);
      writeState();
    }

    if (state.canceled) break;
    if (foundInThisPdf.length > 0) {
      console.log(`[খোঁজা] ✓ পাওয়া গেছে ${foundInThisPdf.length} জন — ${t.f}-এ। বাকি PDF স্কিপ করা হলো`);
      break; // একটি PDF-এ পেলে থামি (একই ব্যক্তি সাধারণত একটি তালিকাতেই থাকেন)
    }
  }
}

const t0 = Date.now();
try {
  await scan();
  state.found = dedupeEntries(state.found); // একই ব্যক্তি দুইবার এলে একবারই থাকবে
  state.done = true;
  state.currentPdf = null;
  console.log(`[খোঁজা] শেষ — ${state.found.length} জন পাওয়া গেছে (${Math.round((Date.now() - t0) / 1000)} সেকেন্ড)`);
} catch (err) {
  state.error = err.message || String(err);
  console.error('✗ ' + state.error);
} finally {
  state.running = false;
  state.finishedAt = Date.now();
  try { fs.writeFileSync(FIND_STATE_FILE, JSON.stringify({ ...state, cancel: false })); } catch (e) {}
  process.exit(state.error ? 3 : 0);
}
