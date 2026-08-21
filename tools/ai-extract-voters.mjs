/**
 * ভোটার তালিকার PDF → AI (Groq/Gemini) → নাম ও ভোটার নং এক্সট্রাকশন
 * ----------------------------------------------------------------
 * OCR (Tesseract) বাংলা লেখায় প্রায়ই ভুল করে। এই টুল PDF-এর পেজগুলো
 * AI-কে পাঠিয়ে সাজানো JSON (নাম, ভোটার নং, পিতা, মাতা, জন্ম তারিখ,
 * ঠিকানা) আনে — তারপর আগের মতোই js/pdf-voter-entries.js ও
 * js/pdf-name-overrides.js ফাইলে সেভ হয় (সার্চ instant থাকে)।
 *
 * দুই প্রোভাইডার:
 *  - groq (ডিফল্ট): প্রতি পেজ PNG ছবি হয়ে ব্যাচে vision মডেলে যায়
 *  - gemini       : PDF-চাংক সরাসরি যায় (application/pdf)
 *
 * ব্যবহার: node tools/ai-extract-voters.mjs <pdf-পাথ> [--save] [--json]
 * কনফিগ:  ai-config.json (দেখুন ai-lib.mjs) — env: AI_PROVIDER/AI_API_KEY/AI_MODEL
 * টেস্ট:   api_key "mock" দিলে নেটওয়ার্ক ছাড়া নকল এন্ট্রি
 */

import fs from 'fs';
import path from 'path';
import {
  ROOT, loadConfig, openPdf, renderPagePng, slicePagesPdf,
  normalizeEntry, dedupeEntries, callAi, parseJsonBlock, saveEntries, toBn, sleep
} from './ai-lib.mjs';

const PROMPT = `আপনি বাংলাদেশের ভোটার তালিকার (ইপর্চা/eporcha) পেজ পড়ার বিশেষজ্ঞ। সংযুক্ত পেজগুলো মনোযোগ দিয়ে পড়ে প্রতিটি ভোটারের পূর্ণ তথ্য JSON আকারে বের করুন।

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
1. সব লেখা পেজে যেমন আছে হুবহু তেমনই লিখুন — বানান নিজে থেকে বদলাবেন না।
2. সংখ্যা ও তারিখ বাংলা অঙ্কে (০১২৩৪৫৬৭৮৯) দিন।
3. কোনো তথ্য না পেলে খালি স্ট্রিং "" দিন — আন্দাজে/কল্পনা করে কিছু লিখবেন না।
4. পেজে যতজন ভোটার আছে সবাইকে দিন — একজনও বাদ দেবেন না, কাউকে দুইবার দেবেন না। পেজের ক্রম অনুযায়ী সাজান।
5. শুধুমাত্র JSON দিন, অন্য কোনো ব্যাখ্যা না: {"voters": [ ... ]}`;

function extractVotersFromJson(parsed) {
  const voters = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.voters) ? parsed.voters : []);
  return voters || [];
}

/* ---------- Groq: পেজ-ছবি ব্যাচে এক্সট্রাকশন ---------- */
// pages: 1-ইনডেক্সড [from..to]। উত্তর কাটা পড়লে ব্যাচ অর্ধেক করে আবার।
async function extractRangeGroq(cfg, buf, from, to, depth = 0) {
  const doc = openPdf(buf);
  const images = [];
  for (let p = from; p <= to; p++) images.push(renderPagePng(doc, p - 1, 2.5).toString('base64'));
  console.log(`[AI] পড়ছি: পেজ ${from}-${to} (Groq vision, ${images.length}টি ছবি)`);

  const res = await callAi(cfg, { text: PROMPT, images, maxTokens: 8192 });
  let voters;
  let broken = false;
  try {
    voters = extractVotersFromJson(parseJsonBlock(res.text));
  } catch (e) {
    broken = true;
  }
  if (res.finish === 'length') broken = true;

  const n = to - from + 1;
  if (broken && n > 1 && depth < 3) {
    const mid = Math.floor((from + to) / 2);
    console.log(`[AI] ✂️ পেজ ${from}-${to}-এর উত্তর কাটা পড়েছিল — দুই ভাগে পড়ছি`);
    const l = await extractRangeGroq(cfg, buf, from, mid, depth + 1);
    const r = await extractRangeGroq(cfg, buf, mid + 1, to, depth + 1);
    return [...l, ...r];
  }
  return voters || [];
}

/* ---------- Gemini: PDF-চাংক এক্সট্রাকশন ---------- */
async function extractRangeGemini(cfg, buf, from, to, depth = 0) {
  const pdfB64 = slicePagesPdf(buf, from, to);
  const res = await callAi(cfg, { text: PROMPT, pdfB64 });
  let voters;
  let broken = false;
  try {
    voters = extractVotersFromJson(parseJsonBlock(res.text));
  } catch (e) {
    broken = true;
  }
  if (res.finish === 'MAX_TOKENS') broken = true;

  const n = to - from + 1;
  if (broken && n > 6 && depth < 2) {
    const mid = Math.floor((from + to) / 2);
    console.log(`[AI] ✂️ পেজ ${from}-${to}-এর উত্তর কাটা পড়েছিল — দুই ভাগে পড়ছি`);
    const l = await extractRangeGemini(cfg, buf, from, mid, depth + 1);
    const r = await extractRangeGemini(cfg, buf, mid + 1, to, depth + 1);
    return [...l, ...r];
  }
  return voters || [];
}

/* ---------- মূল এক্সট্রাকশন ---------- */
export async function extractPdf(cfg, pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const total = openPdf(buf).countPages();
  const isGroq = cfg.provider !== 'gemini';
  const step = isGroq ? cfg.groq_pages : cfg.chunk_pages;
  const chunks = [];
  for (let start = 1; start <= total; start += step) {
    chunks.push([start, Math.min(start + step - 1, total)]);
  }
  console.log(`[AI] পড়া শুরু: ${path.basename(pdfPath)} (${total} পেজ, ${chunks.length}টি ব্যাচ, ${cfg.provider}/${cfg.model})`);

  const all = [];
  for (let i = 0; i < chunks.length; i++) {
    const [from, to] = chunks[i];
    const voters = isGroq
      ? await extractRangeGroq(cfg, buf, from, to)
      : await extractRangeGemini(cfg, buf, from, to);
    all.push(...voters);
    console.log(`[AI] ব্যাচ ${i + 1}/${chunks.length} সম্পন্ন (পেজ ${from}-${to}) — ${voters.length} জন`);
  }

  return dedupeEntries(all.map((e) => normalizeEntry(e)).filter(Boolean));
}

/* ---------- মক মোড (পাইপলাইন টেস্ট, নেটওয়ার্ক লাগে না) ---------- */
async function extractPdfMock(cfg, pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const total = openPdf(buf).countPages();
  console.log(`[AI-MOCK] নকল মোড — ${total} পেজ, ${cfg.groq_pages} পেজ/ব্যাচ`);
  const all = [];
  for (let p = 1; p <= total; p++) {
    for (let v = 1; v <= 17; v++) {
      const n = (p - 1) * 17 + v;
      const e = normalizeEntry({
        serial: String(n).padStart(4, '0'),
        name: `মক-ভোটার ${toBn(n)}`,
        voter_no: String(1000000000000 + n),
        father: 'মক পিতা',
        mother: 'মক মাতা',
        occupation: 'মক পেশা',
        dob: '০১/০১/১৯৯০',
        address: 'মক ঠিকানা'
      });
      if (e) all.push(e);
    }
  }
  await sleep(300);
  return all;
}

/* ---------- CLI (শুধু সরাসরি চালালে; ai-find-person.mjs import করলে না) ---------- */
const pdfArg = process.argv[2];
if (pdfArg && process.argv[1] && import.meta.url === new URL('file://' + path.resolve(process.argv[1])).href) {
  const cfg = loadConfig();
  const pdfPath = path.resolve(ROOT, pdfArg);

  if (!fs.existsSync(pdfPath)) {
    console.error('✗ PDF পাওয়া যায়নি: ' + pdfPath);
    process.exit(1);
  }
  if (!cfg.api_key) {
    console.error('✗ API key নেই। ai-config.json ফাইলে {"provider":"groq","api_key":"gsk_..."} দিন বা AI_API_KEY এনভায়রনমেন্ট সেট করুন।');
    console.error('  Groq ফ্রি key: https://console.groq.com/keys');
    process.exit(2);
  }

  let relPdf = pdfPath.replace(/^\.?\/+/, '').replace(/\\/g, '/');
  if (!relPdf.startsWith('pdfs/')) relPdf = 'pdfs/' + path.basename(pdfPath);

  const t0 = Date.now();
  try {
    const entries = cfg.is_mock
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
}
