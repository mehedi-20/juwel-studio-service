// Admin Panel Script for Juwel Telecom
document.addEventListener('DOMContentLoaded', () => {

  /* ==========================================================================
     1. Password Security Check (Admin Panel)
     ========================================================================== */
  const ALLOWED_PASSWORDS = ["mehedi987", "Julfikar5320@"];
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
  let currentAdminTab = 'nid'; // 'nid' or 'porcha'
  const tabNidForm = document.getElementById('tabNidForm');
  const tabPorchaForm = document.getElementById('tabPorchaForm');
  const nidUploadForm = document.getElementById('nidUploadForm');
  const porchaUploadForm = document.getElementById('porchaUploadForm');

  if (tabNidForm && tabPorchaForm) {
    tabNidForm.addEventListener('click', () => {
      if (currentAdminTab === 'nid') return;
      currentAdminTab = 'nid';
      tabNidForm.classList.add('active-tab');
      tabPorchaForm.classList.remove('active-tab');
      if (nidUploadForm) nidUploadForm.style.display = 'block';
      if (porchaUploadForm) porchaUploadForm.style.display = 'none';
    });

    tabPorchaForm.addEventListener('click', () => {
      if (currentAdminTab === 'porcha') return;
      currentAdminTab = 'porcha';
      tabPorchaForm.classList.add('active-tab');
      tabNidForm.classList.remove('active-tab');
      if (porchaUploadForm) porchaUploadForm.style.display = 'block';
      if (nidUploadForm) nidUploadForm.style.display = 'none';
    });
  }


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
        // OFFLINE SUBMISSION (LOCAL DATA FALLBACK)
        // Check if record already exists in global array
        const exists = DATA.some(r => r.nid === newNidRecord.nid);
        if (exists) {
          showToast('এই NID বা ভোটার নম্বরটি ইতিমধ্যে ডাটাবেজে রয়েছে!');
          return;
        }

        // Add to local array
        DATA.push(newNidRecord);
        showToast('NID সফলভাবে অস্থায়ীভাবে যুক্ত করা হয়েছে! (লোকাল মোড) ✓');
        nidUploadForm.reset();
        if (nidFileLabel) nidFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
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
        // OFFLINE SUBMISSION (LOCAL DATA FALLBACK)
        const exists = KHATIAN_DATA.some(r => r.khatian_no === newKhatianRecord.khatian_no && r.mouza === newKhatianRecord.mouza);
        if (exists) {
          showToast('এই মৌজায় এই খতিয়ান নম্বরটি ইতিমধ্যে রয়েছে!');
          return;
        }

        KHATIAN_DATA.push(newKhatianRecord);
        showToast('ই-পর্চা সফলভাবে লোকাল মেমোরিতে যুক্ত করা হয়েছে! ✓');
        porchaUploadForm.reset();
        if (porchaFileLabel) porchaFileLabel.textContent = `📁 এখানে ক্লিক করে PDF ফাইল সিলেক্ট করুন`;
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
