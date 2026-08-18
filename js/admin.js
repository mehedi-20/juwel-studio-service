// Admin Panel Script for Juwel Telecom
document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. Password Security Check (Admin Panel)
     ========================================================================== */
  const ALLOWED_PASSWORDS = ["mehedi987", "Julfikar5320@"];

  // সার্ভারের POST API গুলোতে অ্যাডমিন পাসওয়ার্ড হেডার হিসেবে পাঠানো হয়
  // (সার্ভার এখন শুধু পরিচিত পাসওয়ার্ডের অনুরোধই গ্রহণ করে)
  const adminFetch = (url, opts = {}) => {
    opts.headers = { ...(opts.headers || {}), 'x-admin-pass': ALLOWED_PASSWORDS[0] };
    return fetch(url, opts);
  };
  const loginScreen = document.getElementById('loginScreen');
  const mainApp = document.getElementById('mainApp');
  const loginPasswordInput = document.getElementById('loginPassword');
  const btnLogin = document.getElementById('btnLogin');
  const loginError = document.getElementById('loginError');
  const togglePass = document.getElementById('togglePass');
  const btnLogout = document.getElementById('btnLogout');

  // Check auth state for Admin Panel
  const checkAdminAuth = () => {
    const isAdminAuthenticated = localStorage.getItem('juwel_e_sheba_admin_auth') === 'true';
    if (isAdminAuthenticated) {
      if (loginScreen) loginScreen.style.display = 'none';
      if (mainApp) mainApp.style.display = 'block';
      initFirebaseConnection();
    } else {
      if (loginScreen) loginScreen.style.display = 'flex';
      if (mainApp) mainApp.style.display = 'none';
      if (loginPasswordInput) loginPasswordInput.focus();
    }
  };

  // Toggle Password Eye Icon
  if (togglePass && loginPasswordInput) {
    togglePass.addEventListener('click', () => {
      const type = loginPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      loginPasswordInput.setAttribute('type', type);
      togglePass.textContent = type === 'password' ? '👁️' : '🙈';
    });
  }

  // Handle Admin Login submission
  const handleAdminLogin = () => {
    const enteredPass = loginPasswordInput.value.trim();
    if (ALLOWED_PASSWORDS.includes(enteredPass)) {
      localStorage.setItem('juwel_e_sheba_admin_auth', 'true');
      if (loginError) loginError.textContent = '';
      
      // Animate transition
      if (loginScreen) {
        loginScreen.style.transition = 'opacity 0.3s ease';
        loginScreen.style.opacity = '0';
        setTimeout(() => {
          loginScreen.style.display = 'none';
          if (mainApp) {
            mainApp.style.display = 'block';
            mainApp.style.opacity = '0';
            mainApp.style.transition = 'opacity 0.3s';
            setTimeout(() => { mainApp.style.opacity = '1'; }, 50);
          }
          showToast('স্বাগতম অ্যাডমিন! প্যানেলে প্রবেশাধিকার মঞ্জুর করা হয়েছে। ✓');
          initFirebaseConnection();
        }, 300);
      }
    } else {
      if (loginError) loginError.textContent = 'ভুল অ্যাডমিন পাসওয়ার্ড! সঠিক পাসওয়ার্ড পুনরায় লিখুন।';
    }
  };

  if (btnLogin) btnLogin.addEventListener('click', handleAdminLogin);
  if (loginPasswordInput) {
    loginPasswordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleAdminLogin();
    });
  }

  // Admin Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('juwel_e_sheba_admin_auth');
      showToast('অ্যাডমিন প্যানেল থেকে সফলভাবে লগআউট করেছেন।');
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    });
  }

  // Run initial Auth Check
  checkAdminAuth();


  /* ==========================================================================
     2. Tab Switching between Forms
     ========================================================================== */
  let currentAdminTab = 'nid'; // 'nid' | 'porcha' | 'bulk'
  const tabNidForm = document.getElementById('tabNidForm');
  const tabPorchaForm = document.getElementById('tabPorchaForm');
  const tabBulkForm = document.getElementById('tabBulkForm');
  const nidUploadForm = document.getElementById('nidUploadForm');
  const porchaUploadForm = document.getElementById('porchaUploadForm');
  const bulkImportPanel = document.getElementById('bulkImportPanel');

  const showAdminTab = (tab) => {
    currentAdminTab = tab;
    [tabNidForm, tabPorchaForm, tabBulkForm].forEach(b => b && b.classList.remove('active-tab'));
    const activeBtn = tab === 'nid' ? tabNidForm : tab === 'porcha' ? tabPorchaForm : tabBulkForm;
    if (activeBtn) activeBtn.classList.add('active-tab');
    if (nidUploadForm) nidUploadForm.style.display = tab === 'nid' ? 'block' : 'none';
    if (porchaUploadForm) porchaUploadForm.style.display = tab === 'porcha' ? 'block' : 'none';
    if (bulkImportPanel) bulkImportPanel.style.display = tab === 'bulk' ? 'block' : 'none';
  };

  if (tabNidForm) tabNidForm.addEventListener('click', () => showAdminTab('nid'));
  if (tabPorchaForm) tabPorchaForm.addEventListener('click', () => showAdminTab('porcha'));
  if (tabBulkForm) tabBulkForm.addEventListener('click', () => showAdminTab('bulk'));


  /* ==========================================================================
     3. File Input Labels Handling
     ========================================================================== */
  const nPdfFile = document.getElementById('n_pdf_file');
  const kPdfFile = document.getElementById('k_pdf_file');
  const nidFileLabel = document.getElementById('nidFileLabel');
  const porchaFileLabel = document.getElementById('porchaFileLabel');

  if (nPdfFile && nidFileLabel) {
    nPdfFile.addEventListener('change', (e) => {
      const fileName = e.target.files[0]?.name;
      if (fileName) {
        nidFileLabel.textContent = `✓ ফাইল নির্বাচিত: ${fileName}`;
        nidFileLabel.style.color = 'var(--success)';
      } else {
        nidFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        nidFileLabel.style.color = 'inherit';
      }
    });
  }

  if (kPdfFile && porchaFileLabel) {
    kPdfFile.addEventListener('change', (e) => {
      const fileName = e.target.files[0]?.name;
      if (fileName) {
        porchaFileLabel.textContent = `✓ ফাইল নির্বাচিত: ${fileName}`;
        porchaFileLabel.style.color = 'var(--success)';
      } else {
        porchaFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        porchaFileLabel.style.color = 'inherit';
      }
    });
  }


  /* ==========================================================================
     3.5 বাল্ক ইমপোর্ট (একসাথে অনেক রেকর্ড — ভোটার তালিকা ইত্যাদি)
     ========================================================================== */
  const bulkFile = document.getElementById('bulk_file');
  const bulkFileLabel = document.getElementById('bulkFileLabel');
  const bulkType = document.getElementById('bulk_type');
  const bulkCsv = document.getElementById('bulk_csv');
  const btnBulkImport = document.getElementById('btnBulkImport');
  const bulkResult = document.getElementById('bulkResult');

  if (bulkFile && bulkFileLabel) {
    bulkFile.addEventListener('change', () => {
      const f = bulkFile.files[0];
      bulkFileLabel.textContent = f ? '✓ ফাইল নির্বাচিত: ' + f.name : '📁 Excel/CSV ফাইল সিলেক্ট করুন (.csv)';
    });
  }

  // বাংলা হেডার → ইংরেজি কী ম্যাপ
  const HEADER_MAP = {
    'ক্রমিক': 'sl', 'ক্রম': 'sl', 'serial': 'sl', 'sl': 'sl',
    'নাম': 'name', 'name': 'name', 'নাম (ইংরেজি)': 'name_en', 'name_en': 'name_en', 'english name': 'name_en',
    'nid': 'nid', 'nid নম্বর': 'nid', 'nid no': 'nid', 'ভোটার নং': 'nid', 'voter_no': 'voter_no', 'ভোটার নম্বর': 'nid',
    'পিতা': 'father', 'father': 'father', 'পিতার নাম': 'father', "father's name": 'father',
    'মাতা': 'mother', 'mother': 'mother', 'মাতার নাম': 'mother', "mother's name": 'mother',
    'জন্ম তারিখ': 'dob', 'dob': 'dob', 'date of birth': 'dob',
    'গ্রাম': 'village', 'village': 'village',
    'ইউনিয়ন': 'union', 'union': 'union',
    'ডাকঘর': 'post', 'post': 'post',
    'উপজেলা': 'upazila', 'upazila': 'upazila',
    'জেলা': 'district', 'district': 'district',
    'বিভাগ': 'division', 'division': 'division',
    'পেশা': 'occupation', 'occupation': 'occupation',
    'লিঙ্গ': 'gender', 'gender': 'gender',
    'ফোন': 'phone', 'phone': 'phone',
    'খতিয়ান নং': 'khatian_no', 'khatian_no': 'khatian_no', 'খতিয়ান নম্বর': 'khatian_no',
    'দাগ নং': 'dag_no', 'dag_no': 'dag_no', 'দাগ নম্বর': 'dag_no',
    'মালিক': 'owner', 'owner': 'owner', 'মালিকের নাম': 'owner',
    'মৌজা': 'mouza', 'mouza': 'mouza',
    'জে. এল. নং': 'jl_no', 'jl_no': 'jl_no', 'j.l. no': 'jl_no',
    'জমির শ্রেণী': 'land_type', 'land_type': 'land_type', 'শ্রেণী': 'land_type',
    'জমির পরিমাণ': 'area', 'area': 'area', 'পরিমাণ': 'area',
    'অন্যান্য নাম': 'search_text', 'search_text': 'search_text', 'কীওয়ার্ড': 'search_text',
    'pdf': 'pdf'
  };

  function parseCsv(text) {
    const rows = [];
    // সহজ CSV পার্সার (কোটেড কমাও সাপোর্ট করে)
    let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += c;
      } else {
        if (c === '"') inQ = true;
        else if (c === ',' || c === '\t') { row.push(cell.trim()); cell = ''; }
        else if (c === '\n' || c === '\r') {
          if (c === '\r' && text[i + 1] === '\n') i++;
          row.push(cell.trim()); cell = '';
          if (row.some(x => x !== '')) rows.push(row);
          row = [];
        } else cell += c;
      }
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); if (row.some(x => x !== '')) rows.push(row); }
    return rows;
  }

  function mapHeader(h) {
    const key = String(h || '').trim().toLowerCase();
    return HEADER_MAP[key] || key.replace(/[^a-z0-9_]/g, '_');
  }

  if (btnBulkImport) {
    btnBulkImport.addEventListener('click', async () => {
      const type = bulkType ? bulkType.value : 'nid';
      let csvText = bulkCsv ? bulkCsv.value.trim() : '';

      if (!csvText && bulkFile && bulkFile.files[0]) {
        csvText = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => resolve('');
          reader.readAsText(bulkFile.files[0]);
        });
      }

      if (!csvText) {
        if (bulkResult) bulkResult.textContent = '⚠️ CSV ফাইল দিন অথবা টেক্সট পেস্ট করুন';
        return;
      }

      const rows = parseCsv(csvText);
      if (rows.length < 2) {
        if (bulkResult) bulkResult.textContent = '⚠️ অন্তত হেডার + ১ লাইন ডেটা দিন';
        return;
      }

      const headers = rows[0].map(mapHeader);
      const records = [];
      for (let i = 1; i < rows.length; i++) {
        const rec = {};
        rows[i].forEach((val, ci) => {
          const key = headers[ci];
          if (key && val !== '') rec[key] = val;
        });
        if (Object.keys(rec).length) records.push(rec);
      }

      if (!records.length) {
        if (bulkResult) bulkResult.textContent = '⚠️ কোনো ডেটা পাওয়া যায়নি';
        return;
      }

      try {
        if (bulkResult) bulkResult.textContent = '📥 ইমপোর্ট হচ্ছে, দয়া করে অপেক্ষা করুন...';
        const resp = await adminFetch('/api/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, records })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        if (bulkResult) {
          bulkResult.style.color = 'var(--success)';
          bulkResult.textContent = `✓ সফল! ${data.added} টি নতুন রেকর্ড যোগ হয়েছে${data.skipped ? ' (' + data.skipped + ' টি ডুপ্লিকেট/ভুল থাকায় বাদ)' : ''}`;
        }
        if (bulkCsv) bulkCsv.value = '';
        showToast('বাল্ক ইমপোর্ট সফল হয়েছে! ✓');
      } catch (err) {
        console.error('[BulkImport] Error:', err);
        if (bulkResult) {
          bulkResult.style.color = 'var(--accent)';
          bulkResult.textContent = 'ইমপোর্ট ব্যর্থ: ' + err.message;
        }
      }
    });
  }

  /* ==========================================================================
     3.6 PDF বাল্ক আপলোড (খতিয়ান/ভোটার তালিকার PDF — একসাথে অনেক)
     ========================================================================== */
  const pdfBulkFiles = document.getElementById('pdf_bulk_files');
  const pdfBulkLabel = document.getElementById('pdfBulkLabel');
  const pdfBulkList = document.getElementById('pdfBulkList');
  const btnPdfBulkUpload = document.getElementById('btnPdfBulkUpload');
  const pdfBulkResult = document.getElementById('pdfBulkResult');

  if (pdfBulkFiles && pdfBulkLabel) {
    pdfBulkFiles.addEventListener('change', () => {
      const files = [...pdfBulkFiles.files];
      pdfBulkLabel.textContent = files.length
        ? '✓ ' + files.length + ' টি ফাইল নির্বাচিত'
        : '📁 সব PDF ফাইল সিলেক্ট করুন';
      if (pdfBulkList) {
        pdfBulkList.innerHTML = files.map(f => '📄 ' + f.name).join('<br>');
      }
    });
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const s = String(reader.result || '');
        resolve(s.split(',')[1] || '');
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  if (btnPdfBulkUpload) {
    btnPdfBulkUpload.addEventListener('click', async () => {
      const files = pdfBulkFiles ? [...pdfBulkFiles.files] : [];
      if (!files.length) {
        if (pdfBulkResult) pdfBulkResult.textContent = '⚠️ আগে PDF ফাইল সিলেক্ট করুন';
        return;
      }

      btnPdfBulkUpload.disabled = true;
      const BATCH = 10;
      let savedAll = [], failedAll = [];

      try {
        for (let i = 0; i < files.length; i += BATCH) {
          const batch = files.slice(i, i + BATCH);
          if (pdfBulkResult) {
            pdfBulkResult.textContent = '⬆️ আপলোড হচ্ছে... ' + Math.min(i + BATCH, files.length) + '/' + files.length;
          }
          const payloadFiles = [];
          for (const f of batch) {
            try {
              payloadFiles.push({ name: f.name, base64: await readFileAsBase64(f) });
            } catch (e) {
              failedAll.push({ name: f.name, error: 'পড়া যায়নি' });
            }
          }
          if (!payloadFiles.length) continue;

          const resp = await adminFetch('/api/bulk-pdf-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: payloadFiles })
          });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
          savedAll = savedAll.concat(data.saved || []);
          failedAll = failedAll.concat(data.failed || []);
        }

        const withText = savedAll.filter(x => x.hasText).length;
        const scanned = savedAll.length - withText;
        let msg = '✓ সফল! ' + savedAll.length + ' টি PDF আপলোড হয়েছে';
        msg += ' — ' + withText + ' টিতে টেক্সট পাওয়া গেছে (নামে সার্চ হবে)';
        if (scanned) msg += ', ' + scanned + ' টি স্ক্যান করা (ফাইলের নামে খোঁজা যাবে)';
        if (failedAll.length) msg += ' | ' + failedAll.length + ' টি ব্যর্থ';
        if (pdfBulkResult) {
          pdfBulkResult.style.color = 'var(--success)';
          pdfBulkResult.textContent = msg;
        }
        showToast('PDF আপলোড সম্পন্ন! সার্চ ইনডেক্স আপডেট হয়েছে ✓');
        if (pdfBulkFiles) pdfBulkFiles.value = '';
        if (pdfBulkList) pdfBulkList.innerHTML = '';
        if (pdfBulkLabel) pdfBulkLabel.textContent = '📁 সব PDF ফাইল সিলেক্ট করুন';
      } catch (err) {
        console.error('[BulkPDF] Error:', err);
        if (pdfBulkResult) {
          pdfBulkResult.style.color = 'var(--accent)';
          pdfBulkResult.textContent = 'আপলোড ব্যর্থ: ' + err.message;
        }
      } finally {
        btnPdfBulkUpload.disabled = false;
      }
    });
  }

  /* ==========================================================================
     3.7 PDF নাম-ওভাররাইড (ভাঙা ফন্টের জায়গায় সঠিক নাম)
     ========================================================================== */
  const overrideSelect = document.getElementById('override_pdf_select');
  const overrideNames = document.getElementById('override_names');
  const btnSaveOverrides = document.getElementById('btnSaveOverrides');
  const overrideResult = document.getElementById('overrideResult');

  let pdfListCache = [];

  async function loadPdfList() {
    try {
      const resp = await adminFetch('/api/pdf-list');
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'তালিকা লোড হয়নি');
      pdfListCache = data.files || [];
      // ✓(N জন) = OCR সম্পন্ন ও ভোটার পাওয়া গেছে | ✓(০) = OCR হয়েছে কিন্তু ভোটার মেলেনি (যেমন পর্চা)
      const optionHtml = (f) => {
        let mark = '';
        if (f.voters !== null && f.voters !== undefined) mark = ` ✓(${f.voters} জন)`;
        else if (f.names && f.names.length) mark = ` ✓(${f.names.length} নাম)`;
        return `<option value="${f.pdf.replace(/"/g, '&quot;')}">${f.file_name}${mark}</option>`;
      };
      if (overrideSelect) {
        overrideSelect.innerHTML = '<option value="">-- PDF বেছে নিন --</option>' + pdfListCache.map(optionHtml).join('');
        overrideSelect.addEventListener('change', () => {
          const f = pdfListCache.find(x => x.pdf === overrideSelect.value);
          if (overrideNames) overrideNames.value = (f && f.names) ? f.names.join('\n') : '';
        });
      }
      if (ocrPdfSelect) {
        ocrPdfSelect.innerHTML = '<option value="">-- PDF বেছে নিন --</option>' + pdfListCache.map(optionHtml).join('');
      }

      // 📊 OCR স্ট্যাটাস টেবিল রেন্ডার — কোনটা হয়েছে, কোনটা বাকি
      renderOcrTable();
    } catch (e) {
      console.warn('[Overrides] list error:', e);
      if (overrideSelect) overrideSelect.innerHTML = '<option value="">তালিকা লোড করা যায়নি (সার্ভার চালু আছে তো?)</option>';
    }
  }

  function renderOcrTable() {
    const tbody = document.getElementById('ocrTableBody');
    const summary = document.getElementById('ocrSummary');
    if (!tbody) return;

    const done = pdfListCache.filter(f => f.voters !== null && f.voters !== undefined);
    const pending = pdfListCache.filter(f => f.voters === null || f.voters === undefined);
    const totalVoters = done.reduce((s, f) => s + (f.voters || 0), 0);

    if (summary) {
      summary.innerHTML = `✅ <b>${done.length}</b> টি PDF-এর OCR সম্পন্ন — মোট <b>${totalVoters}</b> জন ভোটার পড়া হয়েছে<br>⏳ বাকি: <b>${pending.length}</b> টি PDF`;
    }

    if (!pending.length) {
      tbody.innerHTML = '<tr><td colspan="4" style="padding:16px; text-align:center; color:var(--success); font-weight:700;">🎉 সব PDF-এর OCR হয়ে গেছে!</td></tr>';
      return;
    }

    // ভোটার তালিকার PDF (com_) আগে দেখাই — ওগুলোতেই আসল নাম থাকে
    const sortKey = (f) => (f.file_name.includes('com_') ? 0 : 1);
    const rows = pdfListCache
      .filter(f => f.voters === null || f.voters === undefined)
      .sort((a, b) => sortKey(a) - sortKey(b) || a.file_name.localeCompare(b.file_name))
      .map(f => `
        <tr style="border-bottom:1px solid #f1f5f9;">
          <td style="padding:7px 10px; font-size:0.75rem; word-break:break-all;">${f.file_name}</td>
          <td style="padding:7px 10px; text-align:center; font-size:0.78rem;">—</td>
          <td style="padding:7px 10px; text-align:center;"><span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:20px; font-size:0.72rem; font-weight:700;">⏳ বাকি</span></td>
          <td style="padding:7px 10px; text-align:center;">
            <button type="button" class="btn btn-primary" style="padding:5px 10px; font-size:0.72rem; background:linear-gradient(135deg,#7c3aed 0%,#4c1d95 100%);" onclick="startOcrPdf('${f.pdf.replace(/'/g, "\\'")}')">🤖 পড়ুন</button>
          </td>
        </tr>`).join('');

    // সম্পন্ন গুলো নিচে ধূসর করে
    const doneRows = done.map(f => `
      <tr style="border-bottom:1px solid #f1f5f9; opacity:0.65;">
        <td style="padding:7px 10px; font-size:0.75rem; word-break:break-all;">${f.file_name}</td>
        <td style="padding:7px 10px; text-align:center; font-size:0.78rem;">${f.voters}</td>
        <td style="padding:7px 10px; text-align:center;"><span style="background:#dcfce7; color:#166534; padding:2px 8px; border-radius:20px; font-size:0.72rem; font-weight:700;">✅ সম্পন্ন</span></td>
        <td style="padding:7px 10px; text-align:center; font-size:0.72rem; color:var(--text-muted);">—</td>
      </tr>`).join('');

    tbody.innerHTML = rows + doneRows;
  }

  // টেবিলের "পড়ুন" বাটন — একটি PDF-এর OCR শুরু
  window.startOcrPdf = async (pdf) => {
    try {
      const resp = await adminFetch('/api/ocr-pdf', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdf })
      });
      const data = await resp.json().catch(() => ({}));
      if (data.duplicate) { showToast('⚠️ এই PDF আগেই হয়ে গেছে'); return; }
      if (!resp.ok) throw new Error(data.error || 'HTTP ' + resp.status);
      showToast('🤖 OCR শুরু হয়েছে: ' + pdf.split('/').pop());
      setTimeout(loadPdfList, 3000);
      pollOcrStatus();
    } catch (e) {
      showToast('ব্যর্থ: ' + e.message);
    }
  };

  if (btnSaveOverrides) {
    btnSaveOverrides.addEventListener('click', async () => {
      const pdf = overrideSelect ? overrideSelect.value : '';
      if (!pdf) {
        if (overrideResult) overrideResult.textContent = '⚠️ আগে একটি PDF বেছে নিন';
        return;
      }
      const raw = overrideNames ? overrideNames.value : '';
      const names = raw.split(/[\n,]/).map(s => s.trim()).filter(Boolean);
      try {
        if (overrideResult) overrideResult.textContent = '💾 সেভ হচ্ছে...';
        const resp = await adminFetch('/api/pdf-names', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf, names })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        if (overrideResult) {
          overrideResult.style.color = 'var(--success)';
          overrideResult.textContent = '✓ ' + data.count + ' টি নাম সেভ হয়েছে — এখন এই নামগুলো দিয়ে সার্চ হবে';
        }
        showToast('নামের তালিকা সেভ হয়েছে ✓');
        loadPdfList();
      } catch (e) {
        console.error('[Overrides] save error:', e);
        if (overrideResult) {
          overrideResult.style.color = 'var(--accent)';
          overrideResult.textContent = 'সেভ ব্যর্থ: ' + e.message;
        }
      }
    });
  }

  // বাল্ক ট্যাব খুললে তালিকা লোড
  if (tabBulkForm) {
    const origBulkClick = tabBulkForm.onclick;
    tabBulkForm.addEventListener('click', () => { loadPdfList(); pollOcrStatus(); });
  }

  /* ---------- OCR বাটন + স্ট্যাটাস ---------- */
  const ocrPdfSelect = document.getElementById('ocr_pdf_select');
  const btnOcrOne = document.getElementById('btnOcrOne');
  const btnOcrAll = document.getElementById('btnOcrAll');
  const ocrStatus = document.getElementById('ocrStatus');
  let ocrPollTimer = null;

  function pollOcrStatus() {
    adminFetch('/api/ocr-status').then(r => r.json()).then(data => {
      const st = data.state || {};
      if (!ocrStatus) return;
      // মোট কতগুলো PDF-এর OCR সম্পন্ন + কতজন ভোটার পড়া হয়েছে
      const pr = data.processed || {};
      const summary = (pr.pdfs ? `✅ মোট ${pr.pdfs} টি PDF-এর OCR সম্পন্ন — ${pr.voters} জন ভোটার পড়া হয়েছে\n` : '');
      let msg = '';
      if (st.running && st.current) {
        msg = '🤖 পড়ছে: ' + st.current + '\n' + (st.log || []).slice(-4).join('\n');
        ocrStatus.style.color = '#7c3aed';
      } else if ((st.queued || 0) > 0) {
        msg = '⏳ কিউতে ' + st.queued + ' টি PDF অপেক্ষায়...';
        ocrStatus.style.color = '#b45309';
      } else if (st.lastResult) {
        msg = (st.lastResult.exitCode === 0 ? '✓ শেষ হয়েছে: ' : '✗ ব্যর্থ: ') + st.lastResult.pdf + '\nমোট সম্পন্ন: ' + (st.done || 0);
        ocrStatus.style.color = st.lastResult.exitCode === 0 ? 'var(--success)' : 'var(--accent)';
      } else {
        msg = 'কিউ খালি — একটি PDF বেছে নিন অথবা সব পড়িয়ে দিন';
        ocrStatus.style.color = 'var(--text-muted)';
      }
      ocrStatus.textContent = summary + msg;

      const busy = st.running || (st.queued || 0) > 0;
      clearTimeout(ocrPollTimer);
      if (busy) ocrPollTimer = setTimeout(pollOcrStatus, 5000);
    }).catch(() => {});
  }

  if (btnOcrOne) {
    btnOcrOne.addEventListener('click', async () => {
      const pdf = ocrPdfSelect ? ocrPdfSelect.value : '';
      if (!pdf) { if (ocrStatus) ocrStatus.textContent = '⚠️ আগে একটি PDF বেছে নিন'; return; }
      try {
        const resp = await adminFetch('/api/ocr-pdf', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pdf })
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        if (ocrStatus) { ocrStatus.style.color = '#7c3aed'; ocrStatus.textContent = '🤖 শুরু হয়েছে... (কয়েক মিনিট লাগবে)'; }
        showToast('OCR শুরু হয়েছে ✓');
        pollOcrStatus();
      } catch (e) {
        if (ocrStatus) { ocrStatus.style.color = 'var(--accent)'; ocrStatus.textContent = 'শুরু করা যায়নি: ' + e.message; }
      }
    });
  }

  if (btnOcrAll) {
    btnOcrAll.addEventListener('click', async () => {
      if (!confirm('সব PDF একে একে পড়া হবে — এতে কয়েক ঘণ্টা লাগতে পারে (ব্যাকগ্রাউন্ডে চলবে)। চালাবেন?')) return;
      try {
        const resp = await adminFetch('/api/ocr-queue', { method: 'POST' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data.error || ('HTTP ' + resp.status));
        if (ocrStatus) { ocrStatus.style.color = '#b45309'; ocrStatus.textContent = '⏳ ' + data.added + ' টি PDF কিউতে যোগ হয়েছে — একে একে পড়া হবে'; }
        showToast('সব PDF কিউতে যোগ হয়েছে ✓');
        pollOcrStatus();
      } catch (e) {
        if (ocrStatus) { ocrStatus.style.color = 'var(--accent)'; ocrStatus.textContent = 'ব্যর্থ: ' + e.message; }
      }
    });
  }

  /* ==========================================================================
     4. Firebase Integration & Forms Submission
     ========================================================================== */
  let db, storage;
  const firebaseStatus = document.getElementById('firebaseStatus');

  function initFirebaseConnection() {
    // If not authenticated, don't run
    if (localStorage.getItem('juwel_e_sheba_admin_auth') !== 'true') return;

    if (typeof isFirebaseConfigured !== 'undefined' && isFirebaseConfigured()) {
      try {
        // Prevent re-initialization error
        if (firebase.apps.length === 0) {
          firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        storage = firebase.storage();
        
        // Enable Firestore offline persistence so data is cached locally!
        db.enablePersistence().catch((err) => {
          console.warn('[Firebase] Offline persistence warning:', err.code);
        });

        if (firebaseStatus) {
          firebaseStatus.textContent = "✓ ফায়ারবেস ক্লাউড সংযোগ সম্পন্ন (অনলাইন মোড)";
          firebaseStatus.className = "status-badge connected";
        }
        console.log('[Firebase] Successfully connected and online!');
      } catch (e) {
        console.error('[Firebase] Connection error:', e);
      }
    } else {
      if (firebaseStatus) {
        firebaseStatus.textContent = "সংযোগবিহীন মোড (কনফিগ ফাইল চেক করুন)";
        firebaseStatus.className = "status-badge";
      }
      console.log('[Firebase] Running in offline fallback mode using local mock lists.');
    }
  }

  // অফলাইন মোডে আপলোড: রেকর্ড + PDF সার্ভারে স্থায়ীভাবে সংরক্ষণ
  async function persistUpload(type, record, file) {
    showToast('সার্ভারে সংরক্ষণ করা হচ্ছে, দয়া করে অপেক্ষা করুন...');
    try {
      const payload = { type, record };
      if (file) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        payload.fileBase64 = String(dataUrl).split(',')[1] || '';
        payload.fileName = file.name;
      }
      const resp = await adminFetch('/api/upload-record', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        if (data.duplicate) {
          showToast('এই রেকর্ডটি সার্ভারেও ইতিমধ্যে রয়েছে!');
        } else {
          throw new Error(data.error || ('HTTP ' + resp.status));
        }
        return;
      }
      showToast('রেকর্ড ও PDF সার্ভারে স্থায়ীভাবে সংরক্ষিত হয়েছে! ✓');
    } catch (err) {
      console.warn('[Upload] Server persistence failed:', err);
      showToast('সার্ভারে সেভ ব্যর্থ — শুধু এই সেশনের জন্য যুক্ত হয়েছে ⚠️');
    }
  }

  // Handle NID Form submission
  if (nidUploadForm) {
    nidUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const newNidRecord = {
        sl: parseInt(document.getElementById('n_sl').value),
        name: document.getElementById('n_name').value.trim(),
        name_en: document.getElementById('n_name_en').value.trim(),
        nid: document.getElementById('n_nid').value.trim(),
        father: document.getElementById('n_father').value.trim(),
        mother: document.getElementById('n_mother').value.trim(),
        dob: document.getElementById('n_dob').value.trim(),
        village: document.getElementById('n_village').value.trim(),
        union: document.getElementById('n_union').value.trim() || 'গড়াগ্ৰাম',
        post: document.getElementById('n_post').value.trim() || 'খামাত গড়াগ্ৰাম',
        upazila: document.getElementById('n_upazila').value.trim() || 'কিশোরগঞ্জ',
        district: document.getElementById('n_district').value.trim() || 'নীলফামারী',
        phone: '01738782255',
        voter_no: document.getElementById('n_nid').value.trim(),
        gender: document.getElementById('n_gender').value,
        occupation: document.getElementById('n_occupation').value.trim(),
        search_text: (document.getElementById('n_search_text') || {}).value ? document.getElementById('n_search_text').value.trim() : '',
        pdf: 'pdfs/fallback.pdf', // Default
        createdAt: new Date().toISOString()
      };

      const file = nPdfFile.files[0];

      if (db && storage) {
        // ONLINE SUBMISSION (FIREBASE CLOUD)
        try {
          showToast('ক্লাউডে আপলোড হচ্ছে, দয়া করে অপেক্ষা করুন...');
          
          if (file) {
            // Upload PDF to Firebase Storage
            const fileRef = storage.ref().child(`nids/${newNidRecord.nid}_${file.name}`);
            const snapshot = await fileRef.put(file);
            const downloadUrl = await snapshot.ref.getDownloadURL();
            newNidRecord.pdf = downloadUrl;
          }
          
          // Save document to Firestore
          await db.collection('nid_records').doc(newNidRecord.nid).set(newNidRecord);
          showToast('NID সফলভাবে ফায়ারবেস ক্লাউড ডেটাবেজে সংরক্ষিত হয়েছে! ✓');
          nidUploadForm.reset();
          if (nidFileLabel) nidFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        } catch (error) {
          console.error('[Firebase] Error saving NID, falling back to local save:', error);
          const exists = DATA.some(r => r.nid === newNidRecord.nid);
          if (exists) {
            showToast('ক্লাউড সংরক্ষণ ব্যর্থ এবং এই NID লোকাল ডাটাবেজেও রয়েছে!');
          } else {
            DATA.push(newNidRecord);
            nidUploadForm.reset();
            if (nidFileLabel) nidFileLabel.textContent = '📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন';
            showToast('ক্লাউড সংরক্ষণ ব্যর্থ হয়েছে — রেকর্ডটি লোকাল ডাটাবেজে সংরক্ষিত হয়েছে! ⚠️');
          }
        }
      } else {
        // OFFLINE SUBMISSION (সার্ভারে স্থায়ী সেভ + লোকাল ফলব্যাক)
        const exists = DATA.some(r => r.nid === newNidRecord.nid) ||
          (typeof UPLOADED_RECORDS !== 'undefined' && UPLOADED_RECORDS.some(r => r.type === 'nid' && r.nid === newNidRecord.nid));
        if (exists) {
          showToast('এই NID বা ভোটার নম্বরটি ইতিমধ্যে ডাটাবেজে রয়েছে!');
          return;
        }

        DATA.push(newNidRecord);
        nidUploadForm.reset();
        if (nidFileLabel) nidFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        persistUpload('nid', newNidRecord, file);
      }
    });
  }

  // Handle Porcha Form submission
  if (porchaUploadForm) {
    porchaUploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const newKhatianRecord = {
        sl: KHATIAN_DATA.length + 1,
        khatian_no: document.getElementById('k_no').value.trim(),
        dag_no: document.getElementById('k_dag').value.trim(),
        owner: document.getElementById('k_owner').value.trim(),
        father: document.getElementById('k_father').value.trim(),
        mouza: document.getElementById('k_mouza').value,
        jl_no: document.getElementById('k_jl').value.trim() || '১২',
        upazila: document.getElementById('k_upazila').value.trim() || 'কিশোরগঞ্জ',
        district: document.getElementById('k_district').value.trim() || 'নীলফামারী',
        division: 'রংপুর',
        land_type: document.getElementById('k_type').value.trim() || 'ভিটা',
        area: document.getElementById('k_area').value.trim() || '০.১৫ একর',
        search_text: (document.getElementById('k_search_text') || {}).value ? document.getElementById('k_search_text').value.trim() : '',
        pdf: 'pdfs/fallback.pdf', // Default
        createdAt: new Date().toISOString()
      };

      const file = kPdfFile.files[0];

      if (db && storage) {
        // ONLINE SUBMISSION (FIREBASE CLOUD)
        try {
          showToast('ক্লাউডে পর্চা আপলোড হচ্ছে, দয়া করে অপেক্ষা করুন...');
          
          if (file) {
            // Upload PDF to Firebase Storage
            const fileRef = storage.ref().child(`khatians/${newKhatianRecord.khatian_no}_${file.name}`);
            const snapshot = await fileRef.put(file);
            const downloadUrl = await snapshot.ref.getDownloadURL();
            newKhatianRecord.pdf = downloadUrl;
          }

          // Save document to Firestore
          const docId = `${newKhatianRecord.mouza}_khatian_${newKhatianRecord.khatian_no}`;
          await db.collection('khatian_records').doc(docId).set(newKhatianRecord);
          showToast('ই-পর্চা সফলভাবে ফায়ারবেস ক্লাউডে সংরক্ষিত হয়েছে! ✓');
          porchaUploadForm.reset();
          if (porchaFileLabel) porchaFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        } catch (error) {
          console.error('[Firebase] Error saving Khatian, falling back to local save:', error);
          const exists = KHATIAN_DATA.some(r => r.khatian_no === newKhatianRecord.khatian_no && r.mouza === newKhatianRecord.mouza);
          if (exists) {
            showToast('ক্লাউড সংরক্ষণ ব্যর্থ এবং এই খতিয়ানটি লোকাল ডাটাবেজেও রয়েছে!');
          } else {
            KHATIAN_DATA.push(newKhatianRecord);
            porchaUploadForm.reset();
            if (porchaFileLabel) porchaFileLabel.textContent = '📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন';
            showToast('ক্লাউড সংরক্ষণ ব্যর্থ হয়েছে — রেকর্ডটি লোকাল ডাটাবেজে সংরক্ষিত হয়েছে! ⚠️');
          }
        }
      } else {
        // OFFLINE SUBMISSION (সার্ভারে স্থায়ী সেভ + লোকাল ফলব্যাক)
        const exists = KHATIAN_DATA.some(r => r.khatian_no === newKhatianRecord.khatian_no && r.mouza === newKhatianRecord.mouza) ||
          (typeof UPLOADED_RECORDS !== 'undefined' && UPLOADED_RECORDS.some(r => r.type === 'khatian' && r.khatian_no === newKhatianRecord.khatian_no && r.mouza === newKhatianRecord.mouza));
        if (exists) {
          showToast('এই মৌজায় এই খতিয়ান নম্বরটি ইতিমধ্যে রয়েছে!');
          return;
        }

        KHATIAN_DATA.push(newKhatianRecord);
        porchaUploadForm.reset();
        if (porchaFileLabel) porchaFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
        persistUpload('khatian', newKhatianRecord, file);
      }
    });
  }


  /* ==========================================================================
     5. Displaying & Deleting Lists (Admin Management)
     ========================================================================== */
  const btnViewNidList = document.getElementById('btnViewNidList');
  const btnViewKhatianList = document.getElementById('btnViewKhatianList');
  const recordsTable = document.getElementById('recordsTable');
  const tableHeaders = document.getElementById('tableHeaders');
  const tableBody = document.getElementById('tableBody');
  const noRecordsMsg = document.getElementById('noRecordsMsg');

  // Load and Render NID List
  const loadNidList = async () => {
    let list = [];
    noRecordsMsg.style.display = 'block';
    noRecordsMsg.textContent = 'তালিকা লোড হচ্ছে, দয়া করে অপেক্ষা করুন...';
    recordsTable.style.display = 'none';

    if (db) {
      try {
        const querySnapshot = await db.collection('nid_records').orderBy('sl', 'asc').get();
        querySnapshot.forEach((doc) => {
          list.push({ docId: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error('[Firebase] Error fetching NIDs:', error);
      }
    } else {
      list = [...DATA];
    }

    if (list.length === 0) {
      noRecordsMsg.style.display = 'block';
      noRecordsMsg.textContent = 'ডেটাবেজে কোনো NID রেকর্ড খুঁজে পাওয়া যায়নি।';
      recordsTable.style.display = 'none';
      return;
    }

    noRecordsMsg.style.display = 'none';
    recordsTable.style.display = 'table';
    
    // Set headers
    tableHeaders.innerHTML = `
      <th>ক্রমিক</th>
      <th>নাম</th>
      <th>ভোটার/NID নম্বর</th>
      <th>পিতার নাম</th>
      <th>ইউনিয়ন</th>
      <th>গ্রাম</th>
      <th>অ্যাকশন</th>
    `;

    // Populate rows
    tableBody.innerHTML = list.map(r => `
      <tr>
        <td><b>#${esc(r.sl)}</b></td>
        <td><b>${esc(r.name)}</b></td>
        <td><code style="font-size:0.9rem; font-weight:700;">${esc(r.nid)}</code></td>
        <td>${esc(r.father)}</td>
        <td>${esc(r.union || 'গড়াগ্ৰাম')}</td>
        <td>${esc(r.village)}</td>
        <td>
          <button class="btn-delete" onclick="deleteNidRecord('${esc(r.docId || r.nid)}')">🗑️ মুছুন</button>
        </td>
      </tr>
    `).join('');
  };

  // Load and Render Khatian List
  const loadKhatianList = async () => {
    let list = [];
    noRecordsMsg.style.display = 'block';
    noRecordsMsg.textContent = 'তালিকা লোড হচ্ছে, দয়া করে অপেক্ষা করুন...';
    recordsTable.style.display = 'none';

    if (db) {
      try {
        const querySnapshot = await db.collection('khatian_records').get();
        querySnapshot.forEach((doc) => {
          list.push({ docId: doc.id, ...doc.data() });
        });
      } catch (error) {
        console.error('[Firebase] Error fetching Khatians:', error);
      }
    } else {
      list = [...KHATIAN_DATA];
    }

    if (list.length === 0) {
      noRecordsMsg.textContent = 'ডেটাবেজে কোনো খতিয়ান বা পর্চা রেকর্ড খুঁজে পাওয়া যায়নি।';
      recordsTable.style.display = 'none';
      return;
    }

    noRecordsMsg.style.display = 'none';
    recordsTable.style.display = 'table';

    // Set headers
    tableHeaders.innerHTML = `
      <th>খতিয়ান নং</th>
      <th>মালিকের নাম</th>
      <th>পিতার নাম</th>
      <th>মৌজা</th>
      <th>দাগ নম্বর</th>
      <th>জমির পরিমাণ</th>
      <th>শ্রেণী</th>
      <th>অ্যাকশন</th>
    `;

    // Populate rows
    tableBody.innerHTML = list.map(r => `
      <tr>
        <td><b>${esc(r.khatian_no)}</b></td>
        <td><b>${esc(r.owner)}</b></td>
        <td>${esc(r.father)}</td>
        <td>${esc(r.mouza)}</td>
        <td><code style="font-size:0.9rem; font-weight:700; color:var(--accent);">${esc(r.dag_no)}</code></td>
        <td>${esc(r.area)}</td>
        <td>${esc(r.land_type)}</td>
        <td>
          <button class="btn-delete" onclick="deleteKhatianRecord('${esc(r.docId || (r.mouza + '_khatian_' + r.khatian_no))}', '${esc(r.khatian_no)}', '${esc(r.mouza)}')">🗑️ মুছুন</button>
        </td>
      </tr>
    `).join('');
  };

  // Bind Buttons
  if (btnViewNidList) btnViewNidList.addEventListener('click', loadNidList);
  if (btnViewKhatianList) btnViewKhatianList.addEventListener('click', loadKhatianList);

  // Global delete functions
  window.deleteNidRecord = async (docId) => {
    if (!confirm('আপনি কি নিশ্চিতভাবে এই NID রেকর্ডটি সম্পূর্ণ মুছে ফেলতে চান?')) return;
    
    if (db) {
      try {
        await db.collection('nid_records').doc(docId).delete();
        showToast('NID রেকর্ড সফলভাবে ক্লাউড থেকে মুছে ফেলা হয়েছে! ✓');
        loadNidList();
      } catch (error) {
        showToast('মুছতে ব্যর্থ হয়েছে: ' + error.message);
      }
    } else {
      // Local Delete
      const index = DATA.findIndex(r => r.nid === docId);
      if (index > -1) {
        DATA.splice(index, 1);
        showToast('NID রেকর্ড সফলভাবে লোকাল মেমোরি থেকে মোছা হয়েছে! ✓');
        loadNidList();
      }
    }
  };

  window.deleteKhatianRecord = async (docId, khatianNo, mouza) => {
    if (!confirm(`আপনি কি নিশ্চিতভাবে ${mouza} মৌজার খতিয়ান নং: ${khatianNo} রেকর্ডটি মুছতে চান?`)) return;

    if (db) {
      try {
        await db.collection('khatian_records').doc(docId).delete();
        showToast('খতিয়ান রেকর্ড ক্লাউড থেকে সফলভাবে মোছা হয়েছে! ✓');
        loadKhatianList();
      } catch (error) {
        showToast('মুছতে ব্যর্থ হয়েছে: ' + error.message);
      }
    } else {
      // Local Delete
      const index = KHATIAN_DATA.findIndex(r => r.khatian_no === khatianNo && r.mouza === mouza);
      if (index > -1) {
        KHATIAN_DATA.splice(index, 1);
        showToast('খতিয়ান রেকর্ড লোকাল মেমোরি থেকে সফলভাবে মোছা হয়েছে! ✓');
        loadKhatianList();
      }
    }
  };

  // Toast handler helper
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

  // Escape HTML helper
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }
});
