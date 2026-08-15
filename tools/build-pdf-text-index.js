#!/usr/bin/env node
/**
 * PDF → টেক্সট ইনডেক্স জেনারেটর
 * --------------------------------------
 * pdfs/ ফোল্ডারের প্রতিটি PDF থেকে টেক্সট বের করে js/pdf-text-index.js তৈরি করে।
 * নতুন PDF ফাইল pdfs/ ফোল্ডারে দিলে এই কমান্ডটি আবার চালান:
 *
 *     node tools/build-pdf-text-index.js
 *
 * ইনডেক্স ফাইলটি app.js ব্যবহার করে — তাই নামের যেকোনো অংশ, NID ইত্যাদি দিয়ে
 * খুঁজলেই ডেটাবেজ + PDF আর্কাইভ দুই জায়গা থেকেই ফলাফল আসে।
 */

const fs = require('fs');
const path = require('path');

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

// PDF থেকে টেক্সট লাইন বের করা
// - "% ..." কমেন্ট লাইন
// - "(...) Tj" পেজ কনটেন্ট স্ট্রিম
function extractLines(pdfPath) {
  const buf = fs.readFileSync(pdfPath, 'latin1');
  const lines = [];
  for (const m of buf.matchAll(/\(([^()]*)\)\s*Tj/g)) lines.push(m[1].trim());
  for (const m of buf.matchAll(/%[ ]*([^\r\n]+)/g)) lines.push(m[1].trim());
  return [...new Set(lines)].filter(l => l && !/^PDF-\d/.test(l) && !/^%EOF/.test(l));
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

const entries = [];
for (const file of fs.readdirSync(PDF_DIR).sort()) {
  if (!file.endsWith('.pdf')) continue;
  const lines = extractLines(path.join(PDF_DIR, file));
  const name = guessName(lines);
  const nid = guessNid(lines);
  const nameBn = NAME_BN_OVERRIDES[file] || '';
  const text = [...lines, nameBn].filter(Boolean).join(' ');
  entries.push({ pdf: `pdfs/${file}`, name, name_bn: nameBn, nid, text });
  console.log('✓', file, '→', text.slice(0, 70));
}

const header = `// ⚠️ স্বয়ংক্রিয়ভাবে তৈরি ফাইল — নিজে এডিট করবেন না।
// pdfs/ ফোল্ডারের PDF থেকে টেক্সট বের করে এই সার্চ ইনডেক্স তৈরি হয়েছে।
// পুনরায় তৈরি করতে: node tools/build-pdf-text-index.js
`;
const body = `const PDF_TEXT_INDEX = ${JSON.stringify(entries, null, 2)};

const PDF_TEXT_BY_PDF = {};
PDF_TEXT_INDEX.forEach(e => { PDF_TEXT_BY_PDF[e.pdf] = e.text; });
`;
fs.writeFileSync(OUT_FILE, header + body + '\n');
console.log('\nলেখা হয়েছে:', path.relative(ROOT, OUT_FILE), `(${entries.length} টি PDF)`);
