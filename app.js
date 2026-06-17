// ═══════════════════════════════════════════════════════════════
//  AUTH & USERS — Supabase Auth
// ═══════════════════════════════════════════════════════════════
let currentUser = null;

// Role map: define which Supabase email belongs to which role/name
// Keys are lowercase emails. Add more as needed.
const ROLE_MAP = {
  'maimuna@maymoon.com': { name: 'Maimuna Aliyu', role: 'admin' },
  'staff@maymoon.com':   { name: 'Staff',         role: 'staff' },
};

function isAdmin() { return currentUser && currentUser.role === 'admin'; }

// ─── Password show/hide toggle ────────────────────────────────
function togglePasswordVisibility() {
  const input = document.getElementById('loginPassword');
  const icon  = document.getElementById('pwEyeIcon');
  if (!input) return;
  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';
  // Switch between eye and eye-off SVG paths
  icon.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>`;
}

async function doLogin() {
  const email = document.getElementById('loginUsername').value.trim();
  const pass  = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';

  if (!email || !pass) { errEl.style.display = 'block'; return; }

  const btn = document.querySelector('#loginPage .btn-danger');
  if (btn) { btn.disabled = true; btn.innerHTML = '<svg style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Signing In…'; }

  try {
    // Sign in via Supabase Auth REST
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
      body: JSON.stringify({ email, password: pass })
    });
    const data = await res.json();

    if (!res.ok || data.error) {
      errEl.style.display = 'block';
      if (btn) { btn.disabled = false; btn.innerHTML = '<svg style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Sign In'; }
      return;
    }

    // Store auth token for future requests
    _authToken = data.access_token;
    _refreshToken = data.refresh_token;

    // Resolve role from role map, or default to staff
    const emailKey = (data.user?.email || email).toLowerCase();
    const roleInfo = ROLE_MAP[emailKey] || { name: data.user?.email || email, role: 'staff' };

    currentUser = { username: emailKey, email: emailKey, ...roleInfo };

    localStorage.setItem('_authToken', _authToken);
    localStorage.setItem('_refreshToken', _refreshToken);
    localStorage.setItem('_currentUser', JSON.stringify(currentUser));

    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('app').classList.add('active');
    applyRoleUI();
    // Bootstrap AFTER login so all Supabase requests use the user JWT
    _bootstrapped = false; // force fresh load with authenticated token
    await bootstrap();
    showView('dashboard');
    startProactiveTokenRefresh();
  } catch (e) {
    errEl.style.display = 'block';
    if (btn) { btn.disabled = false; btn.innerHTML = '<svg style="width:16px;height:16px;fill:none;stroke:white;stroke-width:2" viewBox="0 0 24 24"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> Sign In'; }
    console.error('Login error:', e);
  }
}

function doLogout() {
  currentUser = null;
  _authToken = null; _refreshToken = null;
  _bootstrapped = false; // force re-bootstrap on next login
  stopProactiveTokenRefresh();
  localStorage.removeItem('_authToken');
  localStorage.removeItem('_refreshToken');
  localStorage.removeItem('_currentUser');
  // Clear cache so stale data isn't shown
  Object.keys(CACHE).forEach(k => CACHE[k] = null);
  document.getElementById('app').classList.remove('active');
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
}

// Staff-allowed views only
const STAFF_VIEWS = ['dashboard','addKeke','drivers','alerts','payments','completed'];

function applyRoleUI() {
  if (!currentUser) return;
  const $ = id => document.getElementById(id);
  if ($('sidebarAvatar')) $('sidebarAvatar').textContent = currentUser.name.charAt(0).toUpperCase();
  if ($('sidebarName'))   $('sidebarName').textContent   = currentUser.name;
  if ($('sidebarRole'))   $('sidebarRole').textContent   = isAdmin() ? 'Administrator' : 'Staff';
  const badge = $('roleBadge');
  if (badge) { badge.textContent = isAdmin() ? '🔑 Admin' : '👤 Staff'; badge.className = isAdmin() ? 'badge badge-red' : 'badge badge-gray'; badge.style.display = ''; }

  if (isAdmin()) {
    // Show everything for admin
    ['nav-activityLog','nav-section-analytics','nav-section-settings'].forEach(id => { const el=$(id); if(el) el.style.display=''; });
    if ($('payActionsHeader')) $('payActionsHeader').style.display = '';
    ['stat-card-total-keke','stat-card-active','stat-card-completed'].forEach(id=>{ const el=$(id); if(el) el.style.display=''; });
  } else {
    // Staff: hide Analytics, Settings, Activity Log, Actions column, and 3 admin-only stat cards
    ['nav-section-analytics','nav-section-settings','nav-activityLog'].forEach(id => { const el=$(id); if(el) el.style.display='none'; });
    if ($('payActionsHeader')) $('payActionsHeader').style.display = 'none';
    ['stat-card-total-keke','stat-card-active','stat-card-completed'].forEach(id=>{ const el=$(id); if(el) el.style.display='none'; });
  }
}

// ─── Auto-logout removed ──────────────────────────────────────
function startInactivityTimer() {}
function stopInactivityTimer()  {}
function resetInactivityTimer() {}


// ═══════════════════════════════════════════════════════════════
//  SUPABASE CONFIGURATION
//  Replace the two values below with your actual project values.
//  Found in: Supabase Dashboard → Project Settings → API
// ═══════════════════════════════════════════════════════════════
const SUPABASE_URL = 'https://mpbpeawuzdvlnceaxbaq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wYnBlYXd1emR2bG5jZWF4YmFxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3ODExMzUsImV4cCI6MjA5NTM1NzEzNX0.zhm5J65HIyxg0wu-16A6G_L5jzMsZdh61Uaq1FQMMBo';

// Auth state — set after Supabase Auth sign-in
let _authToken = null, _refreshToken = null;
let _refreshInFlight = null; // dedupes concurrent refresh attempts

// Calls Supabase's token refresh endpoint using the stored refresh token to
// get a fresh access token, without forcing the user to log in again.
async function _refreshAuthToken() {
  if (!_refreshToken) return false;
  if (_refreshInFlight) return _refreshInFlight; // another request already refreshing — wait on it
  _refreshInFlight = (async () => {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY },
        body: JSON.stringify({ refresh_token: _refreshToken })
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.access_token) return false;
      _authToken = data.access_token;
      _refreshToken = data.refresh_token || _refreshToken;
      localStorage.setItem('_authToken', _authToken);
      localStorage.setItem('_refreshToken', _refreshToken);
      return true;
    } catch (e) {
      return false;
    } finally {
      _refreshInFlight = null;
    }
  })();
  return _refreshInFlight;
}

// Detects Supabase's "JWT expired" / 401 responses specifically (as opposed
// to other errors like permission denied, which a refresh won't fix).
function _isAuthExpiredResponse(res, bodyText) {
  if (res.status !== 401) return false;
  return /jwt expired|pgrst303|invalid jwt|jwt is expired/i.test(bodyText || '');
}

// Wraps a fetch call: if it comes back as an expired-JWT 401, silently
// refresh the token and retry the SAME request once before giving up.
async function _sbFetch(url, options) {
  let res = await fetch(url, options);
  if (!res.ok) {
    const bodyText = await res.clone().text();
    if (_isAuthExpiredResponse(res, bodyText)) {
      const refreshed = await _refreshAuthToken();
      if (refreshed) {
        // Rebuild headers with the new token and retry once
        const retryOptions = { ...options, headers: { ...options.headers, 'Authorization': 'Bearer ' + _authToken } };
        res = await fetch(url, retryOptions);
      } else {
        // Refresh token itself is dead — the session is truly over.
        // Force a clean logout so the user gets a clear "please sign in again"
        // instead of silent, repeated 401 failures.
        toast('⚠️ Your session expired. Please sign in again.', 'error');
        setTimeout(() => doLogout(), 800);
      }
    }
  }
  return res;
}

// ─── Supabase REST client (no npm required) ──────────────────
const sb = {
  _h: () => ({
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (_authToken || SUPABASE_KEY)
  }),
  async select(table, filter='') {
    const r = await _sbFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { headers: { ...sb._h(), 'Prefer': 'return=representation' } });
    if (!r.ok) throw new Error(`GET ${table}: ${await r.text()}`);
    return r.json();
  },
  async insert(table, row) {
    const r = await _sbFetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers:{ ...sb._h(), 'Prefer':'return=representation' }, body:JSON.stringify(row) });
    if (!r.ok) throw new Error(`INSERT ${table}: ${await r.text()}`);
    const d = await r.json(); return Array.isArray(d) ? d[0] : d;
  },
  async upsert(table, row) {
    const r = await _sbFetch(`${SUPABASE_URL}/rest/v1/${table}`, { method:'POST', headers:{ ...sb._h(), 'Prefer':'return=representation,resolution=merge-duplicates' }, body:JSON.stringify(row) });
    if (!r.ok) throw new Error(`UPSERT ${table}: ${await r.text()}`);
    const d = await r.json(); return Array.isArray(d) ? d[0] : d;
  },
  async update(table, filter, changes) {
    const r = await _sbFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method:'PATCH', headers:{ ...sb._h(), 'Prefer':'return=representation' }, body:JSON.stringify(changes) });
    if (!r.ok) throw new Error(`PATCH ${table}: ${await r.text()}`);
    const d = await r.json(); return Array.isArray(d) ? d[0] : d;
  },
  async delete(table, filter) {
    const r = await _sbFetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method:'DELETE', headers:sb._h() });
    if (!r.ok) throw new Error(`DELETE ${table}: ${await r.text()}`);
  },
  async getSetting(key) { const rows = await sb.select('maymoon_settings', `key=eq.${key}`); return rows.length ? rows[0].value : null; },
  async saveSetting(key, value) { await sb.upsert('maymoon_settings', { key, value, updated_at: new Date().toISOString() }); }
};

// ─── Sync indicator ───────────────────────────────────────────
// Tracks real connectivity (navigator.onLine + actual fetch failures) so the
// badge only ever says "Offline" when the device genuinely has no internet.
// A failed Supabase call while the browser IS online shows "Reconnecting…"
// and auto-retries quietly instead of getting stuck on a scary red label.
let _lastSyncStatus = 'synced';
let _reconnectTimer = null;

function setSyncStatus(status) {
  _lastSyncStatus = status;
  const dot = document.querySelector('.sync-dot'), span = document.querySelector('.sync-indicator span');
  if (!dot || !span) return;
  dot.className = 'sync-dot';

  if (status === 'syncing') {
    dot.classList.add('syncing'); span.textContent = 'Saving…';
    clearReconnectLoop();
  } else if (status === 'error') {
    if (!navigator.onLine) {
      // Genuinely no internet connection
      dot.classList.add('error'); span.textContent = 'Offline';
    } else {
      // Internet is fine — this was a transient/server-side hiccup, not a real outage
      dot.classList.add('error'); span.textContent = 'Reconnecting…';
    }
    startReconnectLoop();
  } else {
    span.textContent = 'Supabase ☁️';
    clearReconnectLoop();
  }
}

// Quietly retry the bootstrap load in the background until it succeeds,
// so the badge recovers on its own without the user needing to refresh.
function startReconnectLoop() {
  if (_reconnectTimer) return; // already retrying
  _reconnectTimer = setInterval(async () => {
    if (!navigator.onLine) return; // wait for the browser to report we're back online
    try {
      await sb.select('keke_loans', 'limit=1');
      // Success — connection is healthy again, do a full silent refresh
      clearReconnectLoop();
      _bootstrapped = false;
      await bootstrap();
      toast('✅ Connection restored — back in sync.');
    } catch (e) {
      // Still failing, keep the loop going
    }
  }, 5000);
}
function clearReconnectLoop() {
  if (_reconnectTimer) { clearInterval(_reconnectTimer); _reconnectTimer = null; }
}

// Listen for the browser's own online/offline events for instant feedback,
// independent of whatever Supabase call happens to be in flight.
window.addEventListener('online', () => {
  toast('🌐 Internet connection restored.');
  if (_lastSyncStatus === 'error') {
    _bootstrapped = false;
    bootstrap();
  }
});
window.addEventListener('offline', () => {
  setSyncStatus('error'); // navigator.onLine is now false, so this correctly shows "Offline"
  toast('⚠️ No internet connection. Your device is offline.', 'error');
});

// ═══════════════════════════════════════════════════════════════
//  DRAFT AUTOSAVE — protects unsaved typing from accidental refresh,
//  tab close, or browser crash. Saves to localStorage as the user types,
//  and offers to restore it next time the form is opened.
// ═══════════════════════════════════════════════════════════════
const DRAFT_PREFIX = '_draft_';
let _draftSaveTimers = {};

// Reads the current value of every field in `fieldIds` and stores them
// under `draftKey`. Debounced per draftKey so fast typing doesn't spam writes.
function saveDraft(draftKey, fieldIds) {
  clearTimeout(_draftSaveTimers[draftKey]);
  _draftSaveTimers[draftKey] = setTimeout(() => {
    const data = {};
    let hasContent = false;
    fieldIds.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      data[id] = el.value;
      if (el.value && el.value.trim() !== '') hasContent = true;
    });
    try {
      if (hasContent) {
        localStorage.setItem(DRAFT_PREFIX + draftKey, JSON.stringify({ data, savedAt: Date.now() }));
      } else {
        // Nothing typed — don't leave an empty draft lying around
        localStorage.removeItem(DRAFT_PREFIX + draftKey);
      }
    } catch (e) { /* localStorage full or unavailable — fail silently, not critical */ }
  }, 400);
}

function getDraft(draftKey) {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + draftKey);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
    if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(DRAFT_PREFIX + draftKey); // stale — discard quietly
      return null;
    }
    return draft;
  } catch (e) { return null; }
}

function clearDraft(draftKey) {
  clearTimeout(_draftSaveTimers[draftKey]);
  localStorage.removeItem(DRAFT_PREFIX + draftKey);
}

// Wires up 'input'/'change' listeners on a set of fields so every keystroke
// is autosaved as a draft. Call once per form, after the form's HTML exists.
function wireAutosave(draftKey, fieldIds) {
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el._draftWired) return; // avoid double-binding listeners
    el._draftWired = true;
    el.addEventListener('input', () => saveDraft(draftKey, fieldIds));
    el.addEventListener('change', () => saveDraft(draftKey, fieldIds));
  });
}

// If a draft exists for this key, ask the user whether to restore it.
// Shows a friendly toast-style prompt rather than a jarring confirm() popup.
function offerDraftRestore(draftKey, fieldIds, label) {
  const draft = getDraft(draftKey);
  if (!draft) return;
  const ago = Math.max(1, Math.round((Date.now() - draft.savedAt) / 60000));
  const when = ago < 1 ? 'a moment ago' : ago === 1 ? '1 minute ago' : ago < 60 ? `${ago} minutes ago` : 'a while ago';
  showDraftBanner(draftKey, fieldIds, label, when);
}

function showDraftBanner(draftKey, fieldIds, label, when) {
  const existing = document.getElementById('draftBanner_' + draftKey);
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'draftBanner_' + draftKey;
  banner.style.cssText = 'background:#fef3c7;border:1px solid #fbbf24;border-radius:var(--radius-sm);padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
  banner.innerHTML = `
    <div style="font-size:.85rem;color:#92400e"><strong>📝 Unsaved ${label} found</strong> — saved ${when}, before the page was closed or refreshed. Restore it?</div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <button class="btn btn-primary btn-sm" type="button">Restore</button>
      <button class="btn btn-outline btn-sm" type="button">Discard</button>
    </div>`;
  const [restoreBtn, discardBtn] = banner.querySelectorAll('button');
  restoreBtn.onclick = () => {
    const draft = getDraft(draftKey);
    if (draft) {
      fieldIds.forEach(id => {
        const el = document.getElementById(id);
        if (el && draft.data[id] !== undefined) el.value = draft.data[id];
      });
      // Re-run any dependent UI calculations if present
      if (typeof calcProfit === 'function' && fieldIds.includes('k_cost')) calcProfit();
    }
    banner.remove();
    toast('Draft restored.');
  };
  discardBtn.onclick = () => {
    clearDraft(draftKey);
    banner.remove();
  };
  const target = fieldIds[0] && document.getElementById(fieldIds[0]);
  const card = target ? (target.closest('.card-body') || target.closest('.modal-body')) : null;
  if (card) card.insertBefore(banner, card.firstChild);
}

// ─── In-memory cache ──────────────────────────────────────────
const CACHE = { kekes:null, payments:null, complaints:null, serviceRecords:null, documents:null, activityLog:null, holiday:null, batchSchedules:null };

function _mapKeke(r) { if(!r)return null; return { ...r, total_loan:r.total_loan??0, installment_amount:r.installment_amount??0 }; }
function _mapPayment(r) { if(!r)return null; return { ...r, balance_after:r.balance_after??0, is_short:r.is_short??false, expected_amount:r.expected_amount??0, overpay_amount:r.overpay_amount??0 }; }
function _mapDoc(r) { if(!r)return null; return { ...r, dataUrl: r.data_url||r.dataUrl, data_url: r.data_url||r.dataUrl }; }

// ─── Bootstrap: load all data from Supabase once ─────────────
let _bootstrapped = false;
async function bootstrap() {
  if (_bootstrapped) return;
  setSyncStatus('syncing');
  try {
    const [kekes, payments, complaints, svcRecs, docs, logs, holiday, bsched] = await Promise.all([
      sb.select('keke_loans', 'order=created_at.desc'),
      sb.select('keke_payments', 'order=payment_date.desc,recorded_at.desc'),
      sb.select('keke_complaints', 'order=created_at.desc'),
      sb.select('keke_service_records', 'order=created_at.desc'),
      sb.select('keke_documents', 'order=uploaded_at.desc'),
      sb.select('maymoon_activity_log', 'order=timestamp.desc&limit=500'),
      sb.getSetting('holiday'),
      sb.getSetting('batch_schedules'),
    ]);
    CACHE.kekes          = kekes.map(_mapKeke);
    CACHE.payments       = payments.map(_mapPayment);
    CACHE.complaints     = complaints;
    CACHE.serviceRecords = svcRecs;
    CACHE.documents      = docs;
    CACHE.activityLog    = logs;
    CACHE.holiday        = holiday        || { A:{}, B:{}, C:{} };
    CACHE.batchSchedules = bsched         || { A:{startDate:''}, B:{startDate:''}, C:{startDate:''} };
    _bootstrapped = true;
    setSyncStatus('synced');
  } catch(e) {
    setSyncStatus('error');
    console.error('Supabase bootstrap failed:', e);
    toast('⚠️ Supabase connection failed. Check SUPABASE_URL and SUPABASE_KEY in app.js', 'error');
    CACHE.kekes          = CACHE.kekes          || [];
    CACHE.payments       = CACHE.payments       || [];
    CACHE.complaints     = CACHE.complaints     || [];
    CACHE.serviceRecords = CACHE.serviceRecords || [];
    CACHE.documents      = CACHE.documents      || [];
    CACHE.activityLog    = CACHE.activityLog    || [];
    CACHE.holiday        = CACHE.holiday        || { A:{}, B:{}, C:{} };
    CACHE.batchSchedules = CACHE.batchSchedules || { A:{startDate:''}, B:{startDate:''}, C:{startDate:''} };
  }
}

// ─── LOCAL: synchronous cache reads (used by sync render fns) ─
const LOCAL = {
  getKekes:          () => CACHE.kekes          || [],
  getPayments:       () => CACHE.payments       || [],
  getComplaints:     () => CACHE.complaints     || [],
  getServiceRecords: () => CACHE.serviceRecords || [],
  getDocuments:      () => (CACHE.documents     || []).map(_mapDoc),
  getActivityLog:    () => CACHE.activityLog    || [],
  getHoliday:        () => CACHE.holiday        || { A:{}, B:{}, C:{} },
  getBatchSchedules: () => CACHE.batchSchedules || { A:{startDate:''}, B:{startDate:''}, C:{startDate:''} },
  // Sync cache writes (Supabase writes happen separately via _sb* helpers)
  saveKekes:          d => { CACHE.kekes          = d; },
  savePayments:       d => { CACHE.payments       = d; },
  saveComplaints:     d => { CACHE.complaints     = d; },
  saveServiceRecords: d => { CACHE.serviceRecords = d; },
  saveDocuments:      d => { CACHE.documents      = d; },
  saveActivityLog:    d => { CACHE.activityLog    = d; },
  saveHoliday:   async d => { CACHE.holiday = d;        try { await sb.saveSetting('holiday', d); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); } },
  saveBatchSchedules: async d => { CACHE.batchSchedules = d; try { await sb.saveSetting('batch_schedules', d); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); } },
};

// ─── Async DB API (same signatures as before) ─────────────────
async function dbGetKekes()           { await bootstrap(); return CACHE.kekes; }
async function dbSaveKeke(k)          { setSyncStatus('syncing'); try { const s=await sb.upsert('keke_loans',k); const m=_mapKeke(s||k); const i=CACHE.kekes.findIndex(x=>x.id===k.id); if(i>=0)CACHE.kekes[i]=m; else CACHE.kekes.unshift(m); setSyncStatus('synced'); return m; } catch(e){ setSyncStatus('error'); throw e; } }
async function dbUpdateKeke(id,upd)   { setSyncStatus('syncing'); try { await sb.update('keke_loans',`id=eq.${id}`,upd); const i=CACHE.kekes.findIndex(x=>x.id===id); if(i>=0){CACHE.kekes[i]={...CACHE.kekes[i],...upd};setSyncStatus('synced');return CACHE.kekes[i];}setSyncStatus('synced');return null; } catch(e){ setSyncStatus('error'); throw e; } }
async function dbGetPayments(kekeId)  { await bootstrap(); return kekeId ? CACHE.payments.filter(p=>p.keke_id===kekeId) : CACHE.payments; }
async function dbSavePayment(p)       { setSyncStatus('syncing'); try { const s=await sb.insert('keke_payments',p); const m=_mapPayment(s||p); CACHE.payments.unshift(m); setSyncStatus('synced'); return m; } catch(e){ setSyncStatus('error'); throw e; } }
async function dbDeletePayment(payId) { setSyncStatus('syncing'); try { await sb.delete('keke_payments',`id=eq.${payId}`); CACHE.payments=CACHE.payments.filter(p=>p.id!==payId); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); throw e; } }

// ─── Supabase helpers for complaints, service, docs, activity ─
async function _sbSaveComplaint(c) { try { setSyncStatus('syncing'); await sb.insert('keke_complaints',c); CACHE.complaints.unshift(c); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbDeleteComplaint(id) { try { setSyncStatus('syncing'); await sb.delete('keke_complaints',`id=eq.${id}`); CACHE.complaints=CACHE.complaints.filter(c=>c.id!==id); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbSaveServiceRecord(r) { try { setSyncStatus('syncing'); await sb.insert('keke_service_records',r); CACHE.serviceRecords.unshift(r); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbDeleteServiceRecord(id) { try { setSyncStatus('syncing'); await sb.delete('keke_service_records',`id=eq.${id}`); CACHE.serviceRecords=CACHE.serviceRecords.filter(r=>r.id!==id); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbSaveDocument(doc) { try { setSyncStatus('syncing'); const row={...doc, data_url:doc.dataUrl||doc.data_url}; delete row.dataUrl; await sb.insert('keke_documents',row); CACHE.documents.unshift(row); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbDeleteDocument(id) { try { setSyncStatus('syncing'); await sb.delete('keke_documents',`id=eq.${id}`); CACHE.documents=CACHE.documents.filter(d=>d.id!==id); setSyncStatus('synced'); } catch(e){ setSyncStatus('error'); console.error(e); } }
async function _sbLogActivity(entry) { try { await sb.insert('maymoon_activity_log',{...entry,timestamp:entry.timestamp||new Date().toISOString()}); CACHE.activityLog.unshift(entry); if(CACHE.activityLog.length>500)CACHE.activityLog.length=500; } catch(e){ console.error('Activity log:',e); } }


// ═══════════════════════════════════════════════════════════════
//  BACKUP & RESTORE
// ═══════════════════════════════════════════════════════════════
function renderBackupView() {
  const kekes=LOCAL.getKekes(), pays=LOCAL.getPayments(), comps=LOCAL.getComplaints();
  document.getElementById('backupStats').innerHTML = `
    <div class="backup-stat"><div class="bs-val">${kekes.length}</div><div class="bs-lbl">Kekes</div></div>
    <div class="backup-stat"><div class="bs-val">${pays.length}</div><div class="bs-lbl">Payments</div></div>
    <div class="backup-stat"><div class="bs-val">${comps.length}</div><div class="bs-lbl">Complaints</div></div>`;
}

function exportBackup() {
  const data = {
    version: '2.0', exported_at: new Date().toISOString(),
    exported_by: currentUser?.name || '?',
    kekes:           LOCAL.getKekes(),
    payments:        LOCAL.getPayments(),
    complaints:      LOCAL.getComplaints(),
    activity_log:    LOCAL.getActivityLog(),
    holiday:         LOCAL.getHoliday(),
    service_records: LOCAL.getServiceRecords(),
    batch_schedules: LOCAL.getBatchSchedules(),
    documents:       LOCAL.getDocuments()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `maymoon-backup-${dateStr}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logActivity('Data backup exported','edit',`By: ${currentUser?.name||'?'} | Kekes: ${data.kekes.length} | Payments: ${data.payments.length}`);
  toast('Backup downloaded successfully!');
}

function importBackup(input) {
  const file = input.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if(!data.kekes || !data.payments) { toast('Invalid backup file.','error'); return; }
      if(!confirm(`⚠️ This will replace ALL current data with the backup from ${data.exported_at?.slice(0,10)||'unknown date'}.\n\nKekes: ${data.kekes.length}\nPayments: ${data.payments.length}\n\nContinue?`)) return;
      // Update local cache
      CACHE.kekes          = (data.kekes          || []);
      CACHE.payments       = (data.payments       || []);
      CACHE.complaints     = (data.complaints     || []);
      if(data.activity_log)    CACHE.activityLog    = data.activity_log;
      if(data.holiday)         CACHE.holiday        = data.holiday;
      if(data.service_records) CACHE.serviceRecords = data.service_records;
      if(data.batch_schedules) CACHE.batchSchedules = data.batch_schedules;
      if(data.documents)       CACHE.documents      = data.documents;
      // Sync to Supabase (fire and forget — may take a moment)
      toast('Pushing backup data to Supabase…');
      (async()=>{
        try{
          for(const k of CACHE.kekes)         await sb.upsert('keke_loans',k).catch(()=>{});
          for(const p of CACHE.payments)      await sb.upsert('keke_payments',p).catch(()=>{});
          for(const c of (CACHE.complaints||[])) await sb.upsert('keke_complaints',c).catch(()=>{});
          for(const r of (CACHE.serviceRecords||[])) await sb.upsert('keke_service_records',r).catch(()=>{});
          for(const d of (CACHE.documents||[])){
            const row={...d,data_url:d.dataUrl||d.data_url};delete row.dataUrl;
            await sb.upsert('keke_documents',row).catch(()=>{});
          }
          if(data.holiday)         await sb.saveSetting('holiday',data.holiday).catch(()=>{});
          if(data.batch_schedules) await sb.saveSetting('batch_schedules',data.batch_schedules).catch(()=>{});
          toast('Backup synced to Supabase ☁️');
        }catch(e){toast('Supabase sync failed: '+e.message,'error');}
      })();
      logActivity('Data restored from backup','edit',`By: ${currentUser?.name||'?'} | Kekes: ${data.kekes.length} | Payments: ${data.payments.length}`);
      toast(`Restore complete! ${data.kekes.length} kekes, ${data.payments.length} payments loaded.`);
      renderBackupView();
      input.value = '';
    } catch(err) { toast('Failed to read backup file: '+err.message,'error'); }
  };
  reader.readAsText(file);
}

// ═══════════════════════════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════════════════════════
const fmt = n => '₦' + Number(n||0).toLocaleString('en-NG');

// ─── Comma-formatted number input helpers ────────────────────
// Formats a text input to show commas as the user types (e.g. 1,000,000)
function fmtInput(el) {
  if (!el) return;
  const raw = el.value.replace(/,/g, '');
  if (raw === '' || raw === '-') return;
  const num = parseFloat(raw);
  if (isNaN(num)) { el.value = raw.replace(/[^\d.]/g, ''); return; }
  // Preserve trailing decimal point while typing
  const hasDot = raw.endsWith('.');
  el.value = num.toLocaleString('en-NG') + (hasDot ? '.' : '');
}
// Parse a comma-formatted input back to a plain number
function parseFmt(el) {
  if (!el) return 0;
  return parseFloat((el.value || '0').replace(/,/g, '')) || 0;
}
function uid() { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)}); }
function pct(paid,total) { return total>0 ? Math.min(100,Math.round((paid/total)*100)) : 0; }
function toast(msg,type='success') { const t=document.createElement('div'); t.className='toast '+type; t.innerHTML=type==='success'?`<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>${msg}`:`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>${msg}`; document.getElementById('toastContainer').appendChild(t); setTimeout(()=>t.remove(),3500); }
function schedLabel(s) { return {daily:'Daily','3days':'Every 3 Days','5days':'Every 5 Days',weekly:'Weekly'}[s]||s; }
function setTopbarDate() { const el=document.getElementById('topbarDate'); if(el) el.textContent=new Date().toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short',year:'numeric'}); }
function previewPhoto(input,previewId,boxId) { const file=input.files[0]; if(!file)return; const reader=new FileReader(); reader.onload=e=>{const img=document.getElementById(previewId);img.src=e.target.result;img.classList.add('visible');document.getElementById(boxId).style.display='none';}; reader.readAsDataURL(file); }

// Quick inline camera for registration form
let _qcPreviewId=null,_qcBoxId=null,_qcStream=null;
function openQuickCamera(previewId,boxId){
  _qcPreviewId=previewId;_qcBoxId=boxId;
  // Build a small camera overlay
  let overlay=document.getElementById('quickCamOverlay');
  if(!overlay){
    overlay=document.createElement('div');
    overlay.id='quickCamOverlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9000;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:14px';
    overlay.innerHTML=`<div style="color:white;font-size:.9rem;font-weight:700;margin-bottom:4px">📸 Camera — take photo</div>
      <video id="qcVideo" autoplay playsinline style="max-width:90vw;max-height:55vh;border-radius:12px;display:block"></video>
      <canvas id="qcCanvas" style="display:none"></canvas>
      <div style="display:flex;gap:10px">
        <button onclick="qcSnap()" style="background:white;border:none;width:58px;height:58px;border-radius:50%;font-size:1.5rem;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,.4)">📸</button>
        <button onclick="qcClose()" style="background:#333;color:white;border:none;padding:10px 22px;border-radius:8px;font-size:.85rem;cursor:pointer">Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
  }else{overlay.style.display='flex';}
  navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'},audio:false})
    .then(s=>{_qcStream=s;document.getElementById('qcVideo').srcObject=s;})
    .catch(e=>{toast('Camera unavailable: '+e.message,'error');overlay.style.display='none';});
}
function qcSnap(){
  const v=document.getElementById('qcVideo'),c=document.getElementById('qcCanvas');
  c.width=v.videoWidth;c.height=v.videoHeight;
  c.getContext('2d').drawImage(v,0,0);
  const data=c.toDataURL('image/jpeg',0.85);
  const img=document.getElementById(_qcPreviewId);
  img.src=data;img.classList.add('visible');
  document.getElementById(_qcBoxId).style.display='none';
  qcClose();
}
function qcClose(){
  if(_qcStream){_qcStream.getTracks().forEach(t=>t.stop());_qcStream=null;}
  const o=document.getElementById('quickCamOverlay');if(o)o.style.display='none';
}
async function uploadPhoto(input) { if(!input||!input.files[0])return null; return new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(input.files[0]);}); }
function batchBadge(b) { if(!b)return''; const c={A:'badge-batch-a',B:'badge-batch-b',C:'badge-batch-c'}[b]||'badge-gray'; return `<span class="badge ${c}">Batch ${b}</span>`; }
function statusBadge(s) { const m={active:'🟢 Active',repossession:'🔴 Repossession',on_repair:'🔧 On Repair',completed:'✅ Completed'}; return `<span class="driver-status ${s||'active'}">${m[s]||'🟢 Active'}</span>`; }
function isOnBreak(batch) {
  if(!batch) return false;
  const h = LOCAL.getHoliday();
  const b = h[batch];
  if(!b) return false;
  const today = new Date().toISOString().slice(0,10);
  const start = b.startDate || b; // backwards compat with old string format
  const resume = b.resumeDate || b;
  if(typeof b === 'string') return today < b; // legacy
  if(!b.resumeDate) return false;
  return today >= (b.startDate||b.resumeDate) && today < b.resumeDate;
}

function getPeriodDates(period) {
  const now = new Date(); let from, to = now.toISOString().slice(0,10);
  if(period==='week') { const d=new Date(now); d.setDate(d.getDate()-d.getDay()); from=d.toISOString().slice(0,10); }
  else if(period==='month') { from=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`; }
  else if(period==='3month') { const d=new Date(now); d.setMonth(d.getMonth()-3); from=d.toISOString().slice(0,10); }
  else if(period==='year') { from=`${now.getFullYear()}-01-01`; }
  else { from='2000-01-01'; }
  return {from,to};
}

// ═══════════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════════
const viewTitles = {dashboard:'Dashboard',addKeke:'Register New Keke',drivers:'All Drivers & Kekes',alerts:'Payment Alerts',payments:'Payment Log',completed:'Completed Loans',reports:'Reports & Analytics',shorties:'Shorty Manager',holiday:'Holiday / Break',maintenance:'Service & Maintenance',backup:'Backup & Restore',activityLog:'Activity Log'};
function showView(v) {
  // Block staff from restricted views
  if (!isAdmin() && !STAFF_VIEWS.includes(v)) {
    toast('Access restricted. Contact admin.', 'error');
    return;
  }
  document.querySelectorAll('.content').forEach(el=>el.style.display='none');
  document.querySelectorAll('.nav-item').forEach(el=>el.classList.remove('active'));
  const vEl = document.getElementById('view-'+v);
  if(!vEl){console.warn('View not found:',v);return;}
  vEl.style.display='';
  const ni=document.getElementById('nav-'+v); if(ni) ni.classList.add('active');
  document.getElementById('topbarTitle').textContent=viewTitles[v]||v;
  closeSidebar();
  if(v==='dashboard')    refreshDashboard();
  if(v==='drivers')      renderDrivers();
  if(v==='alerts')       renderAlerts();
  if(v==='payments')     renderPayments();
  if(v==='completed')    renderCompleted();
  if(v==='reports')      renderReports();
  if(v==='shorties')     renderShorties();
  if(v==='holiday')      renderHoliday();
  if(v==='maintenance')  renderMaintenance();
  if(v==='backup')       renderBackupView();
  if(v==='activityLog')  renderActivityLog();
  if(v==='addKeke')      {
    if (!document.getElementById('k_start').value) document.getElementById('k_start').valueAsDate=new Date();
    wireAutosave('addKeke', ADD_KEKE_FIELDS);
    offerDraftRestore('addKeke', ADD_KEKE_FIELDS, 'Register Keke form');
  }
}
function openSidebar()  { document.getElementById('sidebar').classList.add('open');    document.getElementById('sidebarOverlay').classList.add('active'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebarOverlay').classList.remove('active'); }

// ═══════════════════════════════════════════════════════════════
//  GLOBAL SEARCH
// ═══════════════════════════════════════════════════════════════
let searchTimeout;
function handleGlobalSearch(q) {
  clearTimeout(searchTimeout);
  const box = document.getElementById('globalSearchResults');
  if(!q.trim()) { box.style.display='none'; return; }
  searchTimeout = setTimeout(() => {
    const qL = q.toLowerCase();
    const kekes = LOCAL.getKekes();
    const matches = kekes.filter(k =>
      (k.driver_name||'').toLowerCase().includes(qL) ||
      (k.plate||'').toLowerCase().includes(qL) ||
      (k.pt_number||'').toLowerCase().includes(qL) ||
      (k.shorty_name||'').toLowerCase().includes(qL) ||
      (k.guarantor_name||'').toLowerCase().includes(qL) ||
      (k.driver_phone||'').includes(q) ||
      (k.shorty_phone||'').includes(q)
    ).slice(0,8);
    if(!matches.length) { box.innerHTML='<div style="padding:12px 14px;font-size:.83rem;color:var(--gray-500)">No results found</div>'; box.style.display='block'; return; }
    box.innerHTML = matches.map(k => `
      <div class="gsr-item" onclick="closeGlobalSearch();openDetail('${k.id}')">
        <div style="font-size:1.2rem">${k.status==='completed'?'✅':'🛺'}</div>
        <div>
          <div class="gsr-label">${k.driver_name} · ${k.plate}</div>
          <div class="gsr-sub">${batchBadge(k.batch)} ${statusBadge(k.status)} · Shorty: ${k.shorty_name||'—'} · Balance: ${fmt(k.total_loan-k.paid)}</div>
        </div>
      </div>`).join('');
    box.style.display = 'block';
  }, 250);
}
function closeGlobalSearch() { document.getElementById('globalSearch').value=''; document.getElementById('globalSearchResults').style.display='none'; }
document.addEventListener('click', e => { if(!e.target.closest('.global-search-wrap')) closeGlobalSearch(); });

// ═══════════════════════════════════════════════════════════════
//  HOLIDAY
// ═══════════════════════════════════════════════════════════════
function renderHoliday() {
  const h=LOCAL.getHoliday(); const today=new Date().toISOString().slice(0,10);
  const batchColors={A:{bg:'#eff6ff',border:'#bfdbfe',label:'#1e40af'},B:{bg:'#fefce8',border:'#fde68a',label:'#92400e'},C:{bg:'#fdf2f8',border:'#fbcfe8',label:'#9d174d'}};
  document.getElementById('holidayBatchCards').innerHTML=['A','B','C'].map(batch=>{
    const bdata=h[batch]||{};
    const startDate = typeof bdata==='string'?bdata:(bdata.startDate||'');
    const resumeDate = typeof bdata==='string'?bdata:(bdata.resumeDate||'');
    const reason = typeof bdata==='string'?'':(bdata.reason||'');
    const onBreak=isOnBreak(batch);
    const col=batchColors[batch];
    return `<div class="holiday-batch-card ${onBreak?'on-break':''}" style="${!onBreak?`background:${col.bg};border-color:${col.border}`:''}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">${batchBadge(batch)} ${onBreak?'<span style="background:#fef3c7;color:#92400e;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;border:1px solid #fcd34d">⏸️ ON BREAK</span>':'<span style="background:#dcfce7;color:#166534;font-size:.72rem;font-weight:700;padding:2px 9px;border-radius:20px;border:1px solid #bbf7d0">▶️ ACTIVE</span>'}</div>
          ${onBreak?`<div style="font-size:.79rem;color:var(--gray-600);margin-top:3px">Break from <strong>${startDate||'—'}</strong> → Resumes <strong>${resumeDate||'—'}</strong>${reason?` &bull; <em>${reason}</em>`:''}</div>`:'<div style="font-size:.79rem;color:var(--gray-500)">No active break</div>'}
        </div>
        ${onBreak?`<button class="btn btn-outline btn-sm" onclick="clearBreak('${batch}')">✕ Clear Break</button>`:''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px">
        <div class="form-group" style="margin:0">
          <label style="font-size:.73rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.5px">📅 Break Start Date</label>
          <input type="date" id="hstart_${batch}" class="form-control" value="${startDate}" style="margin-top:5px">
          <div style="font-size:.69rem;color:var(--gray-400);margin-top:3px">First day of the break</div>
        </div>
        <div class="form-group" style="margin:0">
          <label style="font-size:.73rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.5px">📅 Resume Date</label>
          <input type="date" id="holiday_${batch}" class="form-control" value="${resumeDate}" style="margin-top:5px">
          <div style="font-size:.69rem;color:var(--gray-400);margin-top:3px">Day drivers resume payment</div>
        </div>
      </div>
      <div class="form-group" style="margin:0">
        <label style="font-size:.73rem;font-weight:700;color:var(--gray-600);text-transform:uppercase;letter-spacing:.5px">📝 Reason for Break</label>
        <input type="text" id="hreason_${batch}" class="form-control" value="${reason}" placeholder="e.g. Eid holiday, End of year break, Market day..." style="margin-top:5px">
      </div>
    </div>`;
  }).join('');

  const active=['A','B','C'].filter(b=>isOnBreak(b));
  const st=document.getElementById('holidayStatus');
  if(!active.length){
    st.innerHTML='<div class="empty-state" style="padding:16px 0"><p style="color:var(--green)">✅ All batches are working normally — no active breaks</p></div>';
    return;
  }
  st.innerHTML=`<div style="display:flex;flex-direction:column;gap:8px">${active.map(b=>{
    const bd=h[b]||{}; const reason=typeof bd==='string'?'':(bd.reason||'');
    const startDate=typeof bd==='string'?bd:(bd.startDate||''); const resume=typeof bd==='string'?bd:(bd.resumeDate||'');
    const daysLeft=Math.max(0,Math.ceil((new Date(resume)-Date.now())/86400000));
    return`<div style="padding:14px 18px;background:#fef3c7;border-radius:var(--radius-sm);border:1px solid #fcd34d">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${batchBadge(b)}<span style="font-weight:700;color:#92400e;font-size:.86rem">⏸️ On Break</span></div>
          <div style="font-size:.8rem;color:#78350f">
            <strong>From:</strong> ${startDate||'—'} &nbsp;→&nbsp; <strong>Resumes:</strong> ${resume||'—'}
            ${reason?`<br><strong>Reason:</strong> ${reason}`:''}
          </div>
          <div style="font-size:.75rem;color:#92400e;margin-top:4px;font-weight:600">${daysLeft>0?`⏱️ ${daysLeft} day(s) remaining`:'⚠️ Should have resumed already'}</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="clearBreak('${b}')">✕ Clear Break</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function saveHolidaySettings(){
  const h={
    A:{startDate:document.getElementById('hstart_A').value,resumeDate:document.getElementById('holiday_A').value,reason:document.getElementById('hreason_A').value.trim()},
    B:{startDate:document.getElementById('hstart_B').value,resumeDate:document.getElementById('holiday_B').value,reason:document.getElementById('hreason_B').value.trim()},
    C:{startDate:document.getElementById('hstart_C').value,resumeDate:document.getElementById('holiday_C').value,reason:document.getElementById('hreason_C').value.trim()}
  };
  // Validate: if start set, resume must also be set
  for(const b of ['A','B','C']){
    if(h[b].startDate && !h[b].resumeDate){toast(`Batch ${b}: Please set a Resume Date.`,'error');return;}
    if(!h[b].startDate && h[b].resumeDate){toast(`Batch ${b}: Please set a Break Start Date.`,'error');return;}
  }
  LOCAL.saveHoliday(h);
  logActivity('Holiday settings updated','edit',`A:${h.A.resumeDate||'none'} B:${h.B.resumeDate||'none'} C:${h.C.resumeDate||'none'} By:${currentUser?.name||'?'}`);
  toast('Break settings saved! ✅');renderHoliday();
}
function clearBreak(batch){const h=LOCAL.getHoliday();h[batch]={startDate:'',resumeDate:'',reason:''};LOCAL.saveHoliday(h);toast(`Batch ${batch} break cleared.`);renderHoliday();}

// ═══════════════════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════════════════
async function refreshDashboard() {
  const kekes=await dbGetKekes(), payments=await dbGetPayments();
  const active=kekes.filter(k=>k.status==='active'), completed=kekes.filter(k=>k.status==='completed');
  const overdue=getOverdueDrivers(kekes,payments);
  const todayStr=new Date().toISOString().slice(0,10);
  const todayPays=payments.filter(p=>p.payment_date===todayStr);
  const todayCol=todayPays.reduce((s,p)=>s+Number(p.amount),0);
  const allCol=payments.reduce((s,p)=>s+Number(p.amount),0);
  const totalOutstanding=active.reduce((s,k)=>s+(k.total_loan-k.paid),0);
  const overdueAmt=overdue.reduce((s,k)=>s+(k.total_loan-k.paid),0);

  // Active batches expected today
  const schedDays={daily:1,'3days':3,'5days':5,weekly:7};
  let expectedToday=0;
  active.forEach(k=>{
    if(isOnBreak(k.batch))return;
    const days=schedDays[k.schedule]||1;
    const lastPay=payments.filter(p=>p.keke_id===k.id).reduce((a,b)=>new Date(a.payment_date||0)>new Date(b.payment_date||0)?a:b,{payment_date:k.start_date});
    const daysSinceLast=Math.floor((new Date(todayStr)-new Date(lastPay.payment_date||k.start_date))/(86400000));
    if(daysSinceLast>=days) expectedToday+=k.installment_amount;
  });

  document.getElementById('stat-total-keke').textContent=kekes.length;
  document.getElementById('stat-active').textContent=active.length;
  document.getElementById('stat-collected').textContent=fmt(todayCol);
  document.getElementById('stat-collected-sub').textContent='All time: '+fmt(allCol);
  document.getElementById('stat-completed').textContent=completed.length;
  document.getElementById('stat-overdue').textContent=overdue.length;
  document.getElementById('stat-overdue-amt').textContent=fmt(overdueAmt)+' uncollected';
  document.getElementById('stat-outstanding').textContent=fmt(totalOutstanding);
  document.getElementById('todayDate2').textContent=new Date().toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short'});

  // Today collection box
  const shortfall=Math.max(0,expectedToday-todayCol);
  document.getElementById('todayCollectionBox').innerHTML=`
    <div class="today-col-grid">
      <div class="today-col-item" style="background:var(--green-bg)"><div class="tc-val" style="color:var(--green)">${fmt(todayCol)}</div><div class="tc-lbl">Collected Today</div></div>
      <div class="today-col-item" style="background:var(--gray-50)"><div class="tc-val" style="color:var(--gray-800)">${fmt(expectedToday)}</div><div class="tc-lbl">Expected Today</div></div>
      <div class="today-col-item" style="background:${shortfall>0?'var(--red-bg)':'var(--green-bg)'};grid-column:1/-1"><div class="tc-val" style="color:${shortfall>0?'var(--red)':'var(--green)'}">${shortfall>0?'-'+fmt(shortfall):'On Track ✓'}</div><div class="tc-lbl">${shortfall>0?'Shortfall':'Today\'s collection'}</div></div>
    </div>
    <div style="margin-top:12px;font-size:.8rem;color:var(--gray-500)">Today's ${todayPays.length} payment(s) from ${new Set(todayPays.map(p=>p.driver_name)).size} driver(s)</div>`;

  // Alert badge
  const alertBadge=document.getElementById('alertBadge');
  if(overdue.length>0){alertBadge.textContent=overdue.length;alertBadge.style.display='';}else alertBadge.style.display='none';
  document.getElementById('dash-active-count').textContent=active.length+' active';

  // Active loans table
  const tbody=document.getElementById('dashLoansTable');
  if(!active.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state"><p>No active loans</p></div></td></tr>';}
  else tbody.innerHTML=active.slice(0,8).map(k=>{const p=pct(k.paid,k.total_loan),bal=k.total_loan-k.paid;return`<tr><td><strong>${k.driver_name}</strong></td><td><span class="badge badge-gray">${k.plate}</span></td><td>${batchBadge(k.batch)}</td><td style="min-width:120px"><div class="progress-wrap"><div class="progress-bar${p<30?' danger':p<70?' warning':''}" style="width:${p}%"></div></div><div class="progress-label"><span>${p}%</span><span>${fmt(k.paid)}</span></div></td><td style="color:var(--red);font-weight:700">${fmt(bal)}</td></tr>`;}).join('');

  // Nearly done (< 5 payments left)
  const nearlyDone=active.filter(k=>{const bal=k.total_loan-k.paid;return bal>0&&bal<=k.installment_amount*5;}).sort((a,b)=>(a.total_loan-a.paid)-(b.total_loan-b.paid));
  document.getElementById('nearlyDoneCount').textContent=nearlyDone.length;
  const ndList=document.getElementById('nearlyDoneList');
  if(!nearlyDone.length){ndList.innerHTML='<div class="empty-state"><p>No drivers near completion yet</p></div>';}
  else ndList.innerHTML=nearlyDone.map(k=>{const bal=k.total_loan-k.paid;const left=Math.ceil(bal/k.installment_amount);return`<div class="nearly-done-item"><div class="ndi-info"><div class="ndi-name">🛺 ${k.driver_name} · ${k.plate}</div><div class="ndi-sub">${batchBadge(k.batch)} · Balance: ${fmt(bal)}</div></div><span class="ndi-badge">${left} payment${left!==1?'s':''} left</span></div>`;}).join('');
}

function getOverdueDrivers(kekes,payments) {
  const now=Date.now(), three=3*24*60*60*1000;
  return kekes.filter(k=>{
    if(k.status!=='active')return false;
    if(isOnBreak(k.batch))return false;
    const kp=payments.filter(p=>p.keke_id===k.id);
    if(!kp.length)return(now-new Date(k.start_date||k.created_at).getTime())>three;
    const latest=kp.reduce((a,b)=>new Date(a.payment_date)>new Date(b.payment_date)?a:b);
    return(now-new Date(latest.payment_date).getTime())>three;
  });
}

// ═══════════════════════════════════════════════════════════════
//  REPORTS
// ═══════════════════════════════════════════════════════════════
async function renderReports() {
  const period=document.getElementById('reportPeriod').value;
  const batchF=document.getElementById('reportBatch').value;
  const {from,to}=getPeriodDates(period);
  const kekes=await dbGetKekes(), allPays=await dbGetPayments();
  let pays=allPays.filter(p=>p.payment_date>=from&&p.payment_date<=to);
  if(batchF) pays=pays.filter(p=>p.batch===batchF);
  let kekeSet=kekes; if(batchF) kekeSet=kekes.filter(k=>k.batch===batchF);

  const totalCol=pays.reduce((s,p)=>s+Number(p.amount),0);
  const shortPays=pays.filter(p=>p.is_short);
  const completedInPeriod=kekeSet.filter(k=>k.completed_at&&k.completed_at.slice(0,10)>=from&&k.completed_at.slice(0,10)<=to);
  const totalProfit=kekeSet.filter(k=>k.status==='completed').reduce((s,k)=>s+(k.paid-k.cost),0);
  const outstanding=kekeSet.filter(k=>k.status==='active').reduce((s,k)=>s+(k.total_loan-k.paid),0);

  // Per-batch stats
  const batchStats=['A','B','C'].map(b=>{
    const bp=pays.filter(p=>p.batch===b);
    const bk=kekes.filter(k=>k.batch===b&&k.status==='active');
    return {batch:b,collected:bp.reduce((s,p)=>s+Number(p.amount),0),count:bp.length,active:bk.length,outstanding:bk.reduce((s,k)=>s+(k.total_loan-k.paid),0)};
  });

  // Shorty breakdown
  const shortyMap={};
  kekeSet.forEach(k=>{
    const sn=k.shorty_name||'Unknown';
    if(!shortyMap[sn]){shortyMap[sn]={name:sn,phone:k.shorty_phone||'',drivers:0,active:0,collected:0,profit:0};}
    shortyMap[sn].drivers++;
    if(k.status==='active')shortyMap[sn].active++;
    const kPays=pays.filter(p=>p.keke_id===k.id);
    shortyMap[sn].collected+=kPays.reduce((s,p)=>s+Number(p.amount),0);
    if(k.status==='completed')shortyMap[sn].profit+=(k.paid-k.cost);
  });
  const shortyList=Object.values(shortyMap).sort((a,b)=>b.collected-a.collected);

  // Monthly trend (last 6 months)
  const monthlyMap={};
  allPays.forEach(p=>{const m=p.payment_date.slice(0,7);if(!monthlyMap[m])monthlyMap[m]=0;monthlyMap[m]+=Number(p.amount);});
  const months=Object.keys(monthlyMap).sort().slice(-6);
  const maxMonthly=Math.max(...months.map(m=>monthlyMap[m]),1);

  document.getElementById('reportsContainer').innerHTML=`
    <div class="report-stat-grid">
      <div class="report-stat"><div class="rs-val" style="color:var(--green)">${fmt(totalCol)}</div><div class="rs-lbl">Total Collected</div></div>
      <div class="report-stat"><div class="rs-val">${pays.length}</div><div class="rs-lbl">Payments Made</div></div>
      <div class="report-stat"><div class="rs-val" style="color:var(--red)">${fmt(outstanding)}</div><div class="rs-lbl">Outstanding</div></div>
      <div class="report-stat"><div class="rs-val" style="color:#7c3aed">${fmt(totalProfit)}</div><div class="rs-lbl">Total Profit</div></div>
    </div>

    <div class="batch-breakdown">
      ${batchStats.map(b=>`<div class="batch-box ${b.batch}">
        <div class="bb-title">${batchBadge(b.batch)}</div>
        <div class="bb-row"><span>Collected</span><strong>${fmt(b.collected)}</strong></div>
        <div class="bb-row"><span>Payments</span><strong>${b.count}</strong></div>
        <div class="bb-row"><span>Active Loans</span><strong>${b.active}</strong></div>
        <div class="bb-row"><span>Outstanding</span><strong style="color:var(--red)">${fmt(b.outstanding)}</strong></div>
      </div>`).join('')}
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><span class="card-title">📈 Monthly Collection Trend</span></div>
      <div class="card-body">
        <div style="display:flex;gap:8px;align-items:flex-end;height:120px;padding:8px 0">
          ${months.map(m=>{const h=Math.round((monthlyMap[m]/maxMonthly)*100);return`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px"><div style="height:${h}px;background:var(--green);border-radius:4px 4px 0 0;width:100%;min-height:4px;transition:height .3s"></div><div style="font-size:.65rem;color:var(--gray-500);text-align:center">${m.slice(5)}<br>${fmt(monthlyMap[m]).replace('₦','')}</div></div>`;}).join('')}
        </div>
      </div>
    </div>

    <div class="card" style="margin-bottom:18px">
      <div class="card-header"><span class="card-title">🔗 Shorty Performance</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Shorty</th><th>Phone</th><th>Drivers</th><th>Active</th><th>Collected (period)</th><th>Profit (all time)</th></tr></thead>
        <tbody>${shortyList.length?shortyList.map(s=>`<tr><td><strong>${s.name}</strong></td><td>${s.phone||'—'}</td><td>${s.drivers}</td><td>${s.active}</td><td style="color:var(--green);font-weight:700">${fmt(s.collected)}</td><td style="color:#7c3aed;font-weight:700">${fmt(s.profit)}</td></tr>`).join(''):'<tr><td colspan="6"><div class="empty-state"><p>No data</p></div></td></tr>'}</tbody>
      </table></div>
    </div>

    ${shortPays.length?`<div class="card">
      <div class="card-header"><span class="card-title">⚠️ Short Payments in Period</span><span class="badge badge-red">${shortPays.length}</span></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Driver</th><th>Plate</th><th>Paid</th><th>Expected</th><th>Shortfall</th></tr></thead>
        <tbody>${shortPays.map(p=>`<tr class="pay-short-row"><td>${new Date(p.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</td><td>${p.driver_name}</td><td>${p.plate}</td><td class="pay-short">${fmt(p.amount)}</td><td>${fmt(p.expected_amount)}</td><td style="color:var(--red);font-weight:700">${fmt((p.expected_amount||0)-p.amount)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}

async function downloadReportPDF() {
  const period=document.getElementById('reportPeriod').value;
  const batchF=document.getElementById('reportBatch').value;
  const {from,to}=getPeriodDates(period);
  const kekes=await dbGetKekes(), allPays=await dbGetPayments();
  let pays=allPays.filter(p=>p.payment_date>=from&&p.payment_date<=to);
  if(batchF) pays=pays.filter(p=>p.batch===batchF);
  const totalCol=pays.reduce((s,p)=>s+Number(p.amount),0);
  const dateStr=new Date().toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});
  const batchStats=['A','B','C'].map(b=>{const bp=pays.filter(p=>p.batch===b);return{batch:b,col:bp.reduce((s,p)=>s+Number(p.amount),0),count:bp.length};});
  const html=`
    <div class="hdr"><div><div class="co">Maymoon Mainstream Ltd</div><h1>Analytics Report</h1><div style="font-size:.8rem;color:#6c757d;margin-top:3px">Period: ${from} → ${to}${batchF?' | Batch '+batchF:''} · Generated: ${dateStr}</div></div><div class="hdr-r">${pays.length} payments<br><strong style="color:#1a7a3c;font-size:1rem">${fmt(totalCol)}</strong></div></div>
    <div class="stats"><div class="stat"><div class="lbl">Total Collected</div><div class="val g">${fmt(totalCol)}</div></div><div class="stat"><div class="lbl">Payments</div><div class="val">${pays.length}</div></div><div class="stat"><div class="lbl">Drivers</div><div class="val">${new Set(pays.map(p=>p.driver_name)).size}</div></div></div>
    <h3 style="margin:16px 0 10px;font-size:.9rem">Batch Breakdown</h3>
    <table><thead><tr><th>Batch</th><th>Payments</th><th>Total Collected</th></tr></thead><tbody>${batchStats.map(b=>`<tr><td>Batch ${b.batch}</td><td>${b.count}</td><td class="am">${fmt(b.col)}</td></tr>`).join('')}</tbody></table>
    <div class="ftr"><span>Maymoon Mainstream Ltd</span><span>${dateStr}</span></div>`;
  openPDF(html,'Analytics Report — Maymoon Mainstream Ltd');
}

// ═══════════════════════════════════════════════════════════════
//  SHORTY MANAGER
// ═══════════════════════════════════════════════════════════════
async function renderShorties() {
  const q=(document.getElementById('shortySearch').value||'').toLowerCase();
  const kekes=await dbGetKekes(), payments=await dbGetPayments();
  const shortyMap={};
  kekes.forEach(k=>{
    const sn=k.shorty_name||'Unknown'; const sp=k.shorty_phone||'';
    const key=sn.toLowerCase();
    if(!shortyMap[key]){shortyMap[key]={name:sn,phone:sp,address:k.shorty_address||'',photo:k.shorty_photo_url||'',drivers:[]};}
    shortyMap[key].drivers.push(k);
  });
  let list=Object.values(shortyMap).sort((a,b)=>b.drivers.length-a.drivers.length);
  if(q) list=list.filter(s=>s.name.toLowerCase().includes(q)||s.phone.includes(q));
  const container=document.getElementById('shortiesContainer');
  if(!list.length){container.innerHTML='<div class="empty-state"><p>No shorties found</p></div>';return;}
  container.innerHTML=list.map(s=>{
    const active=s.drivers.filter(k=>k.status==='active');
    const completed=s.drivers.filter(k=>k.status==='completed');
    const repossessed=s.drivers.filter(k=>k.status==='repossession');
    const sPays=payments.filter(p=>s.drivers.some(k=>k.id===p.keke_id));
    const totalCol=sPays.reduce((ss,p)=>ss+Number(p.amount),0);
    const totalProfit=s.drivers.filter(k=>k.status==='completed').reduce((ss,k)=>ss+(k.paid-k.cost),0);
    const outstanding=active.reduce((ss,k)=>ss+(k.total_loan-k.paid),0);
    return `<div class="shorty-card">
      <div class="shorty-card-header">
        ${s.photo?`<img src="${s.photo}" style="width:44px;height:44px;border-radius:50%;object-fit:cover">`:`<div class="shorty-avatar">${s.name.charAt(0).toUpperCase()}</div>`}
        <div><div class="shorty-name">🔗 ${s.name}</div><div class="shorty-phone">📞 ${s.phone||'—'} ${s.address?'· 📍 '+s.address:''}</div></div>
        <div style="margin-left:auto"><button class="btn btn-call btn-sm" onclick="callDriver('${s.phone}')"><svg style="width:11px;height:11px;fill:none;stroke:white;stroke-width:2.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.35 2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</button></div>
      </div>
      <div class="shorty-stats">
        <div class="shorty-stat"><div class="ss-val">${s.drivers.length}</div><div class="ss-lbl">Total Drivers</div></div>
        <div class="shorty-stat"><div class="ss-val" style="color:var(--green)">${active.length}</div><div class="ss-lbl">Active</div></div>
        <div class="shorty-stat"><div class="ss-val" style="color:#7c3aed">${completed.length}</div><div class="ss-lbl">Completed</div></div>
        <div class="shorty-stat"><div class="ss-val" style="color:var(--red)">${repossessed.length}</div><div class="ss-lbl">Repossessed</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="background:var(--green-bg);border-radius:var(--radius-sm);padding:10px;text-align:center"><div style="font-size:.85rem;font-weight:800;color:var(--green)">${fmt(totalCol)}</div><div style="font-size:.67rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Total Collected</div></div>
        <div style="background:#ede9fe;border-radius:var(--radius-sm);padding:10px;text-align:center"><div style="font-size:.85rem;font-weight:800;color:#7c3aed">${fmt(totalProfit)}</div><div style="font-size:.67rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Profit Generated</div></div>
        <div style="background:var(--red-bg);border-radius:var(--radius-sm);padding:10px;text-align:center"><div style="font-size:.85rem;font-weight:800;color:var(--red)">${fmt(outstanding)}</div><div style="font-size:.67rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Outstanding</div></div>
      </div>
      <div style="border-top:1px solid var(--gray-200);padding-top:12px"><div style="font-size:.73rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">Drivers Brought</div>
      <div style="display:flex;flex-direction:column;gap:5px">${s.drivers.map(k=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:var(--gray-50);border-radius:var(--radius-sm);font-size:.82rem"><span><strong>${k.driver_name}</strong> · ${k.plate} ${batchBadge(k.batch)}</span><div style="display:flex;gap:6px;align-items:center">${statusBadge(k.status)}<button class="btn btn-outline btn-sm" style="padding:3px 8px;font-size:.72rem" onclick="openDetail('${k.id}')">View</button></div></div>`).join('')}</div>
      </div>
    </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
//  REGISTER KEKE
// ═══════════════════════════════════════════════════════════════
const ADD_KEKE_FIELDS = ['k_plate','k_pt','k_desc','k_chassis','k_engine','k_year','k_cost','k_total','k_batch','k_schedule','k_installment','k_start',
  'k_shorty','k_shorty_phone','k_shorty_phone2','k_shorty_address',
  'k_driver','k_phone','k_phone2','k_address','k_guarantor','k_gphone','k_grel','k_gaddress','k_notes'];

function resetAddForm() {
  ['k_plate','k_pt','k_desc','k_chassis','k_engine','k_year','k_cost','k_total','k_installment','k_notes',
   'k_shorty','k_shorty_phone','k_shorty_phone2','k_shorty_address',
   'k_driver','k_phone','k_phone2','k_address','k_guarantor','k_gphone','k_gaddress'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  ['k_schedule'].forEach(id=>document.getElementById(id).value='daily');
  ['k_grel','k_batch'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('profitBox').style.display='none';
  document.getElementById('installmentSummary').style.display='none';
  ['shortyPreview','driverPreview','guarantorPreview'].forEach(id=>{const el=document.getElementById(id);if(el){el.src='';el.classList.remove('visible');}});
  ['shortyPhotoBox','driverPhotoBox','guarantorPhotoBox'].forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='';});
  ['shortyPhotoInput','driverPhotoInput','guarantorPhotoInput'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  clearDraft('addKeke'); // form was explicitly reset/submitted — no leftover draft to restore
}
function calcProfit(){const cost=parseFmt(document.getElementById('k_cost')),total=parseFmt(document.getElementById('k_total'));if(cost>0&&total>0){document.getElementById('profitBox').style.display='block';document.getElementById('pb_cost').textContent=fmt(cost);document.getElementById('pb_total').textContent=fmt(total);document.getElementById('pb_profit').textContent=fmt(total-cost);}else document.getElementById('profitBox').style.display='none';calcInstallmentCount();}
function calcInstallmentCount(){const total=parseFmt(document.getElementById('k_total')),inst=parseFmt(document.getElementById('k_installment'));if(total>0&&inst>0){document.getElementById('installmentSummary').style.display='block';document.getElementById('is_count').textContent=Math.ceil(total/inst);document.getElementById('is_each').textContent=fmt(inst);}else document.getElementById('installmentSummary').style.display='none';}

async function saveKeke() {
  const plate=document.getElementById('k_plate').value.trim().toUpperCase();
  const driver=document.getElementById('k_driver').value.trim();
  const phone=document.getElementById('k_phone').value.trim();
  const shorty=document.getElementById('k_shorty').value.trim();
  const shortyPhone=document.getElementById('k_shorty_phone').value.trim();
  const cost=parseFmt(document.getElementById('k_cost'));
  const totalLoan=parseFmt(document.getElementById('k_total'));
  const inst=parseFmt(document.getElementById('k_installment'));
  const start=document.getElementById('k_start').value;
  const batch=document.getElementById('k_batch').value;
  if(!plate||!driver||!phone||!shorty||!shortyPhone||!cost||!totalLoan||!inst||!start||!batch){toast('Fill in all required (*) fields.','error');return;}
  const btn=document.getElementById('saveKekeBtn'); btn.innerHTML='<div class="spinner"></div> Saving...'; btn.disabled=true;
  try {
    const [shortyPhotoUrl,driverPhotoUrl,guarantorPhotoUrl]=await Promise.all([uploadPhoto(document.getElementById('shortyPhotoInput')),uploadPhoto(document.getElementById('driverPhotoInput')),uploadPhoto(document.getElementById('guarantorPhotoInput'))]);
    const keke={id:uid(),plate,pt_number:document.getElementById('k_pt').value.trim(),description:document.getElementById('k_desc').value.trim(),chassis_number:document.getElementById('k_chassis').value.trim(),engine_number:document.getElementById('k_engine').value.trim(),cost,total_loan:totalLoan,paid:0,status:'active',batch,shorty_name:shorty,shorty_phone:shortyPhone,shorty_phone2:document.getElementById('k_shorty_phone2').value.trim(),shorty_address:document.getElementById('k_shorty_address').value.trim(),shorty_photo_url:shortyPhotoUrl,driver_name:driver,driver_phone:phone,driver_alt_phone:document.getElementById('k_phone2').value.trim(),driver_address:document.getElementById('k_address').value.trim(),driver_photo_url:driverPhotoUrl,guarantor_name:document.getElementById('k_guarantor').value.trim(),guarantor_phone:document.getElementById('k_gphone').value.trim(),guarantor_address:document.getElementById('k_gaddress').value.trim(),guarantor_relationship:document.getElementById('k_grel').value,guarantor_photo_url:guarantorPhotoUrl,schedule:document.getElementById('k_schedule').value,installment_amount:inst,start_date:start,notes:document.getElementById('k_notes').value.trim(),completed_at:null,created_at:new Date().toISOString()};
    await dbSaveKeke(keke);
    logActivity(`Registered keke: ${plate}`,'register',`Driver: ${driver} | Shorty: ${shorty} | Batch ${batch} | Loan: ${fmt(totalLoan)}`);
    toast(`Keke ${plate} registered! 🛺`); resetAddForm(); showView('drivers');
  } catch(e){toast('Error: '+e.message,'error');}
  finally{btn.innerHTML='<svg style="width:15px;height:15px;fill:none;stroke:white;stroke-width:2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save & Register Keke';btn.disabled=false;}
}

// ═══════════════════════════════════════════════════════════════
//  ALL DRIVERS
// ═══════════════════════════════════════════════════════════════
function callDriver(phone){if(!phone){toast('No phone number','error');return;}window.location.href='tel:'+phone;}
function smsDriver(phone,name,plate,balance){if(!phone){toast('No phone number','error');return;}const msg=encodeURIComponent(`Hello ${name}, this is a reminder regarding your keke loan for vehicle ${plate}. Your outstanding balance is ${fmt(balance)}. Please make your payment as soon as possible. Thank you.`);window.location.href=`sms:${phone}?body=${msg}`;}

async function quickChangeStatus(kekeId, newStatus) {
  if(!isAdmin()){toast('Admin access required.','error');return;}
  const kekes=await dbGetKekes();
  const k=kekes.find(x=>x.id===kekeId);
  if(!k){toast('Driver not found.','error');return;}
  if(k.status===newStatus)return; // no change needed
  const updates={status:newStatus};
  if(newStatus==='completed'){
    if(!confirm(`Mark ${k.driver_name} (${k.plate}) as COMPLETED? This means the loan is fully paid off.`))return;
    updates.completed_at=new Date().toISOString();
  } else {
    updates.completed_at=null;
  }
  try{
    await dbUpdateKeke(kekeId, updates);
    logActivity(`Status changed: ${k.plate}`,'edit',`${k.driver_name}: ${k.status} → ${newStatus} | By: ${currentUser?.name||'?'}`);
    toast(`${k.driver_name} status updated to ${newStatus}.`);
    renderDrivers();
  }catch(e){toast('Error saving status: '+e.message,'error');}
}

async function renderDrivers() {
  const grid=document.getElementById('kekeGrid');
  grid.innerHTML='<div class="empty-state"><p>Loading...</p></div>';
  const q=(document.getElementById('driverSearch').value||'').toLowerCase();
  const filter=document.getElementById('driverFilter').value;
  const batchF=document.getElementById('batchFilter').value;
  let kekes=await dbGetKekes();
  if(filter) kekes=kekes.filter(k=>k.status===filter);
  if(batchF) kekes=kekes.filter(k=>k.batch===batchF);
  if(q) kekes=kekes.filter(k=>(k.driver_name||'').toLowerCase().includes(q)||(k.plate||'').toLowerCase().includes(q)||(k.pt_number||'').toLowerCase().includes(q)||(k.shorty_name||'').toLowerCase().includes(q));
  if(!kekes.length){grid.innerHTML='<div class="empty-state" style="grid-column:1/-1"><p>No kekes found</p></div>';return;}
  grid.innerHTML=kekes.map(k=>{
    const p=pct(k.paid,k.total_loan),bal=k.total_loan-k.paid,done=k.status==='completed';
    const paused=k.status==='on_repair'||k.status==='repossession'||done;
    const avatarHtml=k.driver_photo_url?`<img src="${k.driver_photo_url}" class="keke-avatar" alt="${k.driver_name}">`:`<div class="keke-avatar-placeholder">👤</div>`;
    const editBtn=isAdmin()?`<button class="btn btn-primary btn-sm" onclick="openEditKekeModal('${k.id}')">✏️ Edit</button>`:'';
    // Pay button — only shown for active drivers
    const payBtn=!paused
      ?`<button class="btn btn-primary btn-sm" onclick="openPaymentModal('${k.id}')"><svg style="width:11px;height:11px;fill:none;stroke:white;stroke-width:2.5" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>Payment</button>`
      :(done?`<span class="badge badge-green" style="font-size:.7rem">Ownership ✓</span>`:`<span class="badge badge-gray" style="font-size:.7rem">⏸ Paused</span>`);
    const repoBtn=isAdmin()&&k.status==='repossession'?`<button class="btn btn-danger btn-sm" onclick="openRepoModal('${k.id}')">🔄 Reassign</button>`:'';
    const breakTag=isOnBreak(k.batch)?`<span class="badge" style="background:#fef3c7;color:#92400e;font-size:.66rem">⏸️ Break</span>`:'';
    // Admin status dropdown
    const statusDropdown=isAdmin()?`<select class="status-quick-select" onchange="quickChangeStatus('${k.id}',this.value)" title="Change driver status">
      <option value="active"${k.status==='active'?' selected':''}>🟢 Active</option>
      <option value="on_repair"${k.status==='on_repair'?' selected':''}>🔧 On Repair</option>
      <option value="repossession"${k.status==='repossession'?' selected':''}>🔴 Repossession</option>
      <option value="completed"${k.status==='completed'?' selected':''}>✅ Completed</option>
    </select>`:'';
    return `<div class="keke-card">
      <div class="keke-card-header${done?' completed':k.status==='on_repair'?' on-repair':k.status==='repossession'?' repo':''}">
        <div class="keke-plate">🛺 ${k.plate}${k.pt_number?` <span style="font-size:.72rem;opacity:.7">PT:${k.pt_number}</span>`:''}</div>
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">${batchBadge(k.batch)} ${breakTag}</div>
      </div>
      <div class="keke-card-body">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px">
          ${statusBadge(k.status)}
          ${statusDropdown}
        </div>
        <div class="keke-driver-row" style="margin-top:4px">${avatarHtml}<div><div class="keke-driver">${k.driver_name}</div><div class="keke-phone">📞 ${k.driver_phone}${k.driver_address?' · 📍 '+k.driver_address:''}</div>${k.shorty_name?`<div style="font-size:.73rem;color:#0369a1;margin-top:2px">🔗 ${k.shorty_name}</div>`:''}</div></div>
        <div class="keke-amounts">
          <div class="keke-amt"><div class="al">Loan</div><div class="av">${fmt(k.total_loan)}</div></div>
          <div class="keke-amt"><div class="al">Paid</div><div class="av green">${fmt(k.paid)}</div></div>
          <div class="keke-amt"><div class="al">Balance</div><div class="av${done?'':' red'}">${done?'—':fmt(bal)}</div></div>
        </div>
        <div class="progress-wrap"><div class="progress-bar${p<30?' danger':p<70?' warning':''}" style="width:${p}%"></div></div>
        <div class="progress-label"><span>${p}% paid</span><span>${fmt(k.installment_amount)} / instalment</span></div>
      </div>
      <div class="keke-card-footer">
        <button class="btn btn-call btn-sm" onclick="callDriver('${k.driver_phone}')"><svg style="width:12px;height:12px;fill:none;stroke:white;stroke-width:2.5" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.35 2 2 0 0 1 3.56 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>Call</button>
        <button class="btn btn-sms btn-sm" onclick="smsDriver('${k.driver_phone}','${k.driver_name}','${k.plate}',${bal})"><svg style="width:12px;height:12px;fill:none;stroke:white;stroke-width:2.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>SMS</button>
        <button class="btn btn-outline btn-sm" onclick="openDetail('${k.id}')">Details</button>
        <button class="btn btn-outline btn-sm" onclick="openComplaintModal('${k.id}')">📋</button>
        ${editBtn}${payBtn}${repoBtn}
      </div>
    </div>`;
  }).join('');
}

function saveBatchSchedules(){
  const s={
    A:{startDate:document.getElementById('bsched_A')?.value||''},
    B:{startDate:document.getElementById('bsched_B')?.value||''},
    C:{startDate:document.getElementById('bsched_C')?.value||''}
  };
  LOCAL.saveBatchSchedules(s);
  logActivity('Batch schedules updated','edit',`A:${s.A.startDate||'none'} B:${s.B.startDate||'none'} C:${s.C.startDate||'none'} By:${currentUser?.name||'?'}`);
  toast('Batch payment schedules saved!');
  renderAlerts();
}

function loadBatchScheduleInputs(){
  const s=LOCAL.getBatchSchedules();
  ['A','B','C'].forEach(b=>{
    const el=document.getElementById('bsched_'+b);
    if(el) el.value=(s[b]&&s[b].startDate)||'';
  });
}

// ═══════════════════════════════════════════════════════════════
//  ALERTS
// ═══════════════════════════════════════════════════════════════
async function renderAlerts(){
  loadBatchScheduleInputs();
  const kekes=await dbGetKekes(),payments=await dbGetPayments();
  const overdue=getOverdueDrivers(kekes,payments);
  document.getElementById('alertCount').textContent=overdue.length+' drivers';
  const container=document.getElementById('alertsList');

  // Batch payment day alerts (at top)
  const batchAlertHtml = renderBatchPaymentAlerts();

  if(!overdue.length){
    container.innerHTML=(batchAlertHtml||'')+'<div class="empty-state"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg><p>All drivers up to date! 🎉</p></div>';
    document.getElementById('alertBadge').style.display='none';
    return;
  }
  document.getElementById('alertBadge').textContent=overdue.length;document.getElementById('alertBadge').style.display='';
  container.innerHTML=(batchAlertHtml||'')+'<div class="overdue-list">'+overdue.map(k=>{
    const kp=payments.filter(p=>p.keke_id===k.id);
    const lastPay=kp.length?kp.reduce((a,b)=>new Date(a.payment_date)>new Date(b.payment_date)?a:b):null;
    const daysAgo=lastPay?Math.floor((Date.now()-new Date(lastPay.payment_date).getTime())/86400000):'Never paid';
    const bal=k.total_loan-k.paid;
    return`<div class="overdue-item"><div class="oi-info"><div class="oi-name">🛺 ${k.driver_name} &nbsp;<span class="badge badge-gray">${k.plate}</span> ${batchBadge(k.batch)}</div><div class="oi-detail">Balance: <strong style="color:var(--red)">${fmt(bal)}</strong> · Last payment: <strong>${typeof daysAgo==='number'?daysAgo+' days ago':daysAgo}</strong> · 📞 ${k.driver_phone}</div></div><div class="oi-actions"><button class="btn btn-call btn-sm" onclick="callDriver('${k.driver_phone}')">Call</button><button class="btn btn-sms btn-sm" onclick="smsDriver('${k.driver_phone}','${k.driver_name}','${k.plate}',${bal})">SMS</button><button class="btn btn-primary btn-sm" onclick="openPaymentModal('${k.id}')">Pay</button></div></div>`;
  }).join('')+'</div>';
}

// ═══════════════════════════════════════════════════════════════
//  PAYMENT LOG
// ═══════════════════════════════════════════════════════════════
async function renderPayments(){
  const q=(document.getElementById('paySearch').value||'').toLowerCase();
  const d=document.getElementById('payDate').value;
  let payments=await dbGetPayments();
  if(q) payments=payments.filter(p=>(p.driver_name||'').toLowerCase().includes(q)||(p.plate||'').toLowerCase().includes(q));
  if(d) payments=payments.filter(p=>p.payment_date===d);
  document.getElementById('payCount').textContent=payments.length+' records';
  const tbody=document.getElementById('paymentsTable');
  if(!payments.length){tbody.innerHTML='<tr><td colspan="8"><div class="empty-state"><p>No payments found</p></div></td></tr>';return;}
  const actionsCol=isAdmin()?(id=>`<button class="btn btn-outline btn-sm" onclick="openEditPaymentModal('${id}')">✏️</button> <button class="btn btn-danger btn-sm" onclick="deletePaymentById('${id}')">🗑️</button>`):()=>'';
  tbody.innerHTML=payments.map(p=>{
    const hasOver=p.overpay_amount>0;
    const amountCell=hasOver
      ?`<span style="font-weight:700">${fmt(p.expected_amount)}</span><span class="pay-over-tag">+${fmt(p.overpay_amount)}</span>`
      :`${fmt(p.amount)}${p.is_short?' ⚠️':''}`;
    return`<tr class="${p.is_short?'pay-short-row':hasOver?'pay-over-row':''}"><td>${new Date(p.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</td><td><strong>${p.driver_name}</strong></td><td><span class="badge badge-gray">${p.plate}</span></td><td>${batchBadge(p.batch)}</td><td class="${p.is_short?'pay-short':hasOver?'pay-over':''}" style="font-weight:700">${amountCell}</td><td style="color:var(--red)">${p.balance_after<=0?'<span class="badge badge-green">CLEARED ✓</span>':fmt(p.balance_after)}</td><td style="color:var(--gray-500)">${p.note||'—'}</td><td>${actionsCol(p.id)}</td></tr>`;
  }).join('');
}
async function deletePaymentById(payId){if(!isAdmin()){toast('Admin access required','error');return;}if(!confirm('Delete this payment?'))return;editingPaymentId=payId;await deletePayment();}

// ═══════════════════════════════════════════════════════════════
//  COMPLETED
// ═══════════════════════════════════════════════════════════════
async function renderCompleted(){const kekes=(await dbGetKekes()).filter(k=>k.status==='completed');document.getElementById('completedCount').textContent=kekes.length+' kekes';const tbody=document.getElementById('completedTable');if(!kekes.length){tbody.innerHTML='<tr><td colspan="7"><div class="empty-state"><p>No completed loans yet</p></div></td></tr>';return;}tbody.innerHTML=kekes.map(k=>`<tr><td><strong>${k.driver_name}</strong><div style="font-size:.76rem;color:var(--gray-500)">${k.driver_phone}</div></td><td><span class="badge badge-gray">${k.plate}</span>${k.pt_number?`<div style="font-size:.74rem;color:var(--gray-500)">PT: ${k.pt_number}</div>`:''}</td><td>${batchBadge(k.batch)}</td><td>${fmt(k.cost)}</td><td style="color:var(--green);font-weight:700">${fmt(k.paid)}</td><td style="color:#7c3aed;font-weight:700">${fmt(k.paid-k.cost)}</td><td>${k.completed_at?new Date(k.completed_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}):'—'}</td></tr>`).join('');}

// ═══════════════════════════════════════════════════════════════
//  PAYMENT MODAL
// ═══════════════════════════════════════════════════════════════
let currentKekeId=null, _currentInstallment=0, _savingPayment=false;
async function openPaymentModal(id){
  currentKekeId=id;
  _savingPayment=false; // always reset on open
  const kekes=await dbGetKekes(); const k=kekes.find(x=>x.id===id); if(!k)return;
  // Hard guard — payments paused for non-active drivers
  if(k.status!=='active'){
    const labels={on_repair:'🔧 On Repair',repossession:'🔴 Repossession',completed:'✅ Completed'};
    toast(`Payments paused — ${k.driver_name} is currently ${labels[k.status]||k.status}.`,'error');
    return;
  }
  _currentInstallment=k.installment_amount||0;
  document.getElementById('pmTitle').textContent=`Record Payment — ${k.driver_name} (${k.plate})`;
  document.getElementById('pm_amount').value=k.installment_amount ? Number(k.installment_amount).toLocaleString('en-NG') : '';
  document.getElementById('pm_date').valueAsDate=new Date();
  document.getElementById('pm_note').value='';
  document.getElementById('pmShortWarning').style.display='none';
  document.getElementById('pmOverWarning').style.display='none';
  const bal=k.total_loan-k.paid;
  document.getElementById('pmLoanSummary').innerHTML=`<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;text-align:center"><div><div style="font-size:.7rem;color:var(--gray-400);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Expected</div><div style="font-weight:800;color:var(--gray-800)">${fmt(k.installment_amount)}</div></div><div><div style="font-size:.7rem;color:var(--gray-400);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Paid So Far</div><div style="font-weight:800;color:var(--green)">${fmt(k.paid)}</div></div><div><div style="font-size:.7rem;color:var(--gray-400);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Balance</div><div style="font-weight:800;color:var(--red)">${fmt(bal)}</div></div></div>`;
  document.getElementById('paymentModal').classList.add('active');
  const draftKey = 'payment_' + id;
  wireAutosave(draftKey, ['pm_amount','pm_date','pm_note']);
  offerDraftRestore(draftKey, ['pm_amount','pm_date','pm_note'], 'payment entry');
}
function checkShortPayment(input){
  const v=parseFmt(input);
  const shortWarn=document.getElementById('pmShortWarning');
  const overWarn=document.getElementById('pmOverWarning');
  shortWarn.style.display=(v>0&&v<_currentInstallment)?'':'none';
  if(v>0&&v>_currentInstallment){
    const extra=v-_currentInstallment;
    document.getElementById('pmOverExtra').textContent='₦'+Number(extra).toLocaleString('en-NG');
    overWarn.style.display='';
  } else {
    overWarn.style.display='none';
  }
}
function closePaymentModal(){document.getElementById('paymentModal').classList.remove('active');if(currentKekeId)clearDraft('payment_'+currentKekeId);currentKekeId=null;_savingPayment=false;}

async function savePayment(){
  if(_savingPayment)return; // prevent double-click
  _savingPayment=true;
  const amount=parseFmt(document.getElementById('pm_amount'));
  const date=document.getElementById('pm_date').value;
  const note=document.getElementById('pm_note').value.trim();
  if(!amount||!date){toast('Enter amount and date.','error');_savingPayment=false;return;}
  const btn=document.getElementById('savePayBtn'); btn.innerHTML='<div class="spinner"></div> Saving...'; btn.disabled=true;
  try{
    const kekes=await dbGetKekes(); const k=kekes.find(x=>x.id===currentKekeId); if(!k)throw new Error('Keke not found');
    const isShort=amount<k.installment_amount;
    const overpayAmount=Math.max(0,amount-k.installment_amount);
    const actual=Math.min(amount,k.total_loan-k.paid),newPaid=k.paid+actual,newBal=k.total_loan-newPaid,isComplete=newBal<=0;
    await dbUpdateKeke(k.id,{paid:newPaid,status:isComplete?'completed':'active',completed_at:isComplete?new Date().toISOString():null});
    await dbSavePayment({id:uid(),keke_id:k.id,plate:k.plate,driver_name:k.driver_name,batch:k.batch,amount:actual,balance_after:Math.max(0,newBal),payment_date:date,note,is_short:isShort,expected_amount:k.installment_amount,overpay_amount:overpayAmount,recorded_at:new Date().toISOString()});
    logActivity(`Payment: ${k.plate}`,'payment',`Driver: ${k.driver_name} | ${fmt(actual)}${isShort?' [SHORT]':overpayAmount>0?' [OVER +'+fmt(overpayAmount)+']':''} | Bal: ${fmt(Math.max(0,newBal))} | By: ${currentUser?.name||'?'}`);
    closePaymentModal();
    if(isComplete){toast(`🎉 FULLY PAID! Keke ${k.plate} belongs to ${k.driver_name}!`);setTimeout(()=>showView('completed'),700);}
    else{toast(`Payment of ${fmt(actual)} recorded.${isShort?' ⚠️ Short payment.':overpayAmount>0?' 💚 Includes '+fmt(overpayAmount)+' extra.':''}`);renderDrivers();}
  }catch(e){toast('Error: '+e.message,'error');_savingPayment=false;}
  finally{btn.innerHTML='<svg style="width:13px;height:13px;fill:none;stroke:white;stroke-width:2" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg> Record Payment';btn.disabled=false;}
}

// ═══════════════════════════════════════════════════════════════
//  COMPLAINT LOG
// ═══════════════════════════════════════════════════════════════
let currentComplaintKekeId=null;
function openComplaintModal(kekeId){currentComplaintKekeId=kekeId;const kekes=LOCAL.getKekes();const k=kekes.find(x=>x.id===kekeId);if(!k)return;document.getElementById('complaintTitle').textContent=`📋 Complaint Log — ${k.driver_name} (${k.plate})`;document.getElementById('comp_date').valueAsDate=new Date();document.getElementById('comp_text').value='';document.getElementById('comp_category').value='payment';renderComplaintList();document.getElementById('complaintModal').classList.add('active');}
function closeComplaintModal(){document.getElementById('complaintModal').classList.remove('active');currentComplaintKekeId=null;}
function renderComplaintList(){
  const all=LOCAL.getComplaints();
  const comps=all.filter(c=>c.keke_id===currentComplaintKekeId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const container=document.getElementById('complaintList');
  if(!comps.length){container.innerHTML='<div class="empty-state" style="padding:16px 0"><p>No complaints recorded yet.</p></div>';return;}
  const catLabel={payment:'💳 Payment Issue',behaviour:'😤 Behaviour',accident:'🔧 Accident/Damage',missing:'❓ Missing/No Contact',other:'📌 Other'};
  container.innerHTML=`<div style="font-size:.76rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">${comps.length} Record(s)</div>`+comps.map(c=>`<div class="complaint-item ${c.category}"><div class="comp-header"><span class="comp-cat">${catLabel[c.category]||c.category}</span><div style="display:flex;align-items:center;gap:8px"><span class="comp-date">${new Date(c.date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</span>${isAdmin()?`<button class="comp-del" onclick="deleteComplaint('${c.id}')">✕</button>`:''}</div></div><div class="comp-text">${c.text}</div>${c.recorded_by?`<div style="font-size:.71rem;color:var(--gray-400);margin-top:4px">By: ${c.recorded_by}</div>`:''}</div>`).join('');
}
function saveComplaint(){const text=document.getElementById('comp_text').value.trim();const date=document.getElementById('comp_date').value;const category=document.getElementById('comp_category').value;if(!text||!date){toast('Enter complaint text and date.','error');return;}const c={id:uid(),keke_id:currentComplaintKekeId,text,date,category,recorded_by:currentUser?.name||'?',created_at:new Date().toISOString()};_sbSaveComplaint(c);const k=LOCAL.getKekes().find(x=>x.id===currentComplaintKekeId);logActivity(`Complaint: ${k?.plate||''}`,'complaint',`Driver: ${k?.driver_name||''} | ${category} | ${text.slice(0,50)} | By: ${currentUser?.name||'?'}`);document.getElementById('comp_text').value='';renderComplaintList();toast('Complaint recorded.');}
function deleteComplaint(compId){if(!isAdmin()){toast('Admin access required.','error');return;}if(!confirm('Delete this complaint?'))return;CACHE.complaints=(CACHE.complaints||[]).filter(c=>c.id!==compId);_sbDeleteComplaint(compId);renderComplaintList();toast('Deleted.','error');}

// ═══════════════════════════════════════════════════════════════
//  HELPER: render doc list inside detail modal
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
//  REPOSSESSION / REASSIGN
// ═══════════════════════════════════════════════════════════════
let currentRepoKekeId=null;
async function openRepoModal(kekeId){if(!isAdmin()){toast('Admin access required.','error');return;}currentRepoKekeId=kekeId;const kekes=await dbGetKekes();const k=kekes.find(x=>x.id===kekeId);if(!k)return;document.getElementById('repoTitle').textContent=`Reassign ${k.plate}`;document.getElementById('repoKekeInfo').innerHTML=`<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>Keke <strong>${k.plate}</strong> being reassigned from <strong>${k.driver_name}</strong>. Same keke details kept. New loan starts from scratch.</p>`;document.getElementById('repo_start').valueAsDate=new Date();document.getElementById('repo_total').value='';document.getElementById('repo_inst').value=k.installment_amount?Number(k.installment_amount).toLocaleString('en-NG'):'';document.getElementById('repo_schedule').value=k.schedule||'3days';document.getElementById('repo_batch').value=k.batch||'';['repo_driver','repo_phone','repo_phone2','repo_address','repo_guarantor','repo_gphone','repo_gaddress','repo_shorty','repo_shorty_phone','repo_notes'].forEach(id=>document.getElementById(id).value='');document.getElementById('repo_grel').value='';document.getElementById('repoModal').classList.add('active');}
function closeRepoModal(){document.getElementById('repoModal').classList.remove('active');currentRepoKekeId=null;}
async function saveReassign(){
  if(!isAdmin()){toast('Admin access required.','error');return;}
  const newDriver=document.getElementById('repo_driver').value.trim(),newPhone=document.getElementById('repo_phone').value.trim();
  const newShorty=document.getElementById('repo_shorty').value.trim(),newShortyPhone=document.getElementById('repo_shorty_phone').value.trim();
  const newTotal=parseFmt(document.getElementById('repo_total')),newInst=parseFmt(document.getElementById('repo_inst'));
  const newStart=document.getElementById('repo_start').value,newBatch=document.getElementById('repo_batch').value;
  if(!newDriver||!newPhone||!newShorty||!newShortyPhone||!newTotal||!newInst||!newStart||!newBatch){toast('Fill in all required fields.','error');return;}
  const btn=document.getElementById('saveRepoBtn'); btn.textContent='Saving...'; btn.disabled=true;
  try{
    const kekes=await dbGetKekes(); const k=kekes.find(x=>x.id===currentRepoKekeId); if(!k)throw new Error('Keke not found');
    await dbUpdateKeke(k.id,{status:'repossession',repossessed_at:new Date().toISOString()});
    const newKeke={id:uid(),plate:k.plate,pt_number:k.pt_number,description:k.description,chassis_number:k.chassis_number,engine_number:k.engine_number,cost:k.cost,total_loan:newTotal,paid:0,status:'active',batch:newBatch,shorty_name:newShorty,shorty_phone:newShortyPhone,driver_name:newDriver,driver_phone:newPhone,driver_alt_phone:document.getElementById('repo_phone2').value.trim(),driver_address:document.getElementById('repo_address').value.trim(),guarantor_name:document.getElementById('repo_guarantor').value.trim(),guarantor_phone:document.getElementById('repo_gphone').value.trim(),guarantor_address:document.getElementById('repo_gaddress').value.trim(),guarantor_relationship:document.getElementById('repo_grel').value,schedule:document.getElementById('repo_schedule').value,installment_amount:newInst,start_date:newStart,notes:document.getElementById('repo_notes').value.trim(),repossessed_from:k.driver_name,completed_at:null,created_at:new Date().toISOString()};
    await dbSaveKeke(newKeke);
    logActivity(`Keke reassigned: ${k.plate}`,'edit',`${k.driver_name} → ${newDriver} | Shorty: ${newShorty} | Batch ${newBatch} | By: ${currentUser?.name||'?'}`);
    toast(`Keke ${k.plate} reassigned to ${newDriver} 🔄`);
    closeRepoModal(); closeDetailModal(); renderDrivers();
  }catch(e){toast('Error: '+e.message,'error');}
  finally{btn.textContent='🔄 Reassign to New Driver';btn.disabled=false;}
}

// ═══════════════════════════════════════════════════════════════
//  EDIT KEKE (admin only)
// ═══════════════════════════════════════════════════════════════
let editingKekeId=null;
async function openEditKekeModal(id){if(!isAdmin()){toast('Admin access required.','error');return;}const kekes=await dbGetKekes();const k=kekes.find(x=>x.id===id);if(!k)return;editingKekeId=id;document.getElementById('editKekeTitle').textContent=`Edit — ${k.plate} (${k.driver_name})`;const f={ek_plate:'plate',ek_pt:'pt_number',ek_desc:'description',ek_chassis:'chassis_number',ek_engine:'engine_number'};Object.entries(f).forEach(([el,kk])=>document.getElementById(el).value=k[kk]||'');document.getElementById('ek_year').value='';document.getElementById('ek_cost').value=k.cost?Number(k.cost).toLocaleString('en-NG'):'';document.getElementById('ek_total').value=k.total_loan?Number(k.total_loan).toLocaleString('en-NG'):'';document.getElementById('ek_paid').value=k.paid?Number(k.paid).toLocaleString('en-NG'):'';document.getElementById('ek_inst').value=k.installment_amount?Number(k.installment_amount).toLocaleString('en-NG'):'';document.getElementById('ek_schedule').value=k.schedule||'daily';document.getElementById('ek_batch').value=k.batch||'';document.getElementById('ek_start').value=k.start_date||'';document.getElementById('ek_status').value=k.status||'active';document.getElementById('ek_shorty').value=k.shorty_name||'';document.getElementById('ek_shorty_phone').value=k.shorty_phone||'';document.getElementById('ek_shorty_address').value=k.shorty_address||'';document.getElementById('ek_driver').value=k.driver_name||'';document.getElementById('ek_phone').value=k.driver_phone||'';document.getElementById('ek_phone2').value=k.driver_alt_phone||'';document.getElementById('ek_address').value=k.driver_address||'';document.getElementById('ek_guarantor').value=k.guarantor_name||'';document.getElementById('ek_gphone').value=k.guarantor_phone||'';document.getElementById('ek_grel').value=k.guarantor_relationship||'';document.getElementById('ek_gaddress').value=k.guarantor_address||'';document.getElementById('ek_notes').value=k.notes||'';document.getElementById('editKekeModal').classList.add('active');}
function closeEditKekeModal(){document.getElementById('editKekeModal').classList.remove('active');editingKekeId=null;}
async function saveEditKeke(){if(!editingKekeId)return;const plate=document.getElementById('ek_plate').value.trim().toUpperCase(),driver=document.getElementById('ek_driver').value.trim(),phone=document.getElementById('ek_phone').value.trim();if(!plate||!driver||!phone){toast('Plate, driver name and phone required.','error');return;}const btn=document.getElementById('saveEditKekeBtn');btn.innerHTML='<div class="spinner"></div> Saving...';btn.disabled=true;try{const newPaid=parseFmt(document.getElementById('ek_paid')),newTotal=parseFmt(document.getElementById('ek_total')),newStatus=document.getElementById('ek_status').value;const updates={plate,pt_number:document.getElementById('ek_pt').value.trim(),description:document.getElementById('ek_desc').value.trim(),chassis_number:document.getElementById('ek_chassis').value.trim(),engine_number:document.getElementById('ek_engine').value.trim(),cost:parseFmt(document.getElementById('ek_cost')),total_loan:newTotal,paid:newPaid,status:newStatus,installment_amount:parseFmt(document.getElementById('ek_inst')),schedule:document.getElementById('ek_schedule').value,batch:document.getElementById('ek_batch').value,start_date:document.getElementById('ek_start').value,shorty_name:document.getElementById('ek_shorty').value.trim(),shorty_phone:document.getElementById('ek_shorty_phone').value.trim(),shorty_address:document.getElementById('ek_shorty_address').value.trim(),driver_name:driver,driver_phone:phone,driver_alt_phone:document.getElementById('ek_phone2').value.trim(),driver_address:document.getElementById('ek_address').value.trim(),guarantor_name:document.getElementById('ek_guarantor').value.trim(),guarantor_phone:document.getElementById('ek_gphone').value.trim(),guarantor_relationship:document.getElementById('ek_grel').value,guarantor_address:document.getElementById('ek_gaddress').value.trim(),notes:document.getElementById('ek_notes').value.trim(),completed_at:newStatus==='completed'?new Date().toISOString():null};await dbUpdateKeke(editingKekeId,updates);logActivity(`Edited: ${plate}`,'edit',`Driver: ${driver} | Batch ${updates.batch} | Status: ${newStatus} | By: ${currentUser?.name||'?'}`);toast(`Keke ${plate} updated.`);closeEditKekeModal();closeDetailModal();renderDrivers();}catch(e){toast('Error: '+e.message,'error');}finally{btn.innerHTML='Save Changes';btn.disabled=false;}}
async function deleteKeke(){
  if(!isAdmin()){toast('Admin access required.','error');return;}
  if(!editingKekeId)return;
  const kekes=await dbGetKekes();const k=kekes.find(x=>x.id===editingKekeId);if(!k)return;
  if(!confirm(`⚠️ Permanently delete ${k.plate} (${k.driver_name}) and ALL records?\n\nThis cannot be undone.`))return;
  try{
    // Clear cache first
    CACHE.kekes=(CACHE.kekes||[]).filter(x=>x.id!==editingKekeId);
    CACHE.payments=(CACHE.payments||[]).filter(p=>p.keke_id!==editingKekeId);
    CACHE.complaints=(CACHE.complaints||[]).filter(c=>c.keke_id!==editingKekeId);
    CACHE.serviceRecords=(CACHE.serviceRecords||[]).filter(r=>r.keke_id!==editingKekeId);
    CACHE.documents=(CACHE.documents||[]).filter(d=>d.keke_id!==editingKekeId);
    // Cascade delete in Supabase
    await Promise.all([
      sb.delete('keke_payments',`keke_id=eq.${editingKekeId}`).catch(e=>console.error('del payments',e)),
      sb.delete('keke_complaints',`keke_id=eq.${editingKekeId}`).catch(e=>console.error('del complaints',e)),
      sb.delete('keke_service_records',`keke_id=eq.${editingKekeId}`).catch(e=>console.error('del svc',e)),
      sb.delete('keke_documents',`keke_id=eq.${editingKekeId}`).catch(e=>console.error('del docs',e)),
    ]);
    await sb.delete('keke_loans',`id=eq.${editingKekeId}`).catch(e=>console.error('del keke',e));
    logActivity(`Deleted: ${k.plate}`,'delete',`Driver: ${k.driver_name} | By: ${currentUser?.name||'?'}`);
    toast(`Keke ${k.plate} deleted.`,'error');
    closeEditKekeModal();closeDetailModal();renderDrivers();
  }catch(e){toast('Error: '+e.message,'error');}
}

// ═══════════════════════════════════════════════════════════════
//  EDIT PAYMENT (admin only)
// ═══════════════════════════════════════════════════════════════
let editingPaymentId=null;
async function openEditPaymentModal(payId){if(!isAdmin()){toast('Admin access required.','error');return;}let payments=await dbGetPayments();const p=payments.find(x=>x.id===payId);if(!p)return;editingPaymentId=payId;document.getElementById('ep_amount').value=p.amount?Number(p.amount).toLocaleString('en-NG'):'';document.getElementById('ep_date').value=p.payment_date||'';document.getElementById('ep_balance').value=p.balance_after?Number(p.balance_after).toLocaleString('en-NG'):'';document.getElementById('ep_note').value=p.note||'';document.getElementById('editPaymentModal').classList.add('active');}
function closeEditPaymentModal(){document.getElementById('editPaymentModal').classList.remove('active');editingPaymentId=null;}
async function saveEditPayment(){
  if(!editingPaymentId)return;
  const amount=parseFmt(document.getElementById('ep_amount')),date=document.getElementById('ep_date').value;
  if(!amount||!date){toast('Amount and date required.','error');return;}
  const btn=document.getElementById('saveEditPayBtn');btn.textContent='Saving...';btn.disabled=true;
  try{
    const updates={amount,payment_date:date,balance_after:parseFmt(document.getElementById('ep_balance')),note:document.getElementById('ep_note').value.trim()};
    // Update Supabase first — properly awaited
    await sb.update('keke_payments',`id=eq.${editingPaymentId}`,updates);
    // Update cache
    const idx=(CACHE.payments||[]).findIndex(x=>x.id===editingPaymentId);
    if(idx>=0) CACHE.payments[idx]={...CACHE.payments[idx],...updates};
    // Recalculate keke paid total from all payments
    const editedPay=CACHE.payments[idx>=0?idx:0];
    if(editedPay?.keke_id){
      const kekeId=editedPay.keke_id;
      const allKekePays=(CACHE.payments||[]).filter(p=>p.keke_id===kekeId);
      const newTotalPaid=allKekePays.reduce((s,p)=>s+Number(p.amount),0);
      await dbUpdateKeke(kekeId,{paid:newTotalPaid});
    }
    logActivity('Edited payment','edit',`${fmt(amount)} | ${date} | By: ${currentUser?.name||'?'}`);
    toast('Payment updated.');closeEditPaymentModal();renderPayments();
  }catch(e){toast('Error: '+e.message,'error');}
  finally{btn.textContent='Save Changes';btn.disabled=false;}
}
async function deletePayment(){if(!isAdmin()){toast('Admin access required.','error');return;}if(!editingPaymentId)return;if(!confirm('Delete this payment?'))return;try{const all=LOCAL.getPayments();const p=all.find(x=>x.id===editingPaymentId)||{};await dbDeletePayment(editingPaymentId);logActivity('Deleted payment','delete',`Driver: ${p.driver_name||''} | ${fmt(p.amount)} | By: ${currentUser?.name||'?'}`);toast('Payment deleted.','error');closeEditPaymentModal();renderPayments();}catch(e){toast('Error: '+e.message,'error');}}

// ═══════════════════════════════════════════════════════════════
//  DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
let currentDetailKekeId=null;
async function openDetail(id){
  currentDetailKekeId=id;
  const kekes=await dbGetKekes(); const k=kekes.find(x=>x.id===id); if(!k)return;
  const payments=await dbGetPayments(id);
  const complaints=LOCAL.getComplaints().filter(c=>c.keke_id===id);
  const p=pct(k.paid,k.total_loan),bal=k.total_loan-k.paid;
  const df=document.getElementById('dm_pdf_from'),dt=document.getElementById('dm_pdf_to');
  if(df)df.value=''; if(dt)dt.value='';
  document.getElementById('dmTitle').textContent=`${k.plate} — ${k.driver_name}`;
  const catLabel={payment:'💳 Payment',behaviour:'😤 Behaviour',accident:'🔧 Accident',missing:'❓ Missing',other:'📌 Other'};
  const docs = LOCAL.getDocuments().filter(d=>d.keke_id===id);
  document.getElementById('dmBody').innerHTML=`
    ${k.status==='completed'?`<div class="completion-banner"><div class="cb-icon">🎉</div><div><h3>Loan Fully Paid!</h3><p>Keke transferred to ${k.driver_name} on ${new Date(k.completed_at).toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'})}.</p></div></div>`:''}
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:14px;flex-wrap:wrap">${statusBadge(k.status)} ${batchBadge(k.batch)} ${isOnBreak(k.batch)?'<span class="badge" style="background:#fef3c7;color:#92400e">⏸️ On Break</span>':''}</div>
    <div class="detail-photos">
      <div class="detail-photo-box">${k.shorty_photo_url?`<img src="${k.shorty_photo_url}" alt="Shorty">`:'<div style="height:100px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--gray-100)">🔗</div>'}<div class="dpl">Shorty <button class="detail-photo-edit-btn" onclick="openPhotoUpdateModal('${k.id}','shorty')">📷 Update</button></div></div>
      <div class="detail-photo-box">${k.driver_photo_url?`<img src="${k.driver_photo_url}" alt="Driver">`:'<div style="height:100px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--gray-100)">👤</div>'}<div class="dpl">Driver <button class="detail-photo-edit-btn" onclick="openPhotoUpdateModal('${k.id}','driver')">📷 Update</button></div></div>
      <div class="detail-photo-box">${k.guarantor_photo_url?`<img src="${k.guarantor_photo_url}" alt="Guarantor">`:'<div style="height:100px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;background:var(--gray-100)">👤</div>'}<div class="dpl">Guarantor <button class="detail-photo-edit-btn" onclick="openPhotoUpdateModal('${k.id}','guarantor')">📷 Update</button></div></div>
    </div>
    ${k.shorty_name?`<div class="shorty-box"><div class="lbl">🔗 Shorty (Referrer)</div><div style="font-size:.84rem;line-height:2;color:var(--gray-700)"><strong>Name:</strong> ${k.shorty_name} &nbsp;·&nbsp; <strong>Phone:</strong> <a href="tel:${k.shorty_phone}" style="color:#0369a1">${k.shorty_phone}</a>${k.shorty_address?' &nbsp;·&nbsp; <strong>Address:</strong> '+k.shorty_address:''}</div></div>`:''}
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
      <div style="background:var(--gray-50);border-radius:var(--radius-sm);padding:13px"><div style="font-size:.7rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🛺 Keke Info</div><div style="font-size:.84rem;line-height:2;color:var(--gray-700)"><strong>Plate:</strong> ${k.plate}<br><strong>PT:</strong> ${k.pt_number||'—'}<br><strong>Desc:</strong> ${k.description||'—'}<br><strong>Chassis:</strong> ${k.chassis_number||'—'}<br><strong>Engine:</strong> ${k.engine_number||'—'}<br><strong>Schedule:</strong> ${schedLabel(k.schedule)}<br><strong>Instalment:</strong> ${fmt(k.installment_amount)}<br><strong>Start:</strong> ${k.start_date||'—'}</div></div>
      <div style="background:var(--gray-50);border-radius:var(--radius-sm);padding:13px"><div style="font-size:.7rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">👤 Driver & Guarantor</div><div style="font-size:.84rem;line-height:2;color:var(--gray-700)"><strong>Driver:</strong> ${k.driver_name}<br><strong>Phone:</strong> <a href="tel:${k.driver_phone}" style="color:var(--green)">${k.driver_phone}</a>${k.driver_alt_phone?' / '+k.driver_alt_phone:''}<br><strong>Address:</strong> ${k.driver_address||'—'}<br><strong>Guarantor:</strong> ${k.guarantor_name||'—'}<br><strong>G.Phone:</strong> ${k.guarantor_phone?`<a href="tel:${k.guarantor_phone}" style="color:var(--green)">${k.guarantor_phone}</a>`:'—'}<br><strong>G.Relation:</strong> ${k.guarantor_relationship||'—'}</div></div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
      <div style="text-align:center;padding:12px;background:var(--gray-50);border-radius:var(--radius-sm)"><div style="font-size:.7rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Purchase Cost</div><div style="font-weight:800;color:var(--gray-800)">${fmt(k.cost)}</div></div>
      <div style="text-align:center;padding:12px;background:var(--green-bg);border-radius:var(--radius-sm)"><div style="font-size:.7rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Total Paid</div><div style="font-weight:800;color:var(--green)">${fmt(k.paid)}</div></div>
      <div style="text-align:center;padding:12px;background:${k.status==='completed'?'var(--green-bg)':'var(--red-bg)'};border-radius:var(--radius-sm)"><div style="font-size:.7rem;font-weight:700;color:var(--gray-400);text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">Balance</div><div style="font-weight:800;color:${k.status==='completed'?'var(--green)':'var(--red)'}">${k.status==='completed'?'CLEARED':fmt(bal)}</div></div>
    </div>
    <div class="progress-wrap" style="height:11px"><div class="progress-bar${p<30?' danger':p<70?' warning':''}" style="width:${p}%"></div></div>
    <div class="progress-label"><span>${p}% completed</span><span>${fmt(k.paid)} / ${fmt(k.total_loan)}</span></div>
    ${k.notes?`<div style="margin-top:12px;font-size:.83rem;color:var(--gray-600);background:var(--gray-50);padding:10px 14px;border-radius:var(--radius-sm)"><strong>Notes:</strong> ${k.notes}</div>`:''}
    ${k.repossessed_from?`<div style="margin-top:8px;font-size:.82rem;background:#fee2e2;padding:9px 13px;border-radius:var(--radius-sm);color:#991b1b"><strong>⚠️ Repossessed from:</strong> ${k.repossessed_from}</div>`:''}
    <div class="section-divider" style="margin:16px 0 10px"><span>📋 Complaints (${complaints.length})</span></div>
    ${complaints.length?'<div style="display:flex;flex-direction:column;gap:7px">'+complaints.slice(0,3).map(c=>`<div class="complaint-item ${c.category}"><div class="comp-header"><span class="comp-cat">${catLabel[c.category]||c.category}</span><span class="comp-date">${new Date(c.date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</span></div><div class="comp-text">${c.text}</div></div>`).join('')+(complaints.length>3?`<button class="btn btn-outline btn-sm" onclick="closeDetailModal();openComplaintModal('${k.id}')">View all ${complaints.length} complaints</button>`:'')+'</div>':'<div style="font-size:.83rem;color:var(--gray-500);padding:8px 0">No complaints recorded.</div>'}
    <div class="section-divider" style="margin:16px 0 10px"><span>Payment History (${payments.length})</span></div>
    ${!payments.length?'<div class="empty-state" style="padding:16px 0"><p>No payments yet</p></div>':'<div class="payment-log">'+payments.map(py=>{const hasOver=py.overpay_amount>0;return`<div class="payment-item"><div><div class="pi-amount${py.is_short?' pay-short':hasOver?' pay-over':''}">${hasOver?`${fmt(py.expected_amount)}<span class="pay-over-tag">+${fmt(py.overpay_amount)}</span>`:fmt(py.amount)}${py.is_short?' ⚠️':''}</div><div class="pi-note">${py.note||'Payment recorded'}</div></div><div class="pi-date">${new Date(py.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</div></div>`;}).join('')+'</div>'}
    <div class="section-divider" style="margin:16px 0 10px"><span>📁 Keke Documents (${docs.length})</span><button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="openDocumentsModal('${k.id}')">➕ Add Document</button></div>
    <div id="dmDocList">${renderDocList(docs, k.id)}</div>`;
  document.getElementById('detailModal').classList.add('active');
}
function closeDetailModal(){document.getElementById('detailModal').classList.remove('active');currentDetailKekeId=null;}

function renderDocList(docs, kekeId) {
  if(!docs.length) return '<div style="font-size:.83rem;color:var(--gray-500);padding:8px 0">No documents uploaded yet. Click ➕ Add Document above to upload keke papers, permits, IDs etc.</div>';
  const typeIcon = t => /jpg|jpeg|png|gif|webp/.test(t||'')?'🖼️':t==='pdf'||t?.includes('pdf')?'📄':t?.includes('doc')?'📝':'📎';
  return '<div class="doc-list">'+docs.map(d=>`<div class="doc-item"><div class="doc-icon">${typeIcon(d.type||d.name)}</div><div class="doc-info"><div class="doc-name">${d.name||'Document'}</div><div class="doc-meta">${d.type||''} · Uploaded ${new Date(d.uploaded_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})} by ${d.uploaded_by||'?'}</div></div><div class="doc-actions"><a href="${d.dataUrl||d.data_url}" download="${d.name||'document'}" class="btn btn-primary btn-sm" style="text-decoration:none">⬇️</a>${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="deleteDocAndRefresh('${d.id}','${kekeId}')">✕</button>`:''}</div></div>`).join('')+'</div>';
}
function deleteDocAndRefresh(docId, kekeId) {
  if(!isAdmin()){toast('Admin access required.','error');return;}
  if(!confirm('Delete this document permanently?'))return;
  CACHE.documents=(CACHE.documents||[]).filter(d=>d.id!==docId);
  _sbDeleteDocument(docId);
  toast('Document deleted.','error');
  const el=document.getElementById('dmDocList');
  if(el){const docs=LOCAL.getDocuments().filter(d=>d.keke_id===kekeId);el.innerHTML=renderDocList(docs,kekeId);}
  // Also refresh documentsModal list if open
  if(document.getElementById('documentsModal').classList.contains('active')) renderDocumentsList();
}

// ═══════════════════════════════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════
function logActivity(action,type,detail){const entry={id:uid(),action,type,detail,timestamp:new Date().toISOString()};CACHE.activityLog=CACHE.activityLog||[];CACHE.activityLog.unshift(entry);if(CACHE.activityLog.length>500)CACHE.activityLog.length=500;_sbLogActivity(entry);}
function renderActivityLog(){
  const q=(document.getElementById('logSearch').value||'').toLowerCase(),typeFilter=document.getElementById('logFilter').value;
  let logs=LOCAL.getActivityLog();
  if(q)logs=logs.filter(l=>l.detail.toLowerCase().includes(q)||l.action.toLowerCase().includes(q));
  if(typeFilter)logs=logs.filter(l=>l.type===typeFilter);
  document.getElementById('logCount').textContent=logs.length+' entries';
  const container=document.getElementById('activityLogList');
  if(!logs.length){container.innerHTML='<div class="empty-state"><p>No activity recorded yet.</p></div>';return;}
  const typeIcon={payment:'💳',register:'🛺',edit:'✏️',delete:'🗑️',complaint:'📋'};
  const borderColor={payment:'var(--green)',register:'#3b82f6',edit:'#f59e0b',delete:'var(--red)',complaint:'#7c3aed'};
  container.innerHTML='<div style="display:flex;flex-direction:column;gap:7px">'+logs.map(l=>{const d=new Date(l.timestamp),timeStr=d.toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})+' '+d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'});return`<div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:var(--gray-50);border-radius:var(--radius-sm);border-left:3px solid ${borderColor[l.type]||'var(--gray-300)'}"><div style="font-size:1.1rem;flex-shrink:0">${typeIcon[l.type]||'📋'}</div><div style="flex:1;min-width:0"><div style="font-size:.86rem;font-weight:600;color:var(--gray-800)">${l.action}</div><div style="font-size:.76rem;color:var(--gray-500);margin-top:1px">${l.detail}</div></div><span style="font-size:.72rem;color:var(--gray-400);flex-shrink:0">${timeStr}</span></div>`;}).join('')+'</div>';
}

// ═══════════════════════════════════════════════════════════════
//  PDF EXPORTS
// ═══════════════════════════════════════════════════════════════
function pdfStyles(){return `<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#212529;background:#fff;padding:32px;font-size:13px}h1{font-size:1.2rem;font-weight:800;color:#D0021B}.co{font-size:.8rem;color:#6c757d;margin-bottom:2px}.hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #D0021B}.hdr-r{text-align:right;font-size:.78rem;color:#6c757d}.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}.stat{background:#f8f9fa;border-radius:8px;padding:12px;text-align:center}.stat .lbl{font-size:.65rem;font-weight:700;color:#adb5bd;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}.stat .val{font-size:1rem;font-weight:800}.val.g{color:#1a7a3c}.val.r{color:#D0021B}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;background:#f8f9fa;padding:12px;border-radius:8px;font-size:.82rem;line-height:1.9}table{width:100%;border-collapse:collapse;font-size:.82rem}thead th{background:#212529;color:#fff;padding:8px 11px;text-align:left;font-size:.7rem;text-transform:uppercase;letter-spacing:.5px}tbody td{padding:8px 11px;border-bottom:1px solid #e9ecef}tbody tr:nth-child(even){background:#f8f9fa}.am{color:#1a7a3c;font-weight:700}.am-short{color:#c2410c;font-weight:700}.bal{color:#D0021B}.clr{color:#1a7a3c;font-weight:700}.ftr{margin-top:24px;padding-top:12px;border-top:1px solid #e9ecef;font-size:.72rem;color:#adb5bd;display:flex;justify-content:space-between}.filter-note{background:#fff3cd;border:1px solid #ffc107;border-radius:6px;padding:8px 12px;margin-bottom:14px;font-size:.78rem}h3{font-size:.9rem;margin:16px 0 8px}@media print{body{padding:16px}}</style>`;}
function openPDF(html,title){const w=window.open('','_blank','width=920,height=700');w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>${pdfStyles()}</head><body onload="setTimeout(()=>window.print(),350)">${html}</body></html>`);w.document.close();}

async function downloadAllPaymentsPDF(){
  const from=document.getElementById('pdfFrom').value,to=document.getElementById('pdfTo').value;
  let payments=await dbGetPayments();
  if(from)payments=payments.filter(p=>p.payment_date>=from);
  if(to)payments=payments.filter(p=>p.payment_date<=to);
  if(!payments.length){toast('No payments in selected range.','error');return;}
  const totalAmt=payments.reduce((s,p)=>s+Number(p.amount),0),drivers=new Set(payments.map(p=>p.driver_name)).size;
  const dateStr=new Date().toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});
  const rangeNote=(from||to)?`${from||'start'} → ${to||'today'}`:'All Time';
  const rows=payments.map(p=>`<tr><td>${new Date(p.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</td><td><strong>${p.driver_name}</strong></td><td>${p.plate}</td><td>${p.batch?'Batch '+p.batch:''}</td><td class="${p.is_short?'am-short':'am'}">${fmt(p.amount)}${p.is_short?' ⚠️':''}</td><td class="${p.balance_after<=0?'clr':'bal'}">${p.balance_after<=0?'CLEARED ✓':fmt(p.balance_after)}</td><td>${p.note||'—'}</td></tr>`).join('');
  const html=`<div class="hdr"><div><div class="co">Maymoon Mainstream Ltd</div><h1>Payment Records</h1><div style="font-size:.8rem;color:#6c757d;margin-top:3px">Generated: ${dateStr}</div></div><div class="hdr-r">${payments.length} records<br><strong style="color:#1a7a3c;font-size:1rem">${fmt(totalAmt)}</strong></div></div>${(from||to)?`<div class="filter-note">📅 Period: <strong>${rangeNote}</strong></div>`:''}<div class="stats"><div class="stat"><div class="lbl">Records</div><div class="val">${payments.length}</div></div><div class="stat"><div class="lbl">Total Collected</div><div class="val g">${fmt(totalAmt)}</div></div><div class="stat"><div class="lbl">Drivers</div><div class="val">${drivers}</div></div></div><table><thead><tr><th>Date</th><th>Driver</th><th>Plate</th><th>Batch</th><th>Amount</th><th>Balance After</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><div class="ftr"><span>Maymoon Mainstream Ltd</span><span>${dateStr}</span></div>`;
  openPDF(html,'Payment Records — Maymoon Mainstream Ltd');
}

async function downloadDriverPDF(){
  if(!currentDetailKekeId){toast('No driver selected.','error');return;}
  const kekes=await dbGetKekes();const k=kekes.find(x=>x.id===currentDetailKekeId);if(!k)return;
  const from=document.getElementById('dm_pdf_from').value,to=document.getElementById('dm_pdf_to').value;
  let payments=await dbGetPayments(currentDetailKekeId);
  if(from)payments=payments.filter(p=>p.payment_date>=from);
  if(to)payments=payments.filter(p=>p.payment_date<=to);
  const periodTotal=payments.reduce((s,p)=>s+Number(p.amount),0),bal=k.total_loan-k.paid;
  const dateStr=new Date().toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});
  const rangeNote=(from||to)?`${from||'start'} → ${to||'today'}`:'All Time';
  const rows=payments.length?payments.map(p=>`<tr><td>${new Date(p.payment_date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</td><td class="${p.is_short?'am-short':'am'}">${fmt(p.amount)}${p.is_short?' ⚠️':''}</td><td class="${p.balance_after<=0?'clr':'bal'}">${p.balance_after<=0?'CLEARED ✓':fmt(p.balance_after)}</td><td>${p.note||'—'}</td></tr>`).join(''):'<tr><td colspan="4" style="text-align:center;padding:20px;color:#adb5bd">No payments in selected date range</td></tr>';
  const html=`<div class="hdr"><div><div class="co">Maymoon Mainstream Ltd</div><h1>Driver Payment Statement</h1><div style="font-size:.8rem;color:#6c757d;margin-top:3px">Period: ${rangeNote} · Generated: ${dateStr}</div></div><div class="hdr-r">Plate: <strong>${k.plate}</strong>${k.pt_number?'<br>PT: '+k.pt_number:''}<br>Batch ${k.batch||'—'}</div></div><div class="info-grid"><div><strong>Driver:</strong> ${k.driver_name}</div><div><strong>Phone:</strong> ${k.driver_phone}${k.driver_alt_phone?' / '+k.driver_alt_phone:''}</div><div><strong>Shorty:</strong> ${k.shorty_name||'—'}</div><div><strong>Shorty Phone:</strong> ${k.shorty_phone||'—'}</div><div><strong>Address:</strong> ${k.driver_address||'—'}</div><div><strong>Schedule:</strong> ${schedLabel(k.schedule)} — ${fmt(k.installment_amount)}</div></div><div class="stats"><div class="stat"><div class="lbl">Total Loan</div><div class="val">${fmt(k.total_loan)}</div></div><div class="stat"><div class="lbl">Paid (all time)</div><div class="val g">${fmt(k.paid)}</div></div><div class="stat"><div class="lbl">Balance</div><div class="val ${bal<=0?'g':'r'}">${bal<=0?'CLEARED':fmt(bal)}</div></div></div>${(from||to)?`<div class="filter-note">📅 ${rangeNote} — ${payments.length} record(s), ${fmt(periodTotal)}</div>`:''}<table><thead><tr><th>Date</th><th>Amount</th><th>Balance After</th><th>Note</th></tr></thead><tbody>${rows}</tbody></table><div class="ftr"><span>Maymoon Mainstream Ltd</span><span>${dateStr}</span></div>`;
  openPDF(html,`Statement — ${k.driver_name} (${k.plate})`);
}

// ═══════════════════════════════════════════════════════════════
//  BATCH PAYMENT SCHEDULE & ALERTS
// ═══════════════════════════════════════════════════════════════
function getBatchPaymentDates(batch, numDates) {
  const schedules = LOCAL.getBatchSchedules();
  const bs = schedules[batch];
  if(!bs || !bs.startDate) return [];
  const start = new Date(bs.startDate);
  if(isNaN(start.getTime())) return [];
  const intervalDays = bs.intervalDays || 3; // default 3, configurable
  const dates = [];
  let current = new Date(start);
  for(let i=0; i<numDates; i++){
    dates.push(current.toISOString().slice(0,10));
    current.setDate(current.getDate()+intervalDays);
  }
  return dates;
}

function isBatchPaymentDay(batch) {
  const today = new Date().toISOString().slice(0,10);
  const dates = getBatchPaymentDates(batch, 500);
  return dates.includes(today);
}

function renderBatchPaymentAlerts() {
  const today = new Date().toISOString().slice(0,10);
  const now = new Date();
  const isPast4pm = now.getHours()>=16;
  const kekes = LOCAL.getKekes();
  const payments = LOCAL.getPayments();
  const batches = ['A','B','C'];
  let html = '';
  let totalAlert = 0;

  batches.forEach(batch=>{
    if(!isBatchPaymentDay(batch)) return;
    const batchKekes = kekes.filter(k=>k.batch===batch&&k.status==='active'&&!isOnBreak(batch));
    if(!batchKekes.length) return;
    const unpaid = batchKekes.filter(k=>{
      const todayPays = payments.filter(p=>p.keke_id===k.id&&p.payment_date===today);
      return !todayPays.length;
    });
    const paid = batchKekes.filter(k=>{
      const todayPays = payments.filter(p=>p.keke_id===k.id&&p.payment_date===today);
      return todayPays.length>0;
    });
    totalAlert += unpaid.length;
    html+=`<div class="batch-pay-alert-card">
      <div class="bpa-header">
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">${batchBadge(batch)}<strong style="font-size:.92rem">💰 Payment Day Today!</strong></div>
          <div style="font-size:.78rem;color:var(--gray-600)">${batchKekes.length} driver(s) due &bull; ${paid.length} paid &bull; ${unpaid.length} still pending${isPast4pm?' &bull; <strong style="color:var(--red)">⏰ Past 4:00 PM</strong>':''}</div>
        </div>
        <span class="badge ${unpaid.length?'badge-red':'badge-green'}">${unpaid.length?unpaid.length+' unpaid':'All paid ✓'}</span>
      </div>
      ${unpaid.length?`<div style="margin-top:10px">
        <div style="font-size:.74rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">
          ⏳ Still Due Today${isPast4pm?' <span style="color:var(--red)">(highlighted = missed 4PM cutoff)</span>':''}:
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${unpaid.map(k=>`<div class="bpa-driver${isPast4pm?' bpa-overdue':''}">
            <div style="display:flex;align-items:center;gap:8px;flex:1">
              ${k.driver_photo_url?`<img src="${k.driver_photo_url}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0">`:'<div style="width:28px;height:28px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;font-size:.8rem;flex-shrink:0">👤</div>'}
              <div><div style="font-weight:700;font-size:.86rem">${k.driver_name}</div><div style="font-size:.74rem;color:${isPast4pm?'var(--red)':'var(--gray-500)'}">${k.plate} &bull; 📞 ${k.driver_phone}</div></div>
            </div>
            <button class="btn btn-primary btn-sm" style="flex-shrink:0" onclick="openPaymentModal('${k.id}')">💳 Pay</button>
          </div>`).join('')}
        </div>
      </div>`:''}
      ${paid.length?`<div style="margin-top:10px"><div style="font-size:.74rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:7px">✅ Paid Today (${paid.length}):</div>
        <div style="display:flex;flex-direction:column;gap:5px">
          ${paid.map(k=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--green-bg);border-radius:var(--radius-sm);font-size:.83rem"><span style="color:var(--green)">✓</span> ${k.driver_name} &bull; ${k.plate}</div>`).join('')}
        </div>
      </div>`:''}
    </div>`;
  });

  // Show next payment dates for batches NOT paying today
  const schedules = LOCAL.getBatchSchedules();
  let nextHtml = '';
  batches.forEach(batch=>{
    if(isBatchPaymentDay(batch))return;
    const bs=schedules[batch]; if(!bs||!bs.startDate)return;
    const upcoming=getBatchPaymentDates(batch,200).find(d=>d>today);
    if(upcoming){
      const daysUntil=Math.ceil((new Date(upcoming)-Date.now())/86400000);
      nextHtml+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:var(--gray-50);border-radius:var(--radius-sm);margin-bottom:6px;font-size:.83rem">
        ${batchBadge(batch)}<span>Next payment day: <strong>${new Date(upcoming).toLocaleDateString('en-NG',{weekday:'short',day:'numeric',month:'short'})}</strong></span>
        <span class="badge badge-gray">${daysUntil===1?'Tomorrow':daysUntil+' days'}</span>
      </div>`;
    }
  });
  if(nextHtml){
    html+=`<div style="margin-bottom:16px"><div style="font-size:.74rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">📅 Upcoming Payment Days</div>${nextHtml}</div>`;
  }

  return html;
}

// ═══════════════════════════════════════════════════════════════
//  SERVICE & MAINTENANCE
// ═══════════════════════════════════════════════════════════════
const SERVICE_WEEKS = 3; // expected every 3 weeks

function isServiceOverdue(kekeId) {
  const records = LOCAL.getServiceRecords().filter(r=>r.keke_id===kekeId);
  if(!records.length) return true; // never serviced = overdue
  const latest = records.reduce((a,b)=>new Date(a.date)>new Date(b.date)?a:b);
  const daysSince = Math.floor((Date.now()-new Date(latest.date).getTime())/86400000);
  return daysSince >= SERVICE_WEEKS*7;
}

function getServiceStatus(kekeId) {
  const records = LOCAL.getServiceRecords().filter(r=>r.keke_id===kekeId);
  if(!records.length) return {overdue:true, daysSince:null, lastDate:null, lastCondition:null};
  const latest = records.reduce((a,b)=>new Date(a.date)>new Date(b.date)?a:b);
  const daysSince = Math.floor((Date.now()-new Date(latest.date).getTime())/86400000);
  return {overdue: daysSince >= SERVICE_WEEKS*7, daysSince, lastDate:latest.date, lastCondition:latest.condition};
}

async function renderMaintenance() {
  const q = (document.getElementById('maintSearch').value||'').toLowerCase();
  const f = document.getElementById('maintFilter').value;
  const kekes = (await dbGetKekes()).filter(k=>k.status==='active'||k.status==='on_repair');
  const container = document.getElementById('maintenanceContainer');
  let filtered = kekes.filter(k=>(k.driver_name||'').toLowerCase().includes(q)||(k.plate||'').toLowerCase().includes(q));
  if(f==='overdue') filtered = filtered.filter(k=>isServiceOverdue(k.id));
  if(f==='ok') filtered = filtered.filter(k=>!isServiceOverdue(k.id));

  // Update badge
  const overdueCount = kekes.filter(k=>isServiceOverdue(k.id)).length;
  const badge = document.getElementById('maintenanceBadge');
  if(badge){ badge.textContent=overdueCount; badge.style.display=overdueCount?'':'none'; }

  if(!filtered.length){container.innerHTML='<div class="empty-state"><p>No kekes found</p></div>';return;}
  const condLabel={good:'✅ Good',fair:'⚠️ Fair',poor:'🔴 Poor'};
  container.innerHTML='<div class="maint-grid">'+filtered.map(k=>{
    const svc=getServiceStatus(k.id);
    const overdue=svc.overdue;
    const records=LOCAL.getServiceRecords().filter(r=>r.keke_id===k.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    return `<div class="maint-card ${overdue?'maint-overdue':''}">
      <div class="maint-header">
        <div><div class="maint-plate">🛺 ${k.plate}</div><div class="maint-driver">${k.driver_name} ${batchBadge(k.batch)}</div></div>
        ${overdue?'<span class="badge badge-red">🔧 Service Overdue</span>':'<span class="badge badge-green">✅ Up to Date</span>'}
      </div>
      <div class="maint-status-row">
        ${svc.lastDate?`<span>Last service: <strong>${new Date(svc.lastDate).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</strong></span><span>${svc.daysSince} days ago</span>`:
        `<span style="color:var(--red)">⚠️ Never serviced</span>`}
      </div>
      ${svc.lastCondition?`<div style="margin-top:6px;font-size:.8rem">Last condition: <strong>${condLabel[svc.lastCondition]||svc.lastCondition}</strong></div>`:''}
      ${records.slice(0,2).map(r=>`<div class="maint-record"><span class="maint-rec-date">${new Date(r.date).toLocaleDateString('en-NG',{day:'numeric',month:'short'})}</span><span>${condLabel[r.condition]||r.condition}</span><span>${r.serviced==='yes'?'✅ Serviced':'❌ Not serviced'}</span>${r.notes?`<span style="color:var(--gray-500);font-size:.77rem;grid-column:1/-1">${r.notes}</span>`:''}</div>`).join('')}
      <div class="maint-footer">
        <button class="btn btn-primary btn-sm" onclick="openServiceModal('${k.id}')">🔧 Log Service</button>
        <button class="btn btn-outline btn-sm" onclick="openServiceModalAndDownload('${k.id}')">⬇️ History PDF</button>
        ${records.length>2?`<button class="btn btn-outline btn-sm" onclick="openServiceModal('${k.id}')">View All (${records.length})</button>`:''}
      </div>
    </div>`;
  }).join('')+'</div>';
}

let currentServiceKekeId = null;
function openServiceModal(kekeId) {
  currentServiceKekeId = kekeId;
  const k = LOCAL.getKekes().find(x=>x.id===kekeId); if(!k) return;
  document.getElementById('serviceModalTitle').textContent = `🔧 Service Log — ${k.driver_name} (${k.plate})`;
  document.getElementById('serviceKekeInfo').innerHTML = `<svg viewBox="0 0 24 24"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg><p>Plate: <strong>${k.plate}</strong> · Driver: <strong>${k.driver_name}</strong> · ${batchBadge(k.batch)} · Service expected every <strong>3 weeks</strong>.</p>`;
  document.getElementById('svc_date').valueAsDate = new Date();
  document.getElementById('svc_condition').value = 'good';
  document.getElementById('svc_done').value = 'yes';
  document.getElementById('svc_mechanic').value = '';
  document.getElementById('svc_notes').value = '';
  renderServiceHistory();
  document.getElementById('serviceModal').classList.add('active');
}
function closeServiceModal() { document.getElementById('serviceModal').classList.remove('active'); currentServiceKekeId = null; }

function openServiceModalAndDownload(kekeId) {
  currentServiceKekeId = kekeId;
  downloadServiceHistoryPDF();
}

function renderServiceHistory() {
  const records = LOCAL.getServiceRecords().filter(r=>r.keke_id===currentServiceKekeId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const container = document.getElementById('serviceHistoryList');
  const condLabel={good:'✅ Good',fair:'⚠️ Fair',poor:'🔴 Poor'};
  if(!records.length){container.innerHTML='<div class="empty-state" style="padding:16px 0"><p>No service records yet.</p></div>';return;}
  container.innerHTML=`<div style="font-size:.76rem;font-weight:700;color:var(--gray-500);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">${records.length} Service Record(s)</div>`+
    records.map(r=>`<div class="maint-history-item">
      <div class="mhi-row"><strong>${new Date(r.date).toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'})}</strong><span class="${r.serviced==='yes'?'mhi-badge-green':'mhi-badge-red'}">${r.serviced==='yes'?'✅ Serviced':'❌ Not Serviced'}</span></div>
      <div class="mhi-row"><span>Condition: <strong>${condLabel[r.condition]||r.condition}</strong></span>${r.mechanic?`<span>👨‍🔧 ${r.mechanic}</span>`:''}</div>
      ${r.notes?`<div style="font-size:.8rem;color:var(--gray-600);margin-top:4px">📝 ${r.notes}</div>`:''}
      ${r.recorded_by?`<div style="font-size:.71rem;color:var(--gray-400);margin-top:3px">By: ${r.recorded_by}</div>`:''}
      ${isAdmin()?`<button class="comp-del" onclick="deleteServiceRecord('${r.id}')" style="margin-top:4px">✕ Delete</button>`:''}
    </div>`).join('');
}

function saveServiceRecord() {
  const date = document.getElementById('svc_date').value;
  const condition = document.getElementById('svc_condition').value;
  const serviced = document.getElementById('svc_done').value;
  const mechanic = document.getElementById('svc_mechanic').value.trim();
  const notes = document.getElementById('svc_notes').value.trim();
  if(!date){toast('Service date required.','error');return;}
  const svcEntry={id:uid(),keke_id:currentServiceKekeId,date,condition,serviced,mechanic,notes,recorded_by:currentUser?.name||'?',created_at:new Date().toISOString()};
  _sbSaveServiceRecord(svcEntry);
  const k = LOCAL.getKekes().find(x=>x.id===currentServiceKekeId);
  logActivity(`Service logged: ${k?.plate||''}`, 'edit', `Driver: ${k?.driver_name||''} | Condition: ${condition} | Serviced: ${serviced} | By: ${currentUser?.name||'?'}`);
  document.getElementById('svc_date').valueAsDate = new Date();
  document.getElementById('svc_notes').value = '';
  document.getElementById('svc_mechanic').value = '';
  renderServiceHistory();
  renderMaintenance();
  toast('Service record saved!');
}

function deleteServiceRecord(recId) {
  if(!isAdmin()){toast('Admin access required.','error');return;}
  if(!confirm('Delete this service record?'))return;
  CACHE.serviceRecords=(CACHE.serviceRecords||[]).filter(r=>r.id!==recId);
  _sbDeleteServiceRecord(recId);
  renderServiceHistory();
  renderMaintenance();
  toast('Record deleted.','error');
}

// Download service history PDF for a specific keke
function downloadServiceHistoryPDF() {
  if(!currentServiceKekeId){toast('No keke selected.','error');return;}
  const k = LOCAL.getKekes().find(x=>x.id===currentServiceKekeId); if(!k) return;
  const records = LOCAL.getServiceRecords().filter(r=>r.keke_id===currentServiceKekeId).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const dateStr = new Date().toLocaleDateString('en-NG',{day:'numeric',month:'long',year:'numeric'});
  const condLabel={good:'✅ Good',fair:'⚠️ Fair',poor:'🔴 Poor'};
  const rows = records.length
    ? records.map(r=>`<tr><td>${new Date(r.date).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}</td><td class="${r.serviced==='yes'?'am':'am-short'}">${r.serviced==='yes'?'✅ Serviced':'❌ Not Serviced'}</td><td>${condLabel[r.condition]||r.condition}</td><td>${r.mechanic||'—'}</td><td>${r.notes||'—'}</td><td style="font-size:.75em;color:#adb5bd">${r.recorded_by||'?'}</td></tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;padding:20px;color:#adb5bd">No service records yet</td></tr>';
  const html = `<div class="hdr"><div><div class="co">Maymoon Mainstream Ltd</div><h1>Service &amp; Maintenance History</h1><div style="font-size:.8rem;color:#6c757d;margin-top:3px">Vehicle: ${k.plate} &nbsp;·&nbsp; Driver: ${k.driver_name} &nbsp;·&nbsp; Batch ${k.batch||'—'}</div></div><div class="hdr-r">${records.length} record(s)<br><span style="font-size:.75rem;color:#6c757d">Every 3 weeks</span></div></div><div class="stats"><div class="stat"><div class="lbl">Total Records</div><div class="val">${records.length}</div></div><div class="stat"><div class="lbl">Serviced</div><div class="val g">${records.filter(r=>r.serviced==='yes').length}</div></div><div class="stat"><div class="lbl">Not Serviced</div><div class="val r">${records.filter(r=>r.serviced==='no').length}</div></div></div><table><thead><tr><th>Date</th><th>Status</th><th>Condition</th><th>Mechanic</th><th>Notes</th><th>Recorded By</th></tr></thead><tbody>${rows}</tbody></table><div class="ftr"><span>Maymoon Mainstream Ltd · Service Records for ${k.plate}</span><span>${dateStr}</span></div>`;
  openPDF(html, `Service History — ${k.plate} (${k.driver_name})`);
}

// ═══════════════════════════════════════════════════════════════
//  DOCUMENTS
// ═══════════════════════════════════════════════════════════════
let currentDocsKekeId = null;

function openDocumentsModal(kekeId) {
  if(!kekeId){toast('Select a driver first.','error');return;}
  currentDocsKekeId = kekeId;
  const k = LOCAL.getKekes().find(x=>x.id===kekeId); if(!k) return;
  document.getElementById('documentsModalTitle').textContent = `📁 Documents — ${k.driver_name} (${k.plate})`;
  renderDocumentsList();
  document.getElementById('documentsModal').classList.add('active');
}
function closeDocumentsModal() { document.getElementById('documentsModal').classList.remove('active'); currentDocsKekeId=null; }

function renderDocumentsList() {
  const docs = LOCAL.getDocuments().filter(d=>d.keke_id===currentDocsKekeId);
  const container = document.getElementById('documentsList');
  if(!docs.length){container.innerHTML='<div class="empty-state" style="padding:20px 0"><p>No documents uploaded yet.</p></div>';return;}
  container.innerHTML='<div class="doc-list">'+docs.map(d=>{
    const isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(d.name) || d.dataUrl?.startsWith('data:image');
    const icon = isImg ? '🖼️' : (d.name?.endsWith('.pdf') ? '📄' : '📎');
    return `<div class="doc-item">
      <div class="doc-icon">${icon}</div>
      <div class="doc-info">
        <div class="doc-name">${d.name||'Document'}</div>
        <div class="doc-meta">${d.type||''} &bull; Uploaded: ${new Date(d.uploaded_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})} &bull; By: ${d.uploaded_by||'?'}</div>
      </div>
      <div class="doc-actions">
        ${d.dataUrl?`<a href="${d.dataUrl}" download="${d.name||'document'}" class="btn btn-outline btn-sm" style="text-decoration:none">⬇️ Download</a>`:''}
        ${isAdmin()?`<button class="btn btn-danger btn-sm" onclick="deleteDocument('${d.id}')">🗑️</button>`:''}
      </div>
    </div>`;
  }).join('')+'</div>';
}

async function handleDocUpload(input) {
  if(!input.files.length)return;
  const files = Array.from(input.files);
  let count=0;
  for(const file of files){
    const dataUrl = await new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(file);});
    const docId = uid();
    const docEntry = {id:docId,keke_id:currentDocsKekeId,name:file.name,type:file.type,size:file.size,dataUrl,uploaded_by:currentUser?.name||'?',uploaded_at:new Date().toISOString()};
    _sbSaveDocument(docEntry);
    count++;
  }
  const k=LOCAL.getKekes().find(x=>x.id===currentDocsKekeId);
  logActivity(`Document uploaded: ${k?.plate||''}`,'edit',`${count} file(s) | Driver: ${k?.driver_name||''} | By: ${currentUser?.name||'?'}`);
  toast(`${count} document(s) uploaded!`);
  renderDocumentsList();
  // Refresh detail modal doc list if open for same keke
  if(currentDetailKekeId===currentDocsKekeId){
    const el=document.getElementById('dmDocList');
    if(el){const docs=LOCAL.getDocuments().filter(d=>d.keke_id===currentDocsKekeId);el.innerHTML=renderDocList(docs,currentDocsKekeId);}
  }
  input.value='';
}

function deleteDocument(docId) {
  if(!isAdmin()){toast('Admin access required.','error');return;}
  if(!confirm('Delete this document?'))return;
  const doc = LOCAL.getDocuments().find(d=>d.id===docId);
  const kekeId = doc?.keke_id;
  CACHE.documents=(CACHE.documents||[]).filter(d=>d.id!==docId);
  _sbDeleteDocument(docId);
  toast('Document deleted.','error');
  renderDocumentsList();
  // Also refresh detail modal doc list if open
  if(kekeId){const el=document.getElementById('dmDocList');if(el){const docs=LOCAL.getDocuments().filter(d=>d.keke_id===kekeId);el.innerHTML=renderDocList(docs,kekeId);}}
}

// ═══════════════════════════════════════════════════════════════
//  PHOTO UPDATE MODAL (upload OR camera)
// ═══════════════════════════════════════════════════════════════
let photoUpdateKekeId = null, photoUpdateType = null, cameraStream = null, snappedDataUrl = null;

function openPhotoUpdateModal(kekeId, type) {
  if(!kekeId){toast('Select a driver first.','error');return;}
  photoUpdateKekeId = kekeId; photoUpdateType = type;
  const k = LOCAL.getKekes().find(x=>x.id===kekeId); if(!k) return;
  const labels={driver:'Driver',shorty:'Shorty (Referrer)',guarantor:'Guarantor'};
  document.getElementById('photoUpdateTitle').textContent=`📷 Update ${labels[type]||type} Photo`;
  document.getElementById('photoUpdateInfo').textContent=`Updating photo for ${labels[type]||type}: ${type==='driver'?k.driver_name:type==='shorty'?k.shorty_name||'—':k.guarantor_name||'—'} (${k.plate})`;
  // Reset state
  document.getElementById('photoUpdateInput').value='';
  const prev=document.getElementById('photoUpdatePreview');
  prev.src=''; prev.classList.remove('visible');
  document.getElementById('photoUpdateBox').style.display='';
  document.getElementById('photoUpdateCaption').textContent='';
  snappedDataUrl=null;
  switchPhotoTab('upload');
  document.getElementById('photoUpdateModal').classList.add('active');
}

function closePhotoUpdateModal() {
  stopCamera();
  document.getElementById('photoUpdateModal').classList.remove('active');
  photoUpdateKekeId=null; photoUpdateType=null; snappedDataUrl=null;
}

function switchPhotoTab(tab) {
  document.getElementById('tabUpload').classList.toggle('active',tab==='upload');
  document.getElementById('tabCamera').classList.toggle('active',tab==='camera');
  document.getElementById('photoTabUpload').style.display=tab==='upload'?'':'none';
  document.getElementById('photoTabCamera').style.display=tab==='camera'?'':'none';
  if(tab!=='camera') stopCamera();
}

function previewUpdatePhoto(input) {
  const file=input.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=document.getElementById('photoUpdatePreview');
    img.src=e.target.result; img.classList.add('visible');
    document.getElementById('photoUpdateBox').style.display='none';
    document.getElementById('photoUpdateCaption').textContent=`Selected: ${file.name}`;
    snappedDataUrl=null;
  };
  reader.readAsDataURL(file);
}

async function startCamera() {
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
    const video=document.getElementById('cameraVideo');
    video.srcObject=cameraStream; video.style.display='';
    document.getElementById('cameraPlaceholder').style.display='none';
    document.getElementById('cameraCanvas').style.display='none';
    document.getElementById('startCamBtn').style.display='none';
    document.getElementById('snapBtn').style.display='';
    document.getElementById('retakeBtn').style.display='none';
  } catch(e) { toast('Camera not available: '+e.message,'error'); }
}

function snapPhoto() {
  const video=document.getElementById('cameraVideo');
  const canvas=document.getElementById('cameraCanvas');
  canvas.width=video.videoWidth; canvas.height=video.videoHeight;
  canvas.getContext('2d').drawImage(video,0,0);
  snappedDataUrl=canvas.toDataURL('image/jpeg',0.85);
  canvas.style.display=''; video.style.display='none';
  document.getElementById('snapBtn').style.display='none';
  document.getElementById('retakeBtn').style.display='';
  stopCamera();
  document.getElementById('photoUpdateCaption').textContent='Photo captured! Click Save to confirm.';
}

function retakePhoto() {
  snappedDataUrl=null;
  document.getElementById('cameraCanvas').style.display='none';
  document.getElementById('retakeBtn').style.display='none';
  document.getElementById('startCamBtn').style.display='';
  document.getElementById('photoUpdateCaption').textContent='';
}

function stopCamera() {
  if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null;}
  const video=document.getElementById('cameraVideo');
  if(video){video.srcObject=null;video.style.display='none';}
}

async function saveUpdatedPhoto() {
  if(!photoUpdateKekeId||!photoUpdateType){toast('Error: no keke selected.','error');return;}
  let dataUrl = snappedDataUrl;
  if(!dataUrl){
    const input=document.getElementById('photoUpdateInput');
    if(!input.files[0]){toast('Please select or snap a photo first.','error');return;}
    dataUrl=await new Promise(res=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.readAsDataURL(input.files[0]);});
  }
  const fieldMap={driver:'driver_photo_url',shorty:'shorty_photo_url',guarantor:'guarantor_photo_url'};
  const upd={};upd[fieldMap[photoUpdateType]]=dataUrl;
  await dbUpdateKeke(photoUpdateKekeId,upd);
  const k=LOCAL.getKekes().find(x=>x.id===photoUpdateKekeId);
  logActivity(`Photo updated: ${k?.plate||''}`,'edit',`Type: ${photoUpdateType} | By: ${currentUser?.name||'?'}`);
  toast(`${photoUpdateType.charAt(0).toUpperCase()+photoUpdateType.slice(1)} photo updated! ✅`);
  closePhotoUpdateModal();
  // Refresh detail modal if open
  if(currentDetailKekeId===photoUpdateKekeId) openDetail(photoUpdateKekeId);
}
window.addEventListener('beforeunload', (e) => {
  // Warn before closing/refreshing if the Register Keke form has unsaved typing.
  // The autosave already protects the data, but a heads-up avoids surprises.
  const addKekeVisible = document.getElementById('view-addKeke') && document.getElementById('view-addKeke').style.display !== 'none';
  if (addKekeVisible && getDraft('addKeke')) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Proactively refreshes the access token every 45 minutes (Supabase tokens
// typically last 1 hour) so it never gets the chance to expire while the
// user is actively working — the reactive retry-on-401 above is just a backstop.
let _proactiveRefreshTimer = null;
function startProactiveTokenRefresh() {
  if (_proactiveRefreshTimer) return;
  _proactiveRefreshTimer = setInterval(() => {
    if (_refreshToken) _refreshAuthToken();
  }, 45 * 60 * 1000);
}
function stopProactiveTokenRefresh() {
  if (_proactiveRefreshTimer) { clearInterval(_proactiveRefreshTimer); _proactiveRefreshTimer = null; }
}

window.addEventListener('load', async () => {
  setTopbarDate();

  // Restore session if previously logged in
  const savedUser    = localStorage.getItem('_currentUser');
  const savedToken   = localStorage.getItem('_authToken');
  const savedRefresh = localStorage.getItem('_refreshToken');

  if (savedUser && savedToken) {
    try {
      currentUser   = JSON.parse(savedUser);
      _authToken    = savedToken;
      _refreshToken = savedRefresh;

      document.getElementById('loginPage').style.display = 'none';
      document.getElementById('app').classList.add('active');
      applyRoleUI();
      await bootstrap();
      showView('dashboard');
      startProactiveTokenRefresh();
    } catch (e) {
      // Corrupt stored data — clear and show login
      localStorage.removeItem('_authToken');
      localStorage.removeItem('_refreshToken');
      localStorage.removeItem('_currentUser');
    }
  }
});
