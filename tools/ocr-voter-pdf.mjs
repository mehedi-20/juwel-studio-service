/**
 * ভোটার তালিকার PDF → OCR → নাম ও ভোটার নং এক্সট্রাকশন
 * -------------------------------------------------------------
 * eporcha PDF-এর ফন্ট এনকোডিং ভাঙা থাকায় সাধারণ টেক্সট এক্সট্রাকশনে
 * নাম ভাঙা আসে। এই টুল PDF-এর প্রতিটি পেজ ছবি হিসেবে রেন্ডার করে
 * (mupdf) এবং tesseract.js দিয়ে বাংলা OCR করে নিখুঁত নাম বের করে।
 *
 * ব্যবহার: node tools/ocr-voter-pdf.mjs <pdf-পাথ> [--json]
 * আউটপুট: { entries: [{serial, name, voter_no, father, mother, occupation, dob, address}], text }
 */

import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import mupdf from 'mupdf';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

// CDN-এ অ্যাক্সেস না থাকলে লোকাল traineddata + core ব্যবহার
const BEN_DATA = path.join(
  path.dirname(require.resolve('@tesseract.js-data/ben/package.json')),
  '4.0.0'
);
const CORE_PATH = path.join(ROOT, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.wasm.js');

function renderPageToPng(page, scale = 3.0) {
  const bounds = page.getBounds();
  const w = Math.ceil((bounds[2] - bounds[0]) * scale);
  const h = Math.ceil((bounds[3] - bounds[1]) * scale);
  const matrix = mupdf.Matrix.scale(scale, scale);
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
  pixmap.clear(255);
  const dev = new mupdf.DrawDevice(matrix, pixmap);
  page.run(dev, mupdf.Matrix.identity);
  dev.close();
  return pixmap.asPNG();
}

// OCR টেক্সট থেকে ভোটার এন্ট্রি পার্স (৩-কলাম লেআউট সাপোর্ট)
function parseEntries(text) {
  const out = [];

  const seq = (re) => {
    const arr = [];
    let m;
    const rx = new RegExp(re, 'g');
    while ((m = rx.exec(text))) if (m[1]) arr.push(m[1].trim());
    return arr;
  };

  // ক্রমিক + নাম (একই লাইনে একাধিক কলামও ধরে)
  const serials = [];
  const names = [];
  {
    const re = /([0-9০-৯]{4})\.\s*নাম\s*[:ঃ]?\s*([^\n]*?)(?=\s*[0-9০-৯]{4}\.\s*নাম|\n|$)/g;
    let m;
    while ((m = re.exec(text))) {
      serials.push(m[1]);
      names.push(m[2].trim());
    }
  }

  const voter_nos = seq(/ভোটার\s*(?:নং|নম্বর|সংখ্যা)\s*[:ঃ]?\s*([০-৯]{10,17})/g);
  const fathers = seq(/পিতা\s*[:ঃ]?\s*([^\n]*?)(?=\s*পিতা\s*[:ঃ]|\n|$)/g);
  const mothers = seq(/মাতা\s*[:ঃ]?\s*([^\n]*?)(?=\s*মাতা\s*[:ঃ]|\n|$)/g);
  const occs = seq(/পেশা\s*[:ঃ]?\s*([^\n]*?)(?=\s*পেশা\s*[:ঃ]|\n|$)/g);
  const addrs = seq(/ঠিকানা\s*[:ঃ]?\s*([^\n]*?)(?=\s*\/?ঠিকানা\s*[:ঃ]|\n|$)/g);

  // পেশা থেকে জন্ম তারিখ আলাদা
  const occupations = [], dobs = [];
  for (const o of occs) {
    const parts = o.split(/[,]?\s*জ[্ন্য]*ম\s*তারিখ\s*[:ঃ]?\s*/);
    occupations.push((parts[0] || '').trim());
    dobs.push((parts[1] || '').replace(/[^\d০-৯/.-]/g, '').trim());
  }

  for (let i = 0; i < names.length; i++) {
    out.push({
      serial: serials[i] || '',
      name: names[i],
      voter_no: voter_nos[i] || '',
      father: fathers[i] || '',
      mother: mothers[i] || '',
      occupation: occupations[i] || '',
      dob: dobs[i] || '',
      address: addrs[i] || ''
    });
  }
  return out;
}

async function ocrPdf(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pageCount = doc.countPages();
  let fullText = '';

  const worker = await createWorker('ben', 1, {
    langPath: BEN_DATA,
    gzip: true,
    corePath: CORE_PATH,
    cacheMethod: 'none'
  });
  try {
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const png = renderPageToPng(page, 3.0);
      const { data } = await worker.recognize(png);
      fullText += data.text + '\n';
      if (process.env.DEBUG_OCR) console.log(`[OCR] পেজ ${i + 1}/${pageCount} সম্পন্ন`);
    }
  } finally {
    await worker.terminate();
  }

  const entries = parseEntries(fullText);
  return { entries, text: fullText };
}

// CLI ব্যবহার
const pdfArg = process.argv[2];
if (pdfArg) {
  const pdfPath = path.resolve(ROOT, pdfArg);
  const saveMode = process.argv.includes('--save');
  const maxPages = process.env.OCR_MAX_PAGES ? parseInt(process.env.OCR_MAX_PAGES, 10) : 0;
  console.log('OCR চলছে:', pdfArg, saveMode ? '(সেভ মোড)' : '');

  const buf = fs.readFileSync(pdfPath);
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pageCount = maxPages > 0 ? Math.min(doc.countPages(), maxPages) : doc.countPages();
  let fullText = '';
  const t0 = Date.now();

  const worker = await createWorker('ben', 1, { langPath: BEN_DATA, gzip: true, corePath: CORE_PATH, cacheMethod: 'none' });
  try {
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const png = renderPageToPng(page, 2.0);
      const { data } = await worker.recognize(png);
      fullText += data.text + '\n';
      if (i % 10 === 9) console.log(`[OCR] ${i + 1}/${pageCount} পেজ (${Math.round((Date.now() - t0) / 1000)}সে)`);
    }
  } finally {
    await worker.terminate();
  }

  const result = { entries: parseEntries(fullText), text: fullText };

  if (saveMode) {
    const relPdf = pdfArg.replace(/^\.?\/+/, '').replace(/\\/g, '/');
    if (!relPdf.startsWith('pdfs/')) relPdf = 'pdfs/' + path.basename(pdfPath);

    // ১) ভোটার এন্ট্রি ফাইলে সেভ
    const entriesFile = path.join(ROOT, 'js', 'pdf-voter-entries.js');
    let entriesDb = {};
    try {
      const src = fs.readFileSync(entriesFile, 'utf8');
      const st = src.indexOf('{'), en = src.lastIndexOf('}');
      if (st > -1 && en > -1) entriesDb = JSON.parse(src.slice(st, en + 1));
    } catch (e) { entriesDb = {}; }
    entriesDb[relPdf] = result.entries;
    fs.writeFileSync(entriesFile,
      '// ⚠️ OCR দিয়ে পড়া ভোটার তালিকা — সার্ভার নিজে থেকে লিখে (হাতে এডিট করবেন না)\n' +
      'const PDF_VOTER_ENTRIES = ' + JSON.stringify(entriesDb, null, 2) + ';\n');

    // ২) নাম-ওভাররাইডে নামগুলো
    const overFile = path.join(ROOT, 'js', 'pdf-name-overrides.js');
    let overrides = {};
    try {
      const src = fs.readFileSync(overFile, 'utf8');
      const st = src.indexOf('{'), en = src.lastIndexOf('}');
      if (st > -1 && en > -1) overrides = JSON.parse(src.slice(st, en + 1));
    } catch (e) { overrides = {}; }
    overrides[relPdf] = result.entries.map(x => x.name).filter(Boolean);
    fs.writeFileSync(overFile,
      '// ⚠️ অ্যাডমিন প্যানেল/OCR থেকে দেওয়া সঠিক নামের তালিকা — সার্ভার নিজে থেকে লিখে\n' +
      'const PDF_NAME_OVERRIDES = ' + JSON.stringify(overrides, null, 2) + ';\n');

    console.log(`✓ সেভ হয়েছে: ${result.entries.length} জন (${relPdf})`);
  } else if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('মোট ভোটার:', result.entries.length);
    result.entries.slice(0, 10).forEach(e =>
      console.log(`#${e.serial} | ${e.name} | ${e.voter_no} | পিতা: ${e.father || '?'}`)
    );
    if (result.entries.length > 10) console.log('... আরও', result.entries.length - 10, 'জন');
  }
}

export { ocrPdf, parseEntries, renderPageToPng };
