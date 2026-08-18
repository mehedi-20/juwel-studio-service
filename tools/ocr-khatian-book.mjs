/**
 * খতিয়ান বই PDF → OCR → পরিষ্কার টেক্সট
 * -------------------------------------------------------------
 * eporcha-র খতিয়ান বই PDF-এর ফন্ট এনকোডিং ভাঙা থাকে (যেমন "মািলেকর নাম")।
 * এই টুল প্রতিটি পেজ ছবি হিসেবে রেন্ডার করে (mupdf) এবং tesseract.js দিয়ে
 * বাংলা OCR করে পরিষ্কার টেক্সট বের করে — তারপর pdf-text-index.js-এ
 * ভাঙা টেক্সটের বদলে পরিষ্কার টেক্সট বসিয়ে দেয়, যাতে নাম/খতিয়ান নং দিয়ে
 * সার্চ করা যায়।
 *
 * ব্যবহার: node tools/ocr-khatian-book.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import mupdf from 'mupdf';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');

const BEN_DATA = path.join(
  path.dirname(require.resolve('@tesseract.js-data/ben/package.json')),
  '4.0.0'
);
const CORE_PATH = path.join(ROOT, 'node_modules', 'tesseract.js-core', 'tesseract-core-lstm.wasm.js');

function renderPageToPng(page, scale = 2.5) {
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

async function main() {
  const files = fs.readdirSync(path.join(ROOT, 'pdfs')).filter(f => f.endsWith('.html.pdf'));
  if (!files.length) {
    console.log('খতিয়ান বই PDF পাওয়া যায়নি (.html.pdf)');
    return;
  }
  const f = files[0];
  const pdfPath = 'pdfs/' + f;
  const fullPath = path.join(ROOT, pdfPath);
  const buf = fs.readFileSync(fullPath);
  const doc = mupdf.Document.openDocument(buf, 'application/pdf');
  const pageCount = doc.countPages();
  console.log('OCR শুরু:', pdfPath, '| পেজ:', pageCount);

  const worker = await createWorker('ben', 1, {
    langPath: BEN_DATA,
    gzip: true,
    corePath: CORE_PATH,
    cacheMethod: 'none'
  });

  let fullText = '';
  const t0 = Date.now();
  try {
    for (let i = 0; i < pageCount; i++) {
      const page = doc.loadPage(i);
      const png = renderPageToPng(page, 2.5);
      const { data } = await worker.recognize(png);
      fullText += data.text + '\n';
      if (i % 10 === 9 || i === pageCount - 1) {
        console.log(`[OCR] ${i + 1}/${pageCount} পেজ (${Math.round((Date.now() - t0) / 1000)}সে)`);
      }
    }
  } finally {
    await worker.terminate();
  }

  const clean = fullText.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  console.log('OCR টেক্সট অক্ষর:', clean.length);
  console.log('--- নমুনা ---');
  console.log(clean.slice(0, 500));

  // pdf-text-index.js-এ এন্ট্রির text আপডেট (ভাঙা টেক্সটের বদলে)
  const idxFile = path.join(ROOT, 'js', 'pdf-text-index.js');
  const idxSrc = fs.readFileSync(idxFile, 'utf8');
  const idxFn = new Function(idxSrc + '; return PDF_TEXT_INDEX;');
  const idx = idxFn();
  const entry = idx.find(e => e.pdf === pdfPath);
  if (entry) {
    entry.text = clean;
    entry.ocr_clean = true;
  } else {
    idx.push({
      pdf: pdfPath,
      file_name: f,
      name: '২৬ নং উত্তর চাঁদখানা খতিয়ান বই',
      name_bn: '২৬ নং উত্তর চাঁদখানা খতিয়ান বই (এস এ)',
      nid: '',
      names: [],
      voters: [],
      text: clean,
      ocr_clean: true
    });
  }

  const header = '// ⚠️ স্বয়ংক্রিয়ভাবে তৈরি ফাইল — নিজে এডিট করবেন না।\n// pdfs/ ফোল্ডারের PDF থেকে টেক্সট + সম্ভাব্য নাম বের করে এই সার্চ ইনডেক্স তৈরি হয়েছে।\n// পুনরায় তৈরি করতে: node tools/build-pdf-text-index.js\n';
  fs.writeFileSync(idxFile, header + 'const PDF_TEXT_INDEX = ' + JSON.stringify(idx) + ';\n\nconst PDF_TEXT_BY_PDF = {};\nPDF_TEXT_INDEX.forEach(e => { PDF_TEXT_BY_PDF[e.pdf] = e.text; });\n');
  console.log('✓ ইনডেক্স আপডেট হয়েছে — খতিয়ান বইয়ের পরিষ্কার টেক্সট বসেছে');
}

main().catch(e => {
  console.error('OCR ব্যর্থ:', e);
  process.exit(1);
});
