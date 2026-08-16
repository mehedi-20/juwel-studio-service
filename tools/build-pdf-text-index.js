#!/usr/bin/env node
/**
 * PDF → টেক্সট ইনডেক্স জেনারেটর
 * --------------------------------------
 * pdfs/ ফোল্ডারের প্রতিটি PDF থেকে:
 *   1. টেক্সট লেয়ারের লেখা
 *   2. ফাইলের নাম (স্ক্যান করা PDF-ও ফাইলের নামে খুঁজে পাওয়া যাবে)
 *   3. সম্ভাব্য ব্যক্তির নাম (মোঃ/মোছাঃ/নাম-সাফিক্স হিউরিস্টিক)
 * বের করে js/pdf-text-index.js তৈরি করে।
 *
 * নতুন PDF আপলোড হলে সার্ভার নিজে থেকেই এই টুল চালায়।
 * হাতে চালাতে: node tools/build-pdf-text-index.js
 */

const fs = require('fs');
const path = require('path');

// সঠিক PDF টেক্সট পার্সার (বাংলা টেক্সটের জন্যও) — ইনস্টল থাকলে ব্যবহার হবে,
// না থাকলে নিচের সহজ এক্সট্রাক্টর কাজ করবে।
// ইনস্টল: npm install pdf-parse
let pdfParse = null;
try { pdfParse = require('pdf-parse'); } catch (e) { pdfParse = null; }

const ROOT = path.join(__dirname, '..');
const PDF_DIR = path.join(ROOT, 'pdfs');
const OUT_FILE = path.join(ROOT, 'js', 'pdf-text-index.js');

// মক PDF গুলোতে শুধু ইংরেজি নাম আছে — বাংলা নামের জন্য ম্যাপ
const NAME_BN_OVERRIDES = {
  '1979334455667.pdf': 'মোঃ শাহআলম হাওলাদার',
  '1987456123789.pdf': 'মোঃ জসিম উদ্দিন',
  '1990123456789.pdf': 'রফিকুল ইসলাম',
  '1993987654321.pdf': 'ফাতেমা খাতুন',
  '2001112233445.pdf': 'সুমাইয়া আক্তার'
};

// সাধারণ (নাম নয় এমন) শব্দ — নাম শনাক্তকরণে এগুলো বাদ যাবে
const STOP_WORDS = new Set((
  'খতিয়ান,মৌজা,দাগ,একর,শতাংশ,তারিখ,পর্চা,জমি,ভূমি,মালিক,দখলদার,পিতা,মাতা,স্বামী,স্ত্রী,পুত্র,কন্যা,ওয়ারিশ,হিস্যা,অংশ,সীমানা,উত্তর,দক্ষিণ,পূর্ব,পশ্চিম,নাম,ঠিকানা,গ্রাম,ইউনিয়ন,উপজেলা,জেলা,হোল্ডিং,খাজনা,সংখ্যা,ক্রমিক,সন,পৃষ্ঠা,পাতা,মোট,বর্গ,ফুট,গজ,রেকর্ড,বই,সার্ভে,নং,নম্বর,ভুমি,মালিকানা,তফসিল,খারিজ,দাখিলা,মন্তব্য,ধারা,উপখণ্ড,জোত'
).split(','));

// বাংলা নামের পরিচিত সাফিক্স/পদবি
const NAME_SUFFIXES = new Set((
  'রায়,চন্দ্র,নাথ,বেগম,খাতুন,মিয়া,শেখ,হাওলাদার,উদ্দিন,ইসলাম,হোসেন,রহমান,করিম,আলী,মণ্ডল,সরকার,প্রামাণিক,বিশ্বাস,মল্লিক,ঘোষ,দাস,সাহা,কান্ত,রঞ্জন,মোহন,শীল,পাল,বর্মণ,সূত্রধর,অধিকারী,প্রধান,সিংহ,ঠাকুর,গোস্বামী,চক্রবর্তী,দত্ত,সেন,বসু,মিত্র,ঘোষাল,দেবনাথ,ভৌমিক,কুণ্ডু,মজুমদার,হালদার,পোদ্দার,মোদক,কর্মকার,তরফদার,লস্কর,গাজী,মীর,খন্দকার,চৌধুরী,তালুকদার,পাটোয়ারী,মৃধা,মোল্লা,ফকির,সরদার,সিকদার,মোড়ল,মাতবর,বেপারী,মুন্সি,কাজী,সৈয়দ,আক্তার,নেছা,বানু,আরা,রানী,বালা,দেবী,মণি,সুলতানা,জাহান,পরভীন,আফরোজা,নাসরিন,ইয়াসমিন,রুবিনা,মারুফা,তাসলিমা,শিরিনা'
).split(','));

// সহজ (ফলব্যাক) এক্সট্রাক্টর: "% ..." কমেন্ট + "(...) Tj" পেজ কনটেন্ট
function extractLinesSimple(pdfPath) {
  const buf = fs.readFileSync(pdfPath, 'latin1');
  const lines = [];
  for (const m of buf.matchAll(/\(([^()]*)\)\s*Tj/g)) lines.push(m[1].trim());
  for (const m of buf.matchAll(/%[ ]*([^\r\n]+)/g)) lines.push(m[1].trim());
  return [...new Set(lines)].filter(l => l && !/^PDF-\d/.test(l) && !/^%EOF/.test(l));
}

// পূর্ণ টেক্সট এক্সট্রাকশন — pdf-parse থাকলে সেটা, না হলে সহজ পদ্ধতি
async function extractPdfText(pdfPath) {
  if (pdfParse) {
    try {
      const data = await pdfParse(fs.readFileSync(pdfPath));
      const text = String(data.text || '');
      if (text.trim()) return text.split(/\n+/).map(l => l.trim()).filter(Boolean);
    } catch (e) {
      console.warn('[Index] pdf-parse ব্যর্থ, সহজ পদ্ধতিতে পড়ছি:', path.basename(pdfPath));
    }
  }
  return extractLinesSimple(pdfPath);
}

function guessNid(lines) {
  for (const l of lines) {
    const m = l.match(/\b(\d{10,17})\b/);
    if (m) return m[1];
  }
  return '';
}

function guessName(lines) {
  for (const l of lines) {
    let n = l
      .replace(/^MOCK\s+(NID|KHATIAN|E-PORCHA|S\.A\.\s+E-PORCHA)\s+(PDF|DOCUMENT)?\s*(FILE)?\s*FOR\s*/i, '')
      .replace(/\s*,\s*MOUZA:.*$/i, '')
      .trim();
    if (n && !/^NID\s*:?\s*\d/i.test(n) && !/^KHATIAN\s*:?\s*\d/i.test(n)) return n;
  }
  return '';
}

// বাংলা টেক্সট থেকে সম্ভাব্য ব্যক্তির নাম বের করা (হিউরিস্টিক)
function extractCandidateNames(text) {
  const found = new Set();
  const re = /(?:মোঃ|মোছাঃ|মৃত|মো\.?)\s*[\u0980-\u09FF]+(?:\s+[\u0980-\u09FF]+){0,4}/g;
  let m;
  while ((m = re.exec(text))) {
    const cand = m[0].replace(/[।,;:()\[\]]/g, ' ').replace(/\s+/g, ' ').trim();
    if (cand.length < 4 || cand.length > 60) continue;
    if (/\d/.test(cand)) continue;
    const words = cand.split(' ');
    if (words.every(w => STOP_WORDS.has(w))) continue;
    const honorific = /^(মোঃ|মোছাঃ|মৃত|মো\.?)/.test(cand);
    const hasSuffix = words.some(w => NAME_SUFFIXES.has(w));
    if (!honorific && !hasSuffix) continue;
    found.add(cand);
  }
  return [...found].slice(0, 60);
}

(async function main() {
  const entries = [];
  const files = fs.readdirSync(PDF_DIR).sort();
  for (const file of files) {
    if (!file.endsWith('.pdf')) continue;
    const lines = await extractPdfText(path.join(PDF_DIR, file));
    const name = guessName(lines);
    const nid = guessNid(lines);
    const nameBn = NAME_BN_OVERRIDES[file] || '';
    const fileStem = file.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ');
    const names = extractCandidateNames(lines.join(' ') + ' ' + nameBn);
    const text = [fileStem, ...lines, nameBn, ...names].filter(Boolean).join(' ');
    entries.push({ pdf: `pdfs/${file}`, file_name: file, name, name_bn: nameBn, nid, names, text });
    console.log('✓', file, names.length ? `→ ${names.length} টি সম্ভাব্য নাম` : '(টেক্সট লেয়ার নেই বা নাম পাওয়া যায়নি)');
  }

  const header = `// ⚠️ স্বয়ংক্রিয়ভাবে তৈরি ফাইল — নিজে এডিট করবেন না।
// pdfs/ ফোল্ডারের PDF থেকে টেক্সট + সম্ভাব্য নাম বের করে এই সার্চ ইনডেক্স তৈরি হয়েছে।
// পুনরায় তৈরি করতে: node tools/build-pdf-text-index.js
`;
  const body = `const PDF_TEXT_INDEX = ${JSON.stringify(entries, null, 2)};

const PDF_TEXT_BY_PDF = {};
PDF_TEXT_INDEX.forEach(e => { PDF_TEXT_BY_PDF[e.pdf] = e.text; });
`;
  fs.writeFileSync(OUT_FILE, header + body + '\n');
  console.log('\nলেখা হয়েছে:', path.relative(ROOT, OUT_FILE), `(${entries.length} টি PDF)`);
})();
