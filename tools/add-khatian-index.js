// খতিয়ান বই PDF-এর টেক্সট সরাসরি ইনডেক্সে যোগ (build tool-এর ফলব্যাক সীমাবদ্ধতার জন্য)
const fs = require('fs');
const pdfParse = require('pdf-parse');

(async () => {
  const glob = fs.readdirSync('pdfs').filter(f => f.endsWith('.html.pdf'));
  const f = 'pdfs/' + glob[0];
  const buf = fs.readFileSync(f);
  const d = await pdfParse(buf);
  const text = (d.text || '').replace(/\s+/g, ' ').trim();
  console.log('টেক্সট অক্ষর:', text.length);

  // বর্তমান ইনডেক্স লোড
  const idxSrc = fs.readFileSync('js/pdf-text-index.js', 'utf8');
  const idxFn = new Function(idxSrc + '; return PDF_TEXT_INDEX;');
  const idx = idxFn().filter(e => e.pdf !== f);

  // এন্ট্রি তৈরি — ভাঙা টেক্সটেও নাম/খতিয়ান নং খোঁজা যাবে
  idx.push({
    pdf: f,
    file_name: glob[0],
    name: '২৬ নং উত্তর চাঁদখানা খতিয়ান বই',
    name_bn: '২৬ নং উত্তর চাঁদখানা খতিয়ান বই (এস এ)',
    nid: '',
    names: [],
    voters: [],
    text
  });

  const header = '// ⚠️ স্বয়ংক্রিয়ভাবে তৈরি ফাইল — নিজে এডিট করবেন না।\n// pdfs/ ফোল্ডারের PDF থেকে টেক্সট + সম্ভাব্য নাম বের করে এই সার্চ ইনডেক্স তৈরি হয়েছে।\n// পুনরায় তৈরি করতে: node tools/build-pdf-text-index.js\n';
  fs.writeFileSync('js/pdf-text-index.js', header + 'const PDF_TEXT_INDEX = ' + JSON.stringify(idx) + ';\n\nconst PDF_TEXT_BY_PDF = {};\nPDF_TEXT_INDEX.forEach(e => { PDF_TEXT_BY_PDF[e.pdf] = e.text; });\n');
  console.log('ইনডেক্স আপডেট — মোট:', idx.length, 'টা | খতিয়ান বই যোগ হয়েছে');
})();
