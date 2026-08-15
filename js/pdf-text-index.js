// ⚠️ স্বয়ংক্রিয়ভাবে তৈরি ফাইল — নিজে এডিট করবেন না।
// pdfs/ ফোল্ডারের PDF থেকে টেক্সট বের করে এই সার্চ ইনডেক্স তৈরি হয়েছে।
// পুনরায় তৈরি করতে: node tools/build-pdf-text-index.js
const PDF_TEXT_INDEX = [
  {
    "pdf": "pdfs/1979334455667.pdf",
    "name": "MD. SHAH ALAM HOWLADER",
    "name_bn": "মোঃ শাহআলম হাওলাদার",
    "nid": "1979334455667",
    "text": "MOCK NID PDF FOR MD. SHAH ALAM HOWLADER MOCK NID PDF FILE FOR MD. SHAH ALAM HOWLADER NID: 1979334455667 মোঃ শাহআলম হাওলাদার"
  },
  {
    "pdf": "pdfs/1987456123789.pdf",
    "name": "MD. JASIM UDDIN",
    "name_bn": "মোঃ জসিম উদ্দিন",
    "nid": "1987456123789",
    "text": "MOCK NID PDF FOR MD. JASIM UDDIN MOCK NID PDF FILE FOR MD. JASIM UDDIN NID: 1987456123789 মোঃ জসিম উদ্দিন"
  },
  {
    "pdf": "pdfs/1990123456789.pdf",
    "name": "RAFIQUL ISLAM",
    "name_bn": "রফিকুল ইসলাম",
    "nid": "1990123456789",
    "text": "MOCK NID PDF FOR RAFIQUL ISLAM MOCK NID PDF FILE FOR RAFIQUL ISLAM NID: 1990123456789 রফিকুল ইসলাম"
  },
  {
    "pdf": "pdfs/1993987654321.pdf",
    "name": "FATEMA KHATUN",
    "name_bn": "ফাতেমা খাতুন",
    "nid": "1993987654321",
    "text": "MOCK NID PDF FOR FATEMA KHATUN MOCK NID PDF FILE FOR FATEMA KHATUN NID: 1993987654321 ফাতেমা খাতুন"
  },
  {
    "pdf": "pdfs/2001112233445.pdf",
    "name": "SUMAIYA AKTER",
    "name_bn": "সুমাইয়া আক্তার",
    "nid": "2001112233445",
    "text": "MOCK NID PDF FOR SUMAIYA AKTER MOCK NID PDF FILE FOR SUMAIYA AKTER NID: 2001112233445 সুমাইয়া আক্তার"
  },
  {
    "pdf": "pdfs/730637009757.pdf",
    "name": "HIMANGSHU KUMAR DALIM",
    "name_bn": "",
    "nid": "730637009757",
    "text": "MOCK NID PDF FOR HIMANGSHU KUMAR DALIM MOCK NID PDF FILE FOR HIMANGSHU KUMAR DALIM NID: 730637009757"
  },
  {
    "pdf": "pdfs/730637010973.pdf",
    "name": "PARITOSH CHANDRA ROY",
    "name_bn": "",
    "nid": "730637010973",
    "text": "MOCK NID PDF FOR PARITOSH CHANDRA ROY MOCK NID PDF FILE FOR PARITOSH CHANDRA ROY NID: 730637010973"
  },
  {
    "pdf": "pdfs/730637011275.pdf",
    "name": "BROJENDRA NATH ROY",
    "name_bn": "",
    "nid": "730637011275",
    "text": "MOCK NID PDF FOR BROJENDRA NATH ROY MOCK NID PDF FILE FOR BROJENDRA NATH ROY NID: 730637011275"
  },
  {
    "pdf": "pdfs/730637011280.pdf",
    "name": "DULAL CHANDRA ROY",
    "name_bn": "",
    "nid": "730637011280",
    "text": "MOCK NID PDF FOR DULAL CHANDRA ROY MOCK NID PDF FILE FOR DULAL CHANDRA ROY NID: 730637011280"
  },
  {
    "pdf": "pdfs/730637011282.pdf",
    "name": "ADESH CHANDRA ROY",
    "name_bn": "",
    "nid": "730637011282",
    "text": "MOCK NID PDF FOR ADESH CHANDRA ROY MOCK NID PDF FILE FOR ADESH CHANDRA ROY NID: 730637011282"
  },
  {
    "pdf": "pdfs/730637011285.pdf",
    "name": "BHOLA NATH ROY",
    "name_bn": "",
    "nid": "730637011285",
    "text": "MOCK NID PDF FOR BHOLA NATH ROY MOCK NID PDF FILE FOR BHOLA NATH ROY NID: 730637011285"
  },
  {
    "pdf": "pdfs/730637011291.pdf",
    "name": "ASHWANI KUMAR ROY",
    "name_bn": "",
    "nid": "730637011291",
    "text": "MOCK NID PDF FOR ASHWANI KUMAR ROY MOCK NID PDF FILE FOR ASHWANI KUMAR ROY NID: 730637011291"
  },
  {
    "pdf": "pdfs/730637011292.pdf",
    "name": "DWARKA NATH ROY",
    "name_bn": "",
    "nid": "730637011292",
    "text": "MOCK NID PDF FOR DWARKA NATH ROY MOCK NID PDF FILE FOR DWARKA NATH ROY NID: 730637011292"
  },
  {
    "pdf": "pdfs/730637011293.pdf",
    "name": "MUKUNDA KUMAR ROY",
    "name_bn": "",
    "nid": "730637011293",
    "text": "MOCK NID PDF FOR MUKUNDA KUMAR ROY MOCK NID PDF FILE FOR MUKUNDA KUMAR ROY NID: 730637011293"
  },
  {
    "pdf": "pdfs/730637011294.pdf",
    "name": "PARIMAL CHANDRA ROY",
    "name_bn": "",
    "nid": "730637011294",
    "text": "MOCK NID PDF FOR PARIMAL CHANDRA ROY MOCK NID PDF FILE FOR PARIMAL CHANDRA ROY NID: 730637011294"
  },
  {
    "pdf": "pdfs/730637011297.pdf",
    "name": "KESHAB CHANDRA ROY",
    "name_bn": "",
    "nid": "730637011297",
    "text": "MOCK NID PDF FOR KESHAB CHANDRA ROY MOCK NID PDF FILE FOR KESHAB CHANDRA ROY NID: 730637011297"
  },
  {
    "pdf": "pdfs/730637996246.pdf",
    "name": "PODAR CHANDRA ROY",
    "name_bn": "",
    "nid": "730637996246",
    "text": "MOCK NID PDF FOR PODAR CHANDRA ROY MOCK NID PDF FILE FOR PODAR CHANDRA ROY NID: 730637996246"
  },
  {
    "pdf": "pdfs/730637996268.pdf",
    "name": "MITHUN CHANDRA ROY",
    "name_bn": "",
    "nid": "730637996268",
    "text": "MOCK NID PDF FOR MITHUN CHANDRA ROY MOCK NID PDF FILE FOR MITHUN CHANDRA ROY NID: 730637996268"
  },
  {
    "pdf": "pdfs/730637996450.pdf",
    "name": "SUBAS CHANDRA ROY",
    "name_bn": "",
    "nid": "730637996450",
    "text": "MOCK NID PDF FOR SUBAS CHANDRA ROY MOCK NID PDF FILE FOR SUBAS CHANDRA ROY NID: 730637996450"
  },
  {
    "pdf": "pdfs/fallback.pdf",
    "name": "JEWEL TELECOM E-SHEBA PLACEHOLDER DOCUMENT",
    "name_bn": "",
    "nid": "",
    "text": "JEWEL TELECOM E-SHEBA PLACEHOLDER DOCUMENT JEWEL TELECOM E-SHEBA - PLACEHOLDER DOCUMENT"
  },
  {
    "pdf": "pdfs/khatian-112.pdf",
    "name": "",
    "name_bn": "",
    "nid": "",
    "text": "MOCK S.A. E-PORCHA PDF FOR KHATIAN 112, MOUZA: UTTOR CHANDKHANA MOCK KHATIAN PDF FILE FOR KHATIAN 112 KHATIAN: 112, MOUZA: UTTOR CHANDKHANA"
  },
  {
    "pdf": "pdfs/khatian-254.pdf",
    "name": "",
    "name_bn": "",
    "nid": "",
    "text": "MOCK S.A. E-PORCHA PDF FOR KHATIAN 254, MOUZA: DAKKHIN CHANDKHANA MOCK KHATIAN PDF FILE FOR KHATIAN 254 KHATIAN: 254, MOUZA: DAKKHIN CHANDKHANA"
  },
  {
    "pdf": "pdfs/khatian-26.pdf",
    "name": "",
    "name_bn": "",
    "nid": "",
    "text": "MOCK S.A. E-PORCHA PDF FOR KHATIAN 26, MOUZA: UTTOR CHANDKHANA MOCK KHATIAN PDF FILE FOR KHATIAN 26 KHATIAN: 26, MOUZA: UTTOR CHANDKHANA"
  },
  {
    "pdf": "pdfs/khatian-71.pdf",
    "name": "",
    "name_bn": "",
    "nid": "",
    "text": "MOCK S.A. E-PORCHA PDF FOR KHATIAN 71, MOUZA: UTTOR CHANDKHANA MOCK KHATIAN PDF FILE FOR KHATIAN 71 KHATIAN: 71, MOUZA: UTTOR CHANDKHANA"
  }
];

const PDF_TEXT_BY_PDF = {};
PDF_TEXT_INDEX.forEach(e => { PDF_TEXT_BY_PDF[e.pdf] = e.text; });

