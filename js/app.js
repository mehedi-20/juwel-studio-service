// Maps of the most recently rendered search results, keyed by the card
// index passed through the global onclick handlers. This lets the PDF
// viewer / download functions find records that came from Firestore
// (online mode), not only the static DATA / KHATIAN_DATA arrays.
let lastNidResults = {};
let lastKhatianResults = {};
let lastArchiveResults = [];
let lastKhatianPeople = {}; // 'k<i>' -> ব্যক্তিদের নামের অ্যারে

// PDF টেক্সট ইনডেক্স হেল্পার (js/pdf-text-index.js থেকে লোড হয়)
const pdfTextOf = (pdfPath) =>
  (typeof PDF_TEXT_BY_PDF !== 'undefined' && PDF_TEXT_BY_PDF[pdfPath]) || '';

// যে PDF গুলোর কোনো রেকর্ড ডেটাবেজে নেই — সেগুলো "আর্কাইভ"
const getArchiveEntries = () => {
  if (typeof PDF_TEXT_INDEX === 'undefined') return [];
  return PDF_TEXT_INDEX.filter(e =>
    !DATA.some(r => r.pdf === e.pdf) &&
    !KHATIAN_DATA.some(r => r.pdf === e.pdf) &&
    !(typeof UPLOADED_RECORDS !== 'undefined' && UPLOADED_RECORDS.some(r => r.pdf === e.pdf))
  );
};

document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. Firebase Connection Initialization
     ========================================================================== */
  let db = null;

  const initFirebase = () => {
    if (typeof isFirebaseConfigured !== 'undefined' && isFirebaseConfigured()) {
      try {
        if (firebase.apps.length === 0) {
          firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        
        // Enable Firestore offline persistence for absolute offline PWA capabilities!
        db.enablePersistence().catch((err) => {
          console.warn('[Firebase] Persistence error:', err.code);
        });
        
        console.log('[Firebase] successfully connected Firestore in Client App!');
      } catch (e) {
        console.error('[Firebase] Client initialization error:', e);
      }
    } else {
      console.log('[Firebase] Running in static offline mode.');
    }
  };

  initFirebase();


  /* ==========================================================================
     2. Tab Menu Switching Logic
     ========================================================================== */
  let currentTab = 'nid'; // 'nid' or 'porcha'
  const tabNid = document.getElementById('tabNid');
  const tabPorcha = document.getElementById('tabPorcha');
  const nidSearchForm = document.getElementById('nidSearchForm');
  const porchaSearchForm = document.getElementById('porchaSearchForm');
  const searchHint = document.getElementById('searchHint');
  const resultsGrid = document.getElementById('resultsGrid');
  const statusContainer = document.getElementById('searchStatus');
  const emptyState = document.getElementById('emptyState');
  
  // Search actions & triggers
  const btnSearch = document.getElementById('btnSearch');
  const btnClear = document.getElementById('btnClear');
  const advancedToggle = document.getElementById('advancedToggle');
  const advancedPanel = document.getElementById('advancedPanel');

  if (tabNid && tabPorcha) {
    tabNid.addEventListener('click', () => {
      if (currentTab === 'nid') return;
      currentTab = 'nid';
      tabNid.classList.add('active-tab');
      tabPorcha.classList.remove('active-tab');
      if (nidSearchForm) nidSearchForm.style.display = 'block';
      if (porchaSearchForm) porchaSearchForm.style.display = 'none';
      if (searchHint) {
        searchHint.innerHTML = `যেকোনো তথ্য লিখুন — নামের যেকোনো অংশ, NID, গ্রাম ইত্যাদি।`;
      }
      resetResults();
      const fName = document.getElementById('f_name');
      if (fName) fName.focus();
    });

    tabPorcha.addEventListener('click', () => {
      if (currentTab === 'porcha') return;
      currentTab = 'porcha';
      tabPorcha.classList.add('active-tab');
      tabNid.classList.remove('active-tab');
      if (porchaSearchForm) porchaSearchForm.style.display = 'block';
      if (nidSearchForm) nidSearchForm.style.display = 'none';
      if (searchHint) {
        searchHint.innerHTML = `মালিকের নামের যেকোনো অংশ, খতিয়ান/দাগ নম্বর বা মৌজা লিখুন।`;
      }
      resetResults();
      const fOwner = document.getElementById('f_owner');
      if (fOwner) fOwner.focus();
    });
  }

  // PDF আর্কাইভ সেকশন (রেকর্ডবিহীন PDF থেকে উদ্ধারকৃত টেক্সট ফলাফল)
  const archiveSection = document.getElementById('archiveSection');
  const archiveGrid = document.getElementById('archiveGrid');

  const hideArchiveSection = () => {
    lastArchiveResults = [];
    if (archiveSection) archiveSection.style.display = 'none';
    if (archiveGrid) archiveGrid.innerHTML = '';
  };

  // খতিয়ান ↔ ব্যক্তি লিংক ম্যাপ (NID → সংশ্লিষ্ট খতিয়ান রেকর্ড)
  const KHATIAN_LINKS = {};
  (function buildKhatianLinks() {
    const allK = [...KHATIAN_DATA];
    if (typeof UPLOADED_RECORDS !== 'undefined') {
      UPLOADED_RECORDS.filter(r => r.type === 'khatian').forEach(r => allK.push(r));
    }
    allK.forEach(k => {
      (k.people || []).forEach(p => {
        if (!p.nid) return;
        (KHATIAN_LINKS[String(p.nid)] = KHATIAN_LINKS[String(p.nid)] || []).push(k);
      });
    });
  })();

  // খতিয়ান কার্ডে "উল্লেখিত ব্যক্তিবর্গ" সেকশনের HTML
  function peopleSectionHtml(r, cardIndex) {
    const people = Array.isArray(r.people) ? r.people : [];
    if (!people.length) return '';
    const rows = people.map((p, pi) => `
      <div class="person-chip-row">
        <div class="person-chip">
          <span class="person-name">${esc(p.name)}</span>
          <span class="person-meta">পিতা: ${esc(p.father || '—')}${p.nid ? ' · NID: <code>' + esc(p.nid) + '</code>' : ''}${p.relation ? ' · ' + esc(p.relation) : ''}</span>
        </div>
        <div class="person-actions">
          <button class="btn-copy" title="নাম কপি করুন" onclick="copyPersonName('k${cardIndex}', ${pi})">📋</button>
          <button class="btn-copy" title="এই ব্যক্তিকে NID-তে খুঁজুন" onclick="searchPersonFrom('k${cardIndex}', ${pi})">🔎</button>
        </div>
      </div>
    `).join('');
    return `
      <div style="margin-top: 12px; border: 1.5px solid #fecaca; border-radius: 12px; background: #fff8f8; padding: 12px;">
        <div style="font-size: 0.78rem; font-weight: 800; color: var(--accent); margin-bottom: 8px; display:flex; align-items:center; gap:4px;">
          <span>👥</span> এই খতিয়ানে উল্লেখিত ব্যক্তিবর্গ (${asciiToBn(people.length)} জন)
        </div>
        ${rows}
      </div>`;
  }

  // NID কার্ডে খতিয়ান লিংক ব্যাজ
  function khatianLinksHtml(r) {
    if (!r || !r.nid) return '';
    const links = KHATIAN_LINKS[String(r.nid)] || [];
    if (!links.length) return '';
    return links.map(k => `
      <button class="khatian-link-badge" onclick="openKhatianByNid('${esc(String(r.nid))}')">
        📜 খতিয়ান নং ${esc(k.khatian_no)} (${esc(k.mouza)})-এ এই নামটি আছে — বিস্তারিত দেখুন
      </button>
    `).join('');
  }

  // খতিয়ানের ব্যক্তি তালিকা থেকে নাম কপি
  window.copyPersonName = (key, idx) => {
    const names = lastKhatianPeople[key];
    const name = names && names[idx];
    if (!name) return;
    window.copyToClipboard(name);
  };

  // খতিয়ানের ব্যক্তি তালিকা থেকে NID ট্যাবে গিয়ে ওই নামে খোঁজা
  window.searchPersonFrom = (key, idx) => {
    const names = lastKhatianPeople[key];
    const name = names && names[idx];
    if (!name) return;
    if (tabNid) tabNid.click();
    if (fields.name) fields.name.value = name;
    doSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // আর্কাইভ কার্ডের সম্ভাব্য নামে ক্লিক → NID ট্যাবে গিয়ে ওই নামে খোঁজা
  window.searchArchiveName = (name) => {
    if (!name) return;
    if (tabNid) tabNid.click();
    if (fields.name) fields.name.value = name;
    doSearch();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // NID কার্ড থেকে সংশ্লিষ্ট খতিয়ানের পূর্ণ বিবরণ মোডালে দেখানো
  window.openKhatianByNid = (nid) => {
    const links = KHATIAN_LINKS[String(nid)] || [];
    if (!links.length) return;
    const modal = document.getElementById('pdfModal');
    const modalBody = document.getElementById('modalBody');
    const modalTitle = document.getElementById('modalTitle');
    if (!modal || !modalBody) return;

    const certRow = (label, val) =>
      (val || val === 0) ? `<div class="cert-row"><span class="cert-label">${esc(label)}:</span><span class="cert-value">${esc(val)}</span></div>` : '';

    modalTitle.textContent = '📜 খতিয়ানের পূর্ণ বিবরণ';
    modalBody.innerHTML = links.map(k => `
      <div class="pdf-fallback-card" style="max-width: 600px; margin: 20px auto; box-shadow: var(--shadow-md);">
        <div class="pdf-fallback-icon" style="color: var(--accent);">📜</div>
        <h4 class="pdf-fallback-title">খতিয়ান নং: ${esc(k.khatian_no)} — ${esc(k.mouza)}</h4>
        <p class="pdf-fallback-desc">এই খতিয়ানে উল্লেখিত ব্যক্তির NID থেকে খোঁজা হয়েছে। নিচে খতিয়ানের পূর্ণ তথ্য দেওয়া হলো।</p>
        <div class="pdf-mini-certificate" style="border-color: var(--accent);">
          <div class="cert-header" style="color: #b91c1c; border-bottom-color: var(--accent);">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার - ই-পর্চা রেকর্ড</div>
          ${certRow('খতিয়ান নং', k.khatian_no)}
          ${certRow('দাগ নম্বর', k.dag_no)}
          ${certRow('মৌজা', k.mouza ? (k.mouza + (k.jl_no ? ' (জে. এল. নং: ' + k.jl_no + ')' : '')) : '')}
          ${certRow('মালিক/দখলদার', k.owner)}
          ${certRow('পিতা/স্বামী', k.father)}
          ${certRow('জমির পরিমাণ', k.area)}
          ${certRow('জমির শ্রেণী', k.land_type)}
          ${certRow('ঠিকানা', [k.upazila, k.district, k.division].filter(Boolean).join(', '))}
          ${(k.people && k.people.length) ? `
          <div class="cert-row" style="grid-template-columns: 1fr; margin-top: 8px;">
            <span class="cert-value" style="white-space: pre-wrap; font-weight: 500;">
              👥 উল্লেখিত ব্যক্তিবর্গ (${asciiToBn(k.people.length)} জন): ${esc(k.people.map(p => p.name + (p.nid ? ' (NID: ' + p.nid + ')' : '')).join(', '))}
            </span>
          </div>` : ''}
        </div>
        <button class="btn btn-primary" onclick="downloadArchivePdf('${esc(k.pdf || 'pdfs/fallback.pdf')}')" style="background: linear-gradient(135deg, var(--accent) 0%, #b91c1c 100%) !important;">
          ⬇️ পর্চা PDF ডাউনলোড করুন
        </button>
      </div>
    `).join('');
    modal.classList.add('show');
  };

  const resetResults = () => {
    if (resultsGrid) resultsGrid.innerHTML = '';
    if (statusContainer) statusContainer.innerHTML = '';
    hideArchiveSection();
    if (emptyState) {
      emptyState.style.display = 'block';
      if (currentTab === 'nid') {
        emptyState.innerHTML = `
          <div class="empty-icon">🔎</div>
          <div class="empty-title">অনুসন্ধান শুরু করুন</div>
          <p style="font-size:0.88rem;margin-top:4px">উপরে নাম ও পিতার নাম লিখে অনুসন্ধান করুন</p>
        `;
      } else {
        emptyState.innerHTML = `
          <div class="empty-icon">📖</div>
          <div class="empty-title">খতিয়ান অনুসন্ধান শুরু করুন</div>
          <p style="font-size:0.88rem;margin-top:4px">উপরে খতিয়ানের মালিকের নাম ও পিতার নাম লিখে অনুসন্ধান করুন</p>
        `;
      }
    }
  };


  /* ==========================================================================
     3. Progressive Web App (PWA) Install Logic
     ========================================================================== */
  let deferredPrompt;
  const pwaInstallBtn = document.getElementById('pwaInstallBtn');

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('[PWA] Service Worker registered successfully:', reg.scope))
        .catch(err => console.error('[PWA] Service Worker registration failed:', err));
    });
  }

  // Listen for installation prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (pwaInstallBtn) {
      pwaInstallBtn.style.display = 'inline-flex';
    }
  });

  // Click on Install App Button
  if (pwaInstallBtn) {
    pwaInstallBtn.addEventListener('click', async () => {
      if (!deferredPrompt) {
        showToast("আপনার ব্রাউজারের Menu বা Share বাটন থেকে 'Add to Home Screen' এ ক্লিক করে অ্যাপটি ইনস্টল করুন।");
        return;
      }
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`[PWA] User response to the install prompt: ${outcome}`);
      deferredPrompt = null;
      pwaInstallBtn.style.display = 'none';
    });
  }

  // Listen for successful installation
  window.addEventListener('appinstalled', (evt) => {
    console.log('[PWA] Juwel Telecom E-Sheba App was installed successfully!');
    showToast('অ্যাপটি সফলভাবে আপনার ফোনে ইনস্টল হয়েছে! 🎉');
    if (pwaInstallBtn) pwaInstallBtn.style.display = 'none';
  });


  /* ==========================================================================
     4. Search, Filter and Card Rendering System
     ========================================================================== */
  const initVillageDatalist = () => {
    const dl = document.getElementById('dl_village');
    if (!dl) return;
    const villages = [...new Set(DATA.map(r => r.village).filter(Boolean))].sort();
    dl.innerHTML = '';
    villages.forEach(v => {
      const option = document.createElement('option');
      option.value = v;
      dl.appendChild(option);
    });
  };

  initVillageDatalist();

  // Input Fields
  const fields = {
    // NID Fields
    name: document.getElementById('f_name'),
    father: document.getElementById('f_father'),
    union: document.getElementById('f_union'),
    mother: document.getElementById('f_mother'),
    dob: document.getElementById('f_dob'),
    village: document.getElementById('f_village'),
    nid: document.getElementById('f_nid'),
    
    // Porcha Fields
    owner: document.getElementById('f_owner'),
    owner_father: document.getElementById('f_owner_father'),
    khatian: document.getElementById('f_khatian'),
    dag: document.getElementById('f_dag'),
    mouza: document.getElementById('f_mouza')
  };

  // Toggle Advanced Filters
  if (advancedToggle && advancedPanel) {
    advancedToggle.addEventListener('click', () => {
      const isShowing = advancedPanel.classList.toggle('show');
      advancedToggle.classList.toggle('active', isShowing);
      const arrow = advancedToggle.querySelector('svg');
      if (arrow) {
        arrow.style.transform = isShowing ? 'rotate(180deg)' : 'rotate(0deg)';
      }
    });
  }

  // Bengali Digit to English Digit Converter and normalization
  const BN_DIGITS = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  
  function normalize(s) {
    if (s === null || s === undefined) return '';
    s = String(s).toLowerCase();
    s = s.replace(/[০-৯]/g, d => BN_DIGITS[d]);
    // য/য় সহনশীলতা: "রায়", "রায", "রা" + "য" + "়" — সব একইভাবে মিলবে
    s = s.replace(/\u09DF/g, '\u09AF');       // precomposed য় → য
    s = s.replace(/\u09AF\u09BC/g, '\u09AF'); // decomposed য+় → য
    // Strip honorifics/titles so searches still match without them.
    // NOTE: \b word boundaries do NOT work around Bengali characters,
    // so these must be plain global replacements.
    s = s.replace(/(মোঃ|মোছাঃ|মোহাম্মদ|মুহাম্মদ|মৃত|md\.?|mohammad|muhammad|mst\.?|late)/g, ' ');
    s = s.replace(/[.,\-_/()\[\]:;'"]/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  function matches(fieldVal, query) {
    const f = normalize(fieldVal);
    const q = normalize(query);
    if (!q) return true;
    return q.split(' ').every(tok => f.includes(tok));
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  // Highlights search queries
  function highlight(text, query) {
    const safeText = esc(text ?? '—');
    const q = normalize(query);
    if (!q) return safeText;
    
    let html = safeText;
    q.split(' ').filter(t => t.length > 1).forEach(tok => {
      try {
        const re = new RegExp('(' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        html = html.replace(re, '<mark>$1</mark>');
      } catch (e) {
        // Safe fail
      }
    });
    return html;
  }

  // Create a record table row
  function createRow(label, value, query = '') {
    if (value === null || value === undefined || value === '') return '';
    return `<dt>${esc(label)}</dt><dd>${highlight(value, query)}</dd>`;
  }

  // Main Search Logic Router
  function doSearch() {
    if (currentTab === 'nid') {
      doNidSearch();
    } else {
      doPorchaSearch();
    }
  }

  // NID Search logic (Supports real-time Firestore sync!)
  async function doNidSearch() {
    const q = {
      name: fields.name.value.trim(),
      father: fields.father.value.trim(),
      union: fields.union ? fields.union.value.trim() : '',
      mother: fields.mother.value.trim(),
      dob: fields.dob.value.trim(),
      village: fields.village.value.trim(),
      nid: fields.nid.value.trim()
    };

    const hasAnyInput = Object.values(q).some(v => v !== '');

    if (!hasAnyInput) {
      statusContainer.innerHTML = '';
      resultsGrid.innerHTML = '';
      hideArchiveSection();
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">🔎</div>
        <div class="empty-title">অনুসন্ধান শুরু করুন</div>
        <p style="font-size:0.88rem;margin-top:4px">অনুগ্রহ করে অন্তত একটি ঘরে তথ্য লিখে খুঁজুন</p>
      `;
      return;
    }


    let searchPool = [];

    if (db) {
      // ONLINE: Query Firestore collections (highly scalable and offline cached!)
      try {
        const querySnapshot = await db.collection('nid_records').get();
        if (querySnapshot.empty && DATA.length) {
          // Cloud collection is empty — fall back to the bundled local dataset
          searchPool = [...DATA];
        } else {
          querySnapshot.forEach((doc) => {
            searchPool.push(doc.data());
          });
        }
      } catch (err) {
        console.warn('[Firebase] Query error, falling back to local static DATA:', err);
        searchPool = [...DATA];
      }
    } else {
      // OFFLINE fallback
      searchPool = [...DATA];
    }

    // অ্যাডমিন প্যানেল থেকে আপলোডকৃত NID রেকর্ডও খোঁজায় যোগ
    if (typeof UPLOADED_RECORDS !== 'undefined') {
      UPLOADED_RECORDS.filter(r => r.type === 'nid').forEach(r => searchPool.push(r));
    }
    // Filter data matching all criteria
    let matchedRecords = searchPool.filter(r => 
      matches(r.nid, q.nid) &&
      (matches(r.name, q.name) || matches(r.name_en, q.name)) &&
      matches(r.father, q.father) &&
      matches(r.union, q.union) &&
      matches(r.mother, q.mother) &&
      matches(r.dob, q.dob) &&
      matches(r.village, q.village)
    );

    // স্ট্রিক্ট খোঁজায় কিছু না মিললে — রেকর্ডের যেকোনো ফিল্ড + PDF টেক্সটে খোঁজা
    if (matchedRecords.length === 0) {
      const tokens = Object.values(q)
        .flatMap(v => normalize(v).split(' '))
        .filter(t => t.length > 1);
      matchedRecords = searchPool.filter(r => {
        const haystack = normalize([
          r.name, r.name_en, r.father, r.mother, r.village, r.union, r.post,
          r.upazila, r.district, r.occupation, r.gender, r.nid, r.voter_no, r.dob,
          r.search_text,
          pdfTextOf(r.pdf)
        ].join(' '));
        return tokens.every(t => haystack.includes(t));
      });
    }

    // PDF আর্কাইভে খোঁজা (রেকর্ডবিহীন PDF থেকে উদ্ধারকৃত টেক্সট)
    const archiveTokens = Object.values(q)
      .flatMap(v => normalize(v).split(' '))
      .filter(t => t.length > 1);
    const archiveHits = archiveTokens.length
      ? getArchiveEntries().filter(e => archiveTokens.every(t => normalize(e.text).includes(t)))
      : [];

    if (matchedRecords.length === 0 && archiveHits.length === 0) {
      resultsGrid.innerHTML = '';
      hideArchiveSection();
      statusContainer.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">😕</div>
        <div class="empty-title">কোনো তথ্য পাওয়া যায়নি</div>
        <p style="font-size:0.88rem;margin-top:4px">অনুগ্রহ করে বানান যাচাই করুন অথবা অতিরিক্ত ফিল্টারগুলো কমিয়ে পুনরায় চেষ্টা করুন।</p>
      `;
      return;
    }

    emptyState.style.display = 'none';
    resultsGrid.innerHTML = '';
    if (matchedRecords.length > 0) renderNidResults(matchedRecords, q);
    renderArchiveSection(archiveHits);

    const parts = [];
    if (matchedRecords.length) parts.push(`<span>${matchedRecords.length}</span> টি তথ্য ডেটাবেজে পাওয়া গেছে`);
    if (archiveHits.length) parts.push(`<span>${archiveHits.length}</span> টি পিডিএফ আর্কাইভে পাওয়া গেছে`);
    statusContainer.innerHTML = parts.join(' &nbsp;+&nbsp; ');
  }

  // E-Porcha & Khatian Search Logic (Supports real-time Firestore sync!)
  async function doPorchaSearch() {
    const q = {
      owner: fields.owner.value.trim(),
      owner_father: fields.owner_father.value.trim(),
      khatian: fields.khatian.value.trim(),
      dag: fields.dag.value.trim(),
      mouza: fields.mouza.value.trim()
    };

    const hasAnyInput = Object.values(q).some(v => v !== '');

    if (!hasAnyInput) {
      statusContainer.innerHTML = '';
      resultsGrid.innerHTML = '';
      hideArchiveSection();
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">📖</div>
        <div class="empty-title">খতিয়ান অনুসন্ধান শুরু করুন</div>
        <p style="font-size:0.88rem;margin-top:4px">উপরে খতিয়ানের মালিকের নাম ও পিতার নাম লিখে অনুসন্ধান করুন</p>
      `;
      return;
    }


    let searchPool = [];

    if (db) {
      // ONLINE: Query Firestore
      try {
        const querySnapshot = await db.collection('khatian_records').get();
        if (querySnapshot.empty && KHATIAN_DATA.length) {
          // Cloud collection is empty — fall back to the bundled local dataset
          searchPool = [...KHATIAN_DATA];
        } else {
          querySnapshot.forEach((doc) => {
            searchPool.push(doc.data());
          });
        }
      } catch (err) {
        console.warn('[Firebase] Query error, falling back to local static KHATIAN_DATA:', err);
        searchPool = [...KHATIAN_DATA];
      }
    } else {
      searchPool = [...KHATIAN_DATA];
    }

    // অ্যাডমিন প্যানেল থেকে আপলোডকৃত খতিয়ান রেকর্ডও খোঁজায় যোগ
    if (typeof UPLOADED_RECORDS !== 'undefined') {
      UPLOADED_RECORDS.filter(r => r.type === 'khatian').forEach(r => searchPool.push(r));
    }

    let matchedRecords = searchPool.filter(r => 
      matches(r.owner, q.owner) &&
      matches(r.father, q.owner_father) &&
      matches(r.khatian_no, q.khatian) &&
      matches(r.dag_no, q.dag) &&
      matches(r.mouza, q.mouza)
    );

    // স্ট্রিক্ট খোঁজায় কিছু না মিললে — যেকোনো ফিল্ড + PDF টেক্সটে খোঁজা
    if (matchedRecords.length === 0) {
      const tokens = Object.values(q)
        .flatMap(v => normalize(v).split(' '))
        .filter(t => t.length > 1);
      matchedRecords = searchPool.filter(r => {
        const haystack = normalize([
          r.owner, r.father, r.khatian_no, r.dag_no, r.mouza, r.jl_no,
          r.upazila, r.district, r.division, r.land_type, r.area,
          r.search_text,
          pdfTextOf(r.pdf)
        ].join(' '));
        return tokens.every(t => haystack.includes(t));
      });
    }

    // PDF আর্কাইভে খোঁজা (রেকর্ডবিহীন PDF + আপলোডকৃত PDF থেকে উদ্ধারকৃত টেক্সট)
    const archiveTokens = Object.values(q)
      .flatMap(v => normalize(v).split(' '))
      .filter(t => t.length > 1);
    const archiveHits = archiveTokens.length
      ? getArchiveEntries().filter(e => archiveTokens.every(t => normalize(e.text).includes(t)))
      : [];

    if (matchedRecords.length === 0 && archiveHits.length === 0) {
      resultsGrid.innerHTML = '';
      hideArchiveSection();
      statusContainer.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">😕</div>
        <div class="empty-title">কোনো খতিয়ান বা পর্চা পাওয়া যায়নি</div>
        <p style="font-size:0.88rem;margin-top:4px">অনুগ্রহ করে খতিয়ান নম্বর বা মালিকের নাম পুনরায় যাচাই করুন।</p>
      `;
      return;
    }

    emptyState.style.display = 'none';
    resultsGrid.innerHTML = '';
    if (matchedRecords.length > 0) renderPorchaResults(matchedRecords, q);
    renderArchiveSection(archiveHits);

    const parts = [];
    if (matchedRecords.length) parts.push(`<span>${matchedRecords.length}</span> টি খতিয়ান ডেটাবেজে পাওয়া গেছে`);
    if (archiveHits.length) parts.push(`<span>${archiveHits.length}</span> টি পিডিএফ আর্কাইভে পাওয়া গেছে`);
    statusContainer.innerHTML = parts.join(' &nbsp;+&nbsp; ');
  }

  // Render NID Result Cards
  function renderNidResults(records, q) {
    if (records.length === 0) {
      resultsGrid.innerHTML = '';
      statusContainer.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">😕</div>
        <div class="empty-title">কোনো তথ্য পাওয়া যায়নি</div>
        <p style="font-size:0.88rem;margin-top:4px">অনুগ্রহ করে বানান যাচাই করুন অথবা অতিরিক্ত ফিল্টারগুলো কমিয়ে পুনরায় চেষ্টা করুন।</p>
      `;
      return;
    }

    emptyState.style.display = 'none';
    statusContainer.innerHTML = `<span>${records.length}</span> টি তথ্য সফলভাবে পাওয়া গেছে`;

    resultsGrid.innerHTML = records.map((r, i) => {
      lastNidResults[String(i)] = r;
      const compiled_text = `নাম: ${r.name}
পিতা: ${r.father}
মাতা: ${r.mother}
জন্ম তারিখ: ${r.dob}
ভোটার নং: ${r.voter_no}
গ্রাম: ${r.village}
ইউনিয়ন: ${r.union || 'গড়াগ্ৰাম'}
ঠিকানা: ${r.village}, কিশোরগঞ্জ, নীলফামারী`;

      return `
      <div class="premium-card">
        <div class="card-header-banner">
          <h3 class="card-title-main" title="${esc(r.name)}">${highlight(r.name, q.name)}</h3>
          <div class="card-badge">
            <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"></path></svg>
            যাচাইকৃত
          </div>
        </div>
        <div class="card-body">
          <div class="card-subtitle">
            <span>${esc(r.name_en || '')}</span>
            <span>ক্রমিক: #${esc(r.sl ?? '—')}</span>
          </div>

          ${khatianLinksHtml(r)}
          
          ${r.nid ? `
          <div class="card-nid-container" title="ক্লিক করে কপি করুন">
            <div style="display:flex; flex-direction:column">
              <span style="font-size:0.68rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">VOTER NO / NID</span>
              <span class="card-nid-number">${highlight(r.nid, q.nid)}</span>
            </div>
            <button class="btn-copy" onclick="copyToClipboard('${esc(r.nid)}')">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
              কপি
            </button>
          </div>
          ` : ''}

          <dl class="card-details">
            ${createRow('পিতা', r.father, q.father)}
            ${createRow('মাতা', r.mother, q.mother)}
            ${createRow('জন্ম তারিখ', r.dob, q.dob)}
            ${createRow('গ্রাম', r.village, q.village)}
            ${createRow('ইউনিয়ন', r.union || 'গড়াগ্ৰাম', q.union)}
            ${createRow('ডাকঘর', r.post)}
            ${createRow('উপজেলা', r.upazila)}
            ${createRow('জেলা', r.district)}
            ${createRow('পেশা', r.occupation)}
            ${createRow('লিঙ্গ', r.gender)}
          </dl>

          <!-- Compiled Details Box for Copy-all -->
          <div style="margin-top: 15px; border: 1.5px solid var(--border); border-radius: 12px; background: #fafafa; padding: 12px;">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--primary); margin-bottom: 6px; display:flex; align-items:center; gap:4px">
              <span>📋</span> সব তথ্য এক ক্লিপবোর্ডে কপি করুন
            </div>
            <textarea id="all_details_n${i}" readonly style="width: 100%; height: 75px; font-size: 0.82rem; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; background: #fff; color: var(--text-main); resize: none; font-family: inherit; font-weight: 500; line-height:1.4;" onclick="this.select();">${esc(compiled_text)}</textarea>
            <button class="btn btn-secondary" onclick="copyAllDetails('all_details_n${i}')" style="width: 100%; margin-top: 8px; padding: 8px; font-size: 0.78rem; font-weight: 800; display:flex; align-items:center; justify-content:center; gap: 4px; border-color: var(--primary-light); color: var(--secondary); background: #fff; cursor: pointer; border-radius: 8px;">
              📋 সব তথ্য কপি করুন
            </button>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="btn btn-primary btn-view-pdf" onclick="openPdfViewer('${i}')">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            সরাসরি দেখুন
          </button>
          <button class="btn btn-download-pdf" onclick="downloadPdf('${i}', '${esc(r.pdf)}')">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            ডাউনলোড
          </button>
        </div>
      </div>
      `;
    }).join('');
  }

  // Render E-Porcha / Khatian Result Cards
  function renderPorchaResults(records, q) {
    if (records.length === 0) {
      resultsGrid.innerHTML = '';
      statusContainer.innerHTML = '';
      emptyState.style.display = 'block';
      emptyState.innerHTML = `
        <div class="empty-icon">😕</div>
        <div class="empty-title">কোনো খতিয়ান বা পর্চা পাওয়া যায়নি</div>
        <p style="font-size:0.88rem;margin-top:4px">অনুগ্রহ করে খতিয়ান নম্বর বা মালিকের নাম পুনরায় যাচাই করুন।</p>
      `;
      return;
    }

    emptyState.style.display = 'none';
    statusContainer.innerHTML = `<span>${records.length}</span> টি খতিয়ান সফলভাবে পাওয়া গেছে`;

    resultsGrid.innerHTML = records.map((r, i) => {
      lastKhatianResults[String(i)] = r;
      lastKhatianPeople['k' + i] = (r.people || []).map(p => p.name);
      const people_text = (r.people || []).map(p => p.name).join(', ');
      const compiled_text = `খতিয়ান নম্বর: ${r.khatian_no}
দাগ নম্বর: ${r.dag_no}
মৌজা: ${r.mouza}
মালিক/দখলদার: ${r.owner}
পিতা: ${r.father}
জমির পরিমাণ: ${r.area}
শ্রেণী: ${r.land_type}
ঠিকানা: ${r.upazila}, ${r.district}
উল্লেখিত ব্যক্তিবর্গ: ${people_text}`;

      return `
      <div class="premium-card" style="border-left: 4px solid var(--accent);">
        <div class="card-header-banner" style="background: linear-gradient(135deg, var(--accent) 0%, #b91c1c 100%);">
          <h3 class="card-title-main" title="খতিয়ান নং: ${esc(r.khatian_no)}">খতিয়ান নং: ${highlight(r.khatian_no, q.khatian)}</h3>
          <div class="card-badge" style="background: var(--accent-hover);">
            📂 এস এ খতিয়ান
          </div>
        </div>
        <div class="card-body">
          <div class="card-subtitle">
            <span>মৌজা: ${highlight(r.mouza, q.mouza)}</span>
            <span>জে. এল. নং: ${esc(r.jl_no)}</span>
          </div>
          
          <div class="card-nid-container" style="background: #fff5f5; border-color: #fca5a5;" title="দাগ নম্বর">
            <div style="display:flex; flex-direction:column">
              <span style="font-size:0.68rem; color:#b91c1c; font-weight:bold; text-transform:uppercase;">DAG NO / দাগ নম্বর</span>
              <span class="card-nid-number" style="color: var(--accent);">${highlight(r.dag_no, q.dag)}</span>
            </div>
          </div>

          <dl class="card-details">
            ${createRow('মালিক / Owner', r.owner, q.owner)}
            ${createRow('পিতা', r.father, q.owner_father)}
            ${createRow('জমির পরিমাণ', r.area)}
            ${createRow('জমির শ্রেণী', r.land_type)}
            ${createRow('উপজেলা', r.upazila)}
            ${createRow('জেলা', r.district)}
            ${createRow('বিভাগ', r.division)}
          </dl>

          ${peopleSectionHtml(r, i)}

          <!-- Compiled Details Box for Copy-all -->
          <div style="margin-top: 15px; border: 1.5px solid var(--border); border-radius: 12px; background: #fafafa; padding: 12px;">
            <div style="font-size: 0.75rem; font-weight: 800; color: var(--accent); margin-bottom: 6px; display:flex; align-items:center; gap:4px">
              <span>📋</span> সব তথ্য এক ক্লিপবোর্ডে কপি করুন
            </div>
            <textarea id="all_details_p${i}" readonly style="width: 100%; height: 75px; font-size: 0.82rem; border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; background: #fff; color: var(--text-main); resize: none; font-family: inherit; font-weight: 500; line-height:1.4;" onclick="this.select();">${esc(compiled_text)}</textarea>
            <button class="btn btn-secondary" onclick="copyAllDetails('all_details_p${i}')" style="width: 100%; margin-top: 8px; padding: 8px; font-size: 0.78rem; font-weight: 800; display:flex; align-items:center; justify-content:center; gap: 4px; border-color: #fca5a5; color: var(--accent); background: #fff; cursor: pointer; border-radius: 8px;">
              📋 সব তথ্য কপি করুন
            </button>
          </div>
        </div>
        
        <div class="card-actions">
          <button class="btn btn-primary btn-view-pdf" onclick="openPdfViewer('${i}', true)" style="background: var(--accent) !important;">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
            পর্চা দেখুন
          </button>
          <button class="btn btn-download-pdf" onclick="downloadPdf('${i}', '${esc(r.pdf)}', true)">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            ডাউনলোড
          </button>
        </div>
      </div>
      `;
    }).join('');
  }

  // PDF আর্কাইভ সেকশন রেন্ডার (রেকর্ডবিহীন PDF থেকে উদ্ধারকৃত টেক্সট)
  function renderArchiveSection(hits) {
    if (!archiveSection || !archiveGrid) return;
    if (!hits || hits.length === 0) {
      hideArchiveSection();
      return;
    }
    lastArchiveResults = hits;
    archiveSection.style.display = 'block';
    archiveGrid.innerHTML = hits.map((e, i) => `
      <div class="premium-card" style="border-left: 4px solid #7c3aed;">
        <div class="card-header-banner" style="background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%);">
          <h3 class="card-title-main" title="${esc(e.name_bn || e.name || '')}">${esc(e.name_bn || e.name || 'অজানা নাম')}</h3>
          <div class="card-badge" style="background: #6d28d9;">📦 আর্কাইভ</div>
        </div>
        <div class="card-body">
          <div class="card-subtitle">
            <span>${esc(e.name || '')}</span>
            <span>PDF থেকে উদ্ধারকৃত</span>
          </div>
          ${e.nid ? `
          <div class="card-nid-container" title="ক্লিক করে কপি করুন">
            <div style="display:flex; flex-direction:column">
              <span style="font-size:0.68rem; color:var(--text-muted); font-weight:bold; text-transform:uppercase;">VOTER NO / NID</span>
              <span class="card-nid-number">${esc(e.nid)}</span>
            </div>
            <button class="btn-copy" onclick="copyToClipboard('${esc(e.nid)}')">
              <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path></svg>
              কপি
            </button>
          </div>
          ` : ''}
          <div style="font-size:0.8rem; color:var(--text-muted); background:#f8fafc; border:1px dashed var(--border); border-radius:8px; padding:8px 10px; margin-bottom:12px;">
            <b style="color:var(--primary);">উদ্ধারকৃত টেক্সট:</b> ${esc(e.text)}
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:10px;">
            📁 ফাইল: <b>${esc(e.file_name || e.pdf)}</b>
          </div>
          ${(Array.isArray(e.names) && e.names.length) ? `
          <div style="margin-bottom:12px;">
            <div style="font-size:0.75rem; font-weight:800; color:var(--primary); margin-bottom:6px;">👥 সম্ভাব্য ব্যক্তির নাম (${asciiToBn(e.names.length)} টি) — ক্লিক করলে খুঁজবে:</div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${e.names.map(n => `<button class="archive-name-chip" onclick="searchArchiveName('${esc(n)}')">${esc(n)}</button>`).join('')}
            </div>
          </div>` : ''}
        </div>
        <div class="card-actions">
          <button class="btn btn-primary btn-view-pdf" onclick="openArchiveViewer('${i}')">
            👁️ টেক্সট দেখুন
          </button>
          <button class="btn btn-download-pdf" onclick="downloadArchivePdf('${esc(e.pdf)}')">
            ⬇️ PDF ডাউনলোড
          </button>
        </div>
      </div>
    `).join('');
  }

  // Low-level clipboard writer with legacy fallback for insecure contexts
  const writeClipboard = (text) => {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback: hidden textarea + execCommand (works without the Clipboard API)
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error('execCommand copy failed'));
      } catch (e) {
        reject(e);
      }
    });
  };

  // Copy to clipboard with toast
  window.copyToClipboard = (text) => {
    writeClipboard(text).then(() => {
      showToast('কপি করা হয়েছে! ✓');
    }).catch(() => {
      showToast('কপি করা সম্ভব হয়নি।');
    });
  };

  // Copy all details function
  window.copyAllDetails = (id) => {
    const textarea = document.getElementById(id);
    if (!textarea) return;
    textarea.select();
    writeClipboard(textarea.value).then(() => {
      showToast('সব তথ্য সফলভাবে কপি করা হয়েছে! ✓');
    }).catch(() => {
      showToast('কপি করা সম্ভব হয়নি।');
    });
  };

  // Toast handler
  let toastTimeout;
  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"></path></svg> ${message}`;
    toast.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 2500);
  }

  // Clear Form Fields
  btnClear.addEventListener('click', () => {
    Object.values(fields).forEach(inp => { if (inp) inp.value = ''; });
    resetResults();
  });

  // Event Listeners for search
  btnSearch.addEventListener('click', doSearch);
  
  Object.values(fields).forEach(inp => {
    if (!inp) return;
    
    if (inp.tagName === 'SELECT') {
      inp.addEventListener('change', doSearch);
      return;
    }

    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
    
    let deb;
    inp.addEventListener('input', () => {
      clearTimeout(deb);
      deb = setTimeout(doSearch, 250);
    });
  });

  // Focus Name Field at start
  if (fields.name) fields.name.focus();

  // Expose showToast globally
  window.showToast = showToast;
});

// PDF viewer system with custom beautiful fallback
function openPdfViewer(id, isKhatian = false) {
  const modal = document.getElementById('pdfModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  
  if (!modal || !modalBody) return;
  
  // Find the record: first in the most recently rendered results (works for
  // Firestore records too), then fall back to the static local arrays.
  const key = String(id);
  let record = null;
  if (isKhatian) {
    record = lastKhatianResults[key];
    if (!record && typeof KHATIAN_DATA !== 'undefined') {
      record = KHATIAN_DATA.find(r => r.khatian_no === id);
    }
  } else {
    record = lastNidResults[key];
    if (!record && typeof DATA !== 'undefined') {
      record = DATA.find(r => r.nid === id);
    }
  }

  if (!record) return;

  if (isKhatian) {
    modalTitle.textContent = `খতিয়ান নং: ${record.khatian_no} - ই-পর্চা ভিউয়ার`;
    modalBody.innerHTML = `
      <div class="pdf-fallback-container">
        <div class="pdf-fallback-card">
          <div class="pdf-fallback-icon" style="color: var(--accent);">📄</div>
          <h4 class="pdf-fallback-title">ই-পর্চা ও খতিয়ান ডকুমেন্ট ভিউয়ার</h4>
          <p class="pdf-fallback-desc">
            খতিয়ানের মূল ই-পর্চা ডাউনলোড করার জন্য প্রস্তুত। আপনি ফাইলটি ডাউনলোড করতে পারেন অথবা নিচে ডিজিটাল সারসংক্ষেপ দেখতে পারেন।
          </p>
          
          <div class="pdf-mini-certificate" style="border-color: var(--accent);">
            <div class="cert-header" style="color: #b91c1c; border-bottom-color: var(--accent);">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার - ই-পর্চা রেকর্ড</div>
            <div class="cert-row">
              <span class="cert-label">খতিয়ান নং:</span>
              <span class="cert-value" style="color: var(--accent);"><b>${esc(record.khatian_no)}</b></span>
            </div>
            <div class="cert-row">
              <span class="cert-label">দাগ নম্বর:</span>
              <span class="cert-value">${esc(record.dag_no)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">মৌজা:</span>
              <span class="cert-value">${esc(record.mouza)} (জে. এল. নং: ${esc(record.jl_no)})</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">মালিক/দখলদার:</span>
              <span class="cert-value">${esc(record.owner)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">পিতা/স্বামী:</span>
              <span class="cert-value">${esc(record.father)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">জমির পরিমাণ:</span>
              <span class="cert-value" style="color: #15803d"><b>${esc(record.area)}</b></span>
            </div>
            <div class="cert-row">
              <span class="cert-label">শ্রেণী:</span>
              <span class="cert-value">${esc(record.land_type)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">ঠিকানা:</span>
              <span class="cert-value">${esc(record.upazila)}, ${esc(record.district)}</span>
            </div>
            ${(record.people && record.people.length) ? `
            <div class="cert-row" style="grid-template-columns: 1fr; margin-top: 8px;">
              <span class="cert-value" style="white-space: pre-wrap; font-weight: 500;">
                👥 উল্লেখিত ব্যক্তিবর্গ (${asciiToBn(record.people.length)} জন): ${esc(record.people.map(p => p.name + (p.nid ? ' (NID: ' + p.nid + ')' : '')).join(', '))}
              </span>
            </div>` : ''}
          </div>

          <button class="btn btn-primary" onclick="downloadPdf('${esc(id)}', '${esc(record.pdf)}', true)" style="background: var(--accent) !important;">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="margin-right:6px"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            অফিশিয়াল পর্চা ডাউনলোড করুন
          </button>
        </div>
      </div>
    `;
  } else {
    modalTitle.textContent = `${record.name} - NID PDF ভিউয়ার`;
    modalBody.innerHTML = `
      <div class="pdf-fallback-container">
        <div class="pdf-fallback-card">
          <div class="pdf-fallback-icon">📄</div>
          <h4 class="pdf-fallback-title">NID PDF ডকুমেন্ট ভিউয়ার</h4>
          <p class="pdf-fallback-desc">
            ডিজিটাল NID কার্ডের অফিসিয়াল ফাইলটি ডাউনলোডের জন্য প্রস্তুত। আপনি সরাসরি ফাইলটি ডাউনলোড করতে পারেন অথবা নিচের ডিজিটাল সারসংক্ষেপ দেখতে পারেন।
          </p>
          
          <div class="pdf-mini-certificate">
            <div class="cert-header">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার - ই-সেবা প্রোফাইল</div>
            <div class="cert-row">
              <span class="cert-label">নাম:</span>
              <span class="cert-value">${esc(record.name)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">English:</span>
              <span class="cert-value">${esc(record.name_en)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">NID নম্বর:</span>
              <span class="cert-value" style="color:var(--accent); font-family:monospace; font-weight:800">${esc(record.nid)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">পিতা:</span>
              <span class="cert-value">${esc(record.father)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">মাতা:</span>
              <span class="cert-value">${esc(record.mother)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">গ্রাম:</span>
              <span class="cert-value">${esc(record.village)}</span>
            </div>
            <div class="cert-row">
              <span class="cert-label">উপজেলা:</span>
              <span class="cert-value">${esc(record.upazila)}, ${esc(record.district)}</span>
            </div>
          </div>

          <button class="btn btn-primary" onclick="downloadPdf('${esc(id)}', '${esc(record.pdf)}')">
            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" style="margin-right:6px"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
            অফিসিয়াল PDF ডাউনলোড করুন
          </button>
        </div>
      </div>
    `;
  }
  
  modal.classList.add('show');
}

function closePdfViewer() {
  const modal = document.getElementById('pdfModal');
  if (modal) modal.classList.remove('show');
}

// ASCII digit -> Bengali digit helper (UI-তে সুন্দর দেখানোর জন্য)
function asciiToBn(s) {
  const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
  return String(s ?? '').replace(/\d/g, d => BN[Number(d)]);
}

// Bengali digit -> ASCII digit helper (for clean file names)
function bnToAscii(s) {
  const BN = { '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9' };
  return String(s ?? '').replace(/[০-৯]/g, d => BN[d]);
}

// Function to simulate PDF download (or download if exists)
function downloadPdf(id, pdfPath, isKhatian = false) {
  // Find the record: most recently rendered results first, then static data
  const key = String(id);
  let record = (isKhatian ? lastKhatianResults : lastNidResults)[key];
  if (!record) {
    if (isKhatian && typeof KHATIAN_DATA !== 'undefined') {
      record = KHATIAN_DATA.find(r => r.khatian_no === id);
    } else if (!isKhatian && typeof DATA !== 'undefined') {
      record = DATA.find(r => r.nid === id);
    }
  }

  // Build a friendly file name; never throw if a field is missing
  let downloadName;
  if (record) {
    if (isKhatian) {
      const mouza = String(record.mouza || 'mouza').replace(/\s+/g, '_');
      const khatianNo = bnToAscii(record.khatian_no || id);
      downloadName = `Khatian_${khatianNo}_Mouza_${mouza}.pdf`;
    } else {
      const nameEn = String(record.name_en || '').replace(/\s+/g, '_');
      downloadName = `NID_${record.nid || id}${nameEn ? '_' + nameEn : ''}.pdf`;
    }
  } else {
    downloadName = isKhatian ? `Khatian_${id}.pdf` : `NID_${id}.pdf`;
  }

  const anchor = document.createElement('a');
  anchor.href = pdfPath || 'pdfs/fallback.pdf';
  anchor.download = downloadName;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

// PDF আর্কাইভ ভিউয়ার — রেকর্ডবিহীন PDF থেকে উদ্ধারকৃত টেক্সট দেখায়
window.openArchiveViewer = (index) => {
  const modal = document.getElementById('pdfModal');
  const modalBody = document.getElementById('modalBody');
  const modalTitle = document.getElementById('modalTitle');
  if (!modal || !modalBody) return;

  const entry = lastArchiveResults[Number(index)];
  if (!entry) return;

  modalTitle.textContent = '📦 PDF আর্কাইভ — উদ্ধারকৃত টেক্সট';
  modalBody.innerHTML = `
    <div class="pdf-fallback-container">
      <div class="pdf-fallback-card">
        <div class="pdf-fallback-icon" style="color: #7c3aed;">📦</div>
        <h4 class="pdf-fallback-title">${esc(entry.name_bn || entry.name || 'অজানা')}</h4>
        <p class="pdf-fallback-desc">
          এই তথ্যটি শুধুমাত্র PDF ফাইলে ছিল (ডেটাবেজে রেকর্ড নেই)। PDF থেকে টেক্সট বের করে নিচে দেখানো হলো।
        </p>
        <div class="pdf-mini-certificate" style="border-color: #7c3aed;">
          <div class="cert-header" style="border-bottom-color: #7c3aed;">PDF থেকে উদ্ধারকৃত টেক্সট</div>
          ${entry.nid ? `<div class="cert-row"><span class="cert-label">NID:</span><span class="cert-value" style="font-family:monospace;">${esc(entry.nid)}</span></div>` : ''}
          <div class="cert-row"><span class="cert-label">নাম:</span><span class="cert-value">${esc(entry.name || '—')}</span></div>
          <div class="cert-row" style="grid-template-columns: 1fr; margin-top: 8px;">
            <span class="cert-value" style="white-space: pre-wrap; font-weight: 500; background: #f8fafc; border: 1px dashed var(--border); border-radius: 8px; padding: 8px 10px;">${esc(entry.text)}</span>
          </div>
        </div>
        <button class="btn btn-primary" onclick="downloadArchivePdf('${esc(entry.pdf)}')" style="background: linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%) !important;">
          ⬇️ অফিসিয়াল PDF ডাউনলোড করুন
        </button>
      </div>
    </div>
  `;
  modal.classList.add('show');
};

// PDF আর্কাইভ ফাইল ডাউনলোড
window.downloadArchivePdf = (pdfPath) => {
  const anchor = document.createElement('a');
  anchor.href = pdfPath || 'pdfs/fallback.pdf';
  anchor.download = (pdfPath || '').split('/').pop() || 'document.pdf';
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

// Helper to escape HTML safely in global context
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}
