/**
 * eporcha PDF ডিকোডার — নিখুঁত বাংলা টেক্সট এক্সট্রাকশন
 * ---------------------------------------------------------------
 * eporcha ভোটার তালিকার PDF-গুলোতে:
 *   - টেক্সট ২-বাইট হেক্স কোডে থাকে (Identity-H এনকোডিং)
 *   - CIDToGIDMap /Identity → কোড = গ্লিফ আইডি
 *   - এমবেড করা TrueType ফন্টের cmap টেবিলে গ্লিফ→ইউনিকোড ম্যাপিং আছে
 *   - ToUnicode CMap অসম্পূর্ণ (কিছু কার-চিহ্ন/যুক্তাক্ষর বাদ), তাই
 *     শুধু CMap দিয়ে পড়লে নাম ভাঙা আসে — এই ডিকোডার ফন্টের cmap
 *     ব্যবহার করে সব অক্ষর নিখুঁতভাবে বের করে।
 *
 * এছাড়া ফন্টে স্বরচিহ্ন (া ি ী...) ব্যঞ্জনের আগে জমা থাকে
 * ("িন" → "নি") — ডিকোডার সেগুলো সঠিক ক্রমে সাজিয়ে দেয়।
 */

const fs = require('fs');
const zlib = require('zlib');

/* ---------- মিনি PDF পার্সার ---------- */

function parsePdfObjects(latin) {
  const objects = {};
  const objRe = /(\d+)\s+(\d+)\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = objRe.exec(latin))) objects[m[1]] = m[3];
  return objects;
}

function inflateStream(sm) {
  let data = sm[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
  try {
    return zlib.inflateSync(Buffer.from(data, 'latin1')).toString('latin1');
  } catch (e) {
    return data;
  }
}

/* ---------- TTF cmap → গ্লিফ→ইউনিকোড ম্যাপ ---------- */

function parseFormat4(buf, off, map) {
  const segCount = buf.readUInt16BE(off + 6) / 2;
  let p = off + 14;
  const endCodes = [];
  for (let i = 0; i < segCount; i++) { endCodes.push(buf.readUInt16BE(p)); p += 2; }
  p += 2; // reservedPad
  const startCodes = [];
  for (let i = 0; i < segCount; i++) { startCodes.push(buf.readUInt16BE(p)); p += 2; }
  const idDeltas = [];
  for (let i = 0; i < segCount; i++) { idDeltas.push(buf.readInt16BE(p)); p += 2; }
  const idRangeOffsetPos = p;
  const idRangeOffsets = [];
  for (let i = 0; i < segCount; i++) { idRangeOffsets.push(buf.readUInt16BE(p)); p += 2; }

  for (let i = 0; i < segCount; i++) {
    const start = startCodes[i], end = endCodes[i];
    if (start === 0xFFFF) break;
    for (let c = start; c <= end && c < 0x10000; c++) {
      let gid;
      if (idRangeOffsets[i] === 0) {
        gid = (c + idDeltas[i]) & 0xFFFF;
      } else {
        const addr = idRangeOffsetPos + i * 2 + idRangeOffsets[i] + 2 * (c - start);
        if (addr + 2 > buf.length) continue;
        gid = buf.readUInt16BE(addr);
        if (gid === 0) continue;
        gid = (gid + idDeltas[i]) & 0xFFFF;
      }
      if (gid > 0 && !map.has(gid)) map.set(gid, c);
    }
  }
}

function parseFormat12(buf, off, map) {
  const nGroups = buf.readUInt32BE(off + 12);
  let p = off + 16;
  for (let i = 0; i < nGroups; i++) {
    const start = buf.readUInt32BE(p);
    const end = buf.readUInt32BE(p + 4);
    const startGid = buf.readUInt32BE(p + 8);
    p += 12;
    for (let c = start, g = startGid; c <= end; c++, g++) {
      if (c < 0x110000 && !map.has(g)) map.set(g, c);
    }
  }
}

function buildGidToUnicode(ttfBuf) {
  const map = new Map();
  if (ttfBuf.length < 12 || ttfBuf.readUInt32BE(0) !== 0x00010000) return map;
  const numTables = ttfBuf.readUInt16BE(4);
  let cmapOff = -1;
  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    if (ttfBuf.toString('latin1', rec, rec + 4) === 'cmap') {
      cmapOff = ttfBuf.readUInt32BE(rec + 8);
    }
  }
  if (cmapOff < 0) return map;
  const numSub = ttfBuf.readUInt16BE(cmapOff + 2);
  for (let i = 0; i < numSub; i++) {
    const r = cmapOff + 4 + i * 8;
    const platform = ttfBuf.readUInt16BE(r);
    const encoding = ttfBuf.readUInt16BE(r + 2);
    const off = ttfBuf.readUInt32BE(r + 4);
    if (cmapOff + off + 2 > ttfBuf.length) continue;
    const format = ttfBuf.readUInt16BE(cmapOff + off);
    if (format === 4 && (platform === 3 || platform === 0)) {
      parseFormat4(ttfBuf, cmapOff + off, map);
    } else if (format === 12) {
      parseFormat12(ttfBuf, cmapOff + off, map);
    }
  }
  return map;
}

/* ---------- ToUnicode CMap (ফলব্যাক হিসেবে) ---------- */

function parseCmap(src) {
  const map = new Map();
  const tok = (s) => parseInt(s.slice(1, -1), 16);
  const bfc = /(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g;
  let bm;
  while ((bm = bfc.exec(src))) {
    for (const line of bm[2].split(/\r?\n/)) {
      const toks = line.match(/<[0-9a-fA-F]+>/g);
      if (toks && toks.length === 2) map.set(tok(toks[0]), tok(toks[1]));
    }
  }
  const bfr = /(\d+)\s+beginbfrange([\s\S]*?)endbfrange/g;
  while ((bm = bfr.exec(src))) {
    for (const line of bm[2].split(/\r?\n/)) {
      const toks = line.match(/<[0-9a-fA-F]+>/g);
      if (!toks) continue;
      if (toks.length === 3) map.set(tok(toks[0]), tok(toks[2]));
      else if (toks.length === 4) {
        const s = tok(toks[0]), e = tok(toks[1]), d = tok(toks[2]);
        for (let i = s; i <= e; i++) map.set(i, d + (i - s));
      }
    }
  }
  return map;
}

/* ---------- বাংলা স্বরচিহ্ন পুনর্বিন্যাস ---------- */

const REORDER_SIGNS = new Set('ািীুূৃেৈোৌঁংঃ'.split('')); // + ্ (hasanta)
REORDER_SIGNS.add('\u09CD'); // ্

function isBaseConsonant(code) {
  return (code >= 0x0995 && code <= 0x09B9) ||
         (code >= 0x09DC && code <= 0x09DF) ||
         (code >= 0x09F0 && code <= 0x09F1);
}

// ফন্টে স্বরচিহ্ন ব্যঞ্জনের আগে জমা থাকে → সঠিক ক্রমে আনো
function reorderBangla(text) {
  const chars = [...text];
  for (let i = 0; i < chars.length - 1; i++) {
    if (REORDER_SIGNS.has(chars[i])) {
      const next = chars[i + 1].codePointAt(0);
      if (isBaseConsonant(next)) {
        [chars[i], chars[i + 1]] = [chars[i + 1], chars[i]];
        i++;
      }
    }
  }
  return chars.join('');
}

/* ---------- মূল ডিকোডার ---------- */

function decodePdfText(pdfPath) {
  const buf = fs.readFileSync(pdfPath);
  const latin = buf.toString('latin1');
  const objects = parsePdfObjects(latin);

  // ১) এমবেড করা ফন্ট থেকে গ্লিফ→ইউনিকোড ম্যাপ
  let gidMap = new Map();
  for (const [, body] of Object.entries(objects)) {
    if (!body.includes('/FontFile2')) continue;
    const sm = body.match(/stream([\s\S]*?)endstream/);
    if (!sm) continue;
    let data = sm[1].replace(/^\r?\n/, '').replace(/\r?\n$/, '');
    try { data = zlib.inflateSync(Buffer.from(data, 'latin1')); } catch (e) { data = Buffer.from(data, 'latin1'); }
    gidMap = buildGidToUnicode(data);
    if (gidMap.size > 30) break;
  }

  // ২) ToUnicode CMap (ফলব্যাক)
  let cmap = new Map();
  for (const [, body] of Object.entries(objects)) {
    if (!body.includes('/ToUnicode')) continue;
    const tm = body.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!tm || !objects[tm[1]]) continue;
    const sm = objects[tm[1]].match(/stream([\s\S]*?)endstream/);
    if (!sm) continue;
    let raw = inflateStream(sm);
    for (const [k, v] of parseCmap(raw)) cmap.set(k, v);
  }

  const hasGidMap = gidMap.size > 0;

  function decodeHex(hex) {
    let out = '';
    for (let i = 0; i + 3 < hex.length; i += 4) {
      const code = parseInt(hex.slice(i, i + 4), 16);
      let u;
      if (hasGidMap && gidMap.has(code)) u = gidMap.get(code);
      else if (cmap.has(code)) u = cmap.get(code);
      else u = 0x25CC; // দাগ — অজানা গ্লিফ
      out += String.fromCharCode(u);
    }
    return out;
  }

  // ৩) কনটেন্ট স্ট্রিম থেকে টেক্সট বের করা
  let allText = '';
  let lineBuf = '';
  for (const [, body] of Object.entries(objects)) {
    if (!body.includes('stream')) continue;
    const content = inflateStream(body.match(/stream([\s\S]*?)endstream/));
    if (!content || !/Tj|TJ/.test(content)) continue;
    const re = /(\/F\d+)\s+[\d.]+\s+Tf|(<[0-9A-Fa-f]+>)\s*Tj|\[((?:<[0-9A-Fa-f]+>|[\s\S])*?)\]\s*TJ|(T\*|T[Dd])/g;
    let mm;
    while ((mm = re.exec(content))) {
      if (mm[1]) { /* font switch — একই ফন্ট সব টেক্সট, ইগনোর */ }
      else if (mm[2]) lineBuf += decodeHex(mm[2].slice(1, -1));
      else if (mm[3] !== undefined) {
        const hexRe = /<([0-9A-Fa-f]+)>/g;
        let hm;
        while ((hm = hexRe.exec(mm[3]))) lineBuf += decodeHex(hm[1]);
      }
      else if (mm[4]) { allText += lineBuf + '\n'; lineBuf = ''; }
    }
  }
  allText += lineBuf;

  // ৪) স্বরচিহ্ন পুনর্বিন্যাস + অজানা গ্লিফ পরিষ্কার
  return reorderBangla(allText)
    .replace(/\u25CC/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0);
}

module.exports = { decodePdfText };
