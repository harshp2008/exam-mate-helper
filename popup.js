// popup.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.currentData = null;
window.IB.allEntries = [];
window.IB.sidebarQuestions = [];
window.IB.appSettings = {};
window.IB.credentialsValid = false; // tracks whether Firebase credentials passed validation
window.IB.previousView = ''; // Tracks the previously active view

function useFirebase() {
  return window.IB.credentialsValid && window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId;
}

// ── Mark done + favourites on page ────────────────────────────────────────────

async function markDoneOnPage() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('exam-mate.com')) return;
    var allNames = window.IB.allEntries.map(function (e) { return e.question_name; });
    var favNames = window.IB.allEntries.filter(function (e) { return e.is_favourite === true; }).map(function (e) { return e.question_name; });
    var today = new Date().toISOString().split('T')[0];
    var todoNames = window.IB.allEntries.filter(function (e) { return e.todo_date === today; }).map(function (e) { return e.question_name; });
    await chrome.tabs.sendMessage(tab.id, { action: 'markDone', questionNames: allNames, favouriteNames: favNames, todoNames: todoNames });
  } catch (e) { }
}

// ── Sync button state ─────────────────────────────────────────────────────────

function updateSyncBtnState() {
  var btn = document.getElementById('sync-btn');
  if (!btn) return;
  if (useFirebase()) {
    btn.disabled = false;
    btn.title = '';
  } else {
    btn.disabled = true;
    btn.title = window.IB.appSettings.mode === 'firebase' ? 'Firebase credentials invalid or not verified' : 'Switch to Firebase mode in Settings to sync';
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  window.IB.appSettings = await window.IB.loadSettings();

  // Validate credentials silently on load if Firebase mode
  if (window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId) {
    var check = await window.IB.validateFirebaseCredentials(window.IB.appSettings.firebaseProjectId, window.IB.appSettings.firebaseApiKey);
    window.IB.credentialsValid = check.ok;
    if (!check.ok) window.IB.appSettings._credError = check.error;
  } else {
    window.IB.credentialsValid = false;
  }

  // Nav
  window.IB.previousView = 'log'; // Initial view
  document.getElementById('btn-log-view').addEventListener('click', function () { switchView('log'); });
  document.getElementById('btn-today-view').addEventListener('click', function () { switchView('today'); });
  document.getElementById('btn-favourites-view').addEventListener('click', function () { switchView('favourites'); });
  document.getElementById('btn-db-view').addEventListener('click', function () { switchView('db'); });
  document.getElementById('btn-settings-view').addEventListener('click', function () { switchView('settings'); });

  // Log panel
  document.getElementById('log-btn').addEventListener('click', logCurrent);
  document.getElementById('log-all-btn').addEventListener('click', logAll);

  // DB panel
  document.getElementById('sync-btn').addEventListener('click', function () { syncFromFirestore(false); });
  document.getElementById('export-btn').addEventListener('click', exportJSON);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('db-filter').addEventListener('input', renderEntryList);
  document.getElementById('more-btn').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('more-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', function () { document.getElementById('more-dropdown').classList.remove('open'); });

  // Favourites panel
  document.getElementById('fav-filter').addEventListener('input', renderFavouritesPanel);

  // Settings
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('mode-local').addEventListener('click', function () { setMode('local'); });
  document.getElementById('mode-firebase').addEventListener('click', function () { setMode('firebase'); });

  // Load cache, update sync btn state, populate settings
  window.IB.allEntries = await window.IB.loadCache();
  updateSyncBtnState();
  populateSettingsUI();

  // Background sync
  syncFromFirestore(true);

  // Scrape current page
  var tab;
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (e) { showPageError('Could not access browser tabs.'); return; }

  if (!tab || !tab.url || !tab.url.includes('exam-mate.com')) {
    showPageError('Open an ExamMate question page first,\nthen click the extension.');
    return;
  }
  try {
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
    if (response && response.error) showPageError(response.error);
    else if (response) { window.IB.currentData = response; renderCurrentQuestion(response); }
    else showPageError('No data returned. Try refreshing ExamMate.');
  } catch (e) { showPageError('Could not read the page.\nRefresh ExamMate and try again.'); }
});

chrome.runtime.onMessage.addListener(function(request) {
  if (request.action === 'switchToToday') {
    switchView('today');
  }
});

// ── Settings panel ────────────────────────────────────────────────────────────

function populateSettingsUI() {
  var displayMode = window.IB.appSettings.mode || 'local';

  document.getElementById('mode-local').classList.toggle('active', displayMode === 'local');
  document.getElementById('mode-firebase').classList.toggle('active', displayMode === 'firebase');
  document.getElementById('firebase-section').style.display = displayMode === 'firebase' ? 'block' : 'none';
  document.getElementById('local-only-note').style.display = displayMode === 'local' ? 'block' : 'none';

  // Credential status badge
  var credEl = document.getElementById('cred-status');
  if (window.IB.appSettings.mode === 'firebase') {
    credEl.style.display = 'flex';
    if (window.IB.credentialsValid) {
      credEl.className = 'cred-status ok';
      credEl.textContent = '✓ Firebase connected';
    } else if (window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId) {
      credEl.className = 'cred-status fail';
      credEl.textContent = '✗ Credentials invalid — using local mode';
    } else {
      credEl.className = 'cred-status checking';
      credEl.textContent = 'Enter credentials below to connect Firebase';
    }
  } else {
    credEl.style.display = 'none';
  }

  document.getElementById('s-project-id').value = window.IB.appSettings.firebaseProjectId || '';
  document.getElementById('s-api-key').value = window.IB.appSettings.firebaseApiKey || '';
  document.getElementById('s-openrouter-key').value = window.IB.appSettings.openrouterKey || '';

  // Show saved error if credentials failed previously
  var errEl = document.getElementById('settings-error');
  var fallbackEl = document.getElementById('settings-fallback');
  if (window.IB.appSettings.mode === 'firebase' && !window.IB.credentialsValid && window.IB.appSettings._credError) {
    errEl.textContent = window.IB.appSettings._credError;
    errEl.style.display = 'block';
    fallbackEl.style.display = 'block';
  } else {
    errEl.style.display = 'none';
    fallbackEl.style.display = 'none';
  }
}

function setMode(mode) {
  window.IB.appSettings.mode = mode;
  document.getElementById('mode-local').classList.toggle('active', mode === 'local');
  document.getElementById('mode-firebase').classList.toggle('active', mode === 'firebase');
  document.getElementById('firebase-section').style.display = mode === 'firebase' ? 'block' : 'none';
  document.getElementById('local-only-note').style.display = mode === 'local' ? 'block' : 'none';
  // Clear cred status when switching modes
  var credEl = document.getElementById('cred-status');
  credEl.style.display = mode === 'firebase' ? 'flex' : 'none';
  if (mode === 'firebase') { credEl.className = 'cred-status checking'; credEl.textContent = 'Click "Save & verify" to test credentials'; }
  document.getElementById('settings-error').style.display = 'none';
  document.getElementById('settings-fallback').style.display = 'none';
}

async function saveSettings() {
  var pid = document.getElementById('s-project-id').value.trim();
  var akey = document.getElementById('s-api-key').value.trim();
  var orkey = document.getElementById('s-openrouter-key').value.trim();
  var mode = window.IB.appSettings.mode || 'local';

  var btn = document.getElementById('save-settings-btn');
  var errEl = document.getElementById('settings-error');
  var fallbackEl = document.getElementById('settings-fallback');
  var savedEl = document.getElementById('settings-saved');
  var credEl = document.getElementById('cred-status');

  errEl.style.display = 'none';
  fallbackEl.style.display = 'none';
  savedEl.style.display = 'none';
  btn.textContent = 'Verifying...';
  btn.disabled = true;

  window.IB.credentialsValid = false;

  if (mode === 'firebase') {
    credEl.style.display = 'flex';
    credEl.className = 'cred-status checking';
    credEl.textContent = 'Checking credentials...';

    var check = await window.IB.validateFirebaseCredentials(pid, akey);
    if (check.ok) {
      window.IB.credentialsValid = true;
      credEl.className = 'cred-status ok';
      credEl.textContent = '✓ Firebase connected';
    } else {
      window.IB.credentialsValid = false;
      credEl.className = 'cred-status fail';
      credEl.textContent = '✗ Connection failed';
      errEl.textContent = check.error;
      errEl.style.display = 'block';
      fallbackEl.style.display = 'block';
      // (Keep Firebase tab active — user can see the error and decide what to do)
    }
  } else {
    credEl.style.display = 'none';
  }

  // Always save whatever was entered, but record credError
  var newSettings = {
    initialized: true, mode: mode,
    firebaseProjectId: pid, firebaseApiKey: akey, openrouterKey: orkey,
    _credError: (mode === 'firebase' && !window.IB.credentialsValid) ? (errEl.textContent || 'Unknown error') : '',
  };
  await chrome.storage.local.set({ [window.IB.SETTINGS_KEY]: newSettings });
  window.IB.appSettings = newSettings;
  updateSyncBtnState();

  btn.textContent = 'Save & verify';
  btn.disabled = false;

  if (window.IB.credentialsValid || mode === 'local') {
    savedEl.style.display = 'block';
    setTimeout(function () { savedEl.style.display = 'none'; }, 2500);
    if (useFirebase()) syncFromFirestore(false);
  }
}

// ── Sync ──────────────────────────────────────────────────────────────────────

async function syncFromFirestore(silent) {
  var syncBtn = document.getElementById('sync-btn');
  if (!useFirebase()) {
    if (!silent) showMsg('success', 'Local mode — data is already up to date.');
    return;
  }
  if (syncBtn) { syncBtn.textContent = 'Syncing...'; syncBtn.disabled = true; }
  try {
    var remote = await window.IB.fsReadAll();
    window.IB.allEntries = window.IB.mergeEntries(remote, window.IB.allEntries);
    await window.IB.saveCache(window.IB.allEntries);
    if (!silent) showMsg('success', 'Synced ' + remote.length + ' questions from Firestore.');
    if (document.getElementById('panel-db').classList.contains('active')) renderDBPanel();
    if (document.getElementById('panel-favourites').classList.contains('active')) renderFavouritesPanel();
    if (document.getElementById('panel-today').classList.contains('active')) renderTodayPanel();
    if (window.IB.currentData) renderCurrentQuestion(window.IB.currentData);
    await markDoneOnPage();
  } catch (e) {
    if (!silent) showMsg('error', 'Sync failed: ' + e.message);
  } finally {
    updateSyncBtnState();
    if (syncBtn) syncBtn.textContent = '↻ Sync';
  }
}

// ── View switching ────────────────────────────────────────────────────────────

function switchView(view) {
  if (window.IB.previousView === 'settings' && view !== 'settings') {
    showStatusToast();
  }

  ['log', 'today', 'favourites', 'db', 'settings'].forEach(function (v) {
    var p = document.getElementById('panel-' + v);
    if (p) p.classList.toggle('active', v === view);
    var btn = document.getElementById('btn-' + v + '-view');
    if (btn) btn.classList.toggle('active-tab', v === view);
  });
  if (view === 'today') renderTodayPanel();
  if (view === 'db') renderDBPanel();
  if (view === 'favourites') renderFavouritesPanel();
  if (view === 'settings') populateSettingsUI();

  window.IB.previousView = view;
}

function showStatusToast() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url.includes('exam-mate.com')) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showToast',
        mode: useFirebase() ? 'firebase' : 'local'
      });
    }
  });
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function showPageError(msg) {
  document.getElementById('no-page-msg').style.display = 'block';
  document.getElementById('no-page-msg').textContent = msg;
  document.getElementById('page-content').style.display = 'none';
}

function renderCurrentQuestion(data) {
  document.getElementById('no-page-msg').style.display = 'none';
  document.getElementById('page-content').style.display = 'block';
  document.getElementById('q-name').textContent = data.question_name || 'Unknown';
  document.getElementById('subject-badge').textContent = data.subject || 'unknown';
  document.getElementById('q-img-count').textContent = data.question_imgs.length + ' Q';
  document.getElementById('a-img-count').textContent = data.answer_imgs.length + ' A';
  var topicsEl = document.getElementById('old-topics-val');
  if (data.old_topics) {
    topicsEl.innerHTML = data.old_topics.split(',').map(function (t) { return '<span class="tag-pill">' + t.trim() + '</span>'; }).join('');
  } else { topicsEl.textContent = 'None found'; }
  var logged = window.IB.allEntries.some(function (e) { return e.question_name === data.question_name; });
  document.getElementById('already-logged-row').style.display = logged ? 'flex' : 'none';
  var logBtn = document.getElementById('log-btn');
  logBtn.disabled = false; logBtn.classList.remove('success');
  document.getElementById('log-btn-text').textContent = logged ? 'Log again (update)' : 'Log this question';
}

// ── Logging ───────────────────────────────────────────────────────────────────

async function logCurrent() {
  if (!window.IB.currentData) return;
  clearMsg();
  var logBtn = document.getElementById('log-btn');
  logBtn.disabled = true;
  try {
    if (useFirebase()) {
      document.getElementById('log-btn-text').textContent = 'Fetching...';
      window.IB.allEntries = window.IB.mergeEntries(await window.IB.fsReadAll(), window.IB.allEntries);
      await window.IB.saveCache(window.IB.allEntries);
    }
    var ex = window.IB.allEntries.find(function (e) { return e.question_name === window.IB.currentData.question_name; });
    if (ex) {
      if (ex.new_chapters && ex.new_chapters.length > 0) window.IB.currentData.new_chapters = ex.new_chapters;
      if (typeof ex.is_favourite !== 'undefined') window.IB.currentData.is_favourite = ex.is_favourite;
    }
    if (typeof window.IB.currentData.is_favourite === 'undefined') window.IB.currentData.is_favourite = false;
    window.IB.currentData.logged_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    document.getElementById('log-btn-text').textContent = 'Saving...';
    if (useFirebase()) await window.IB.fsWrite(window.IB.currentData);
    window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== window.IB.currentData.question_name; });
    window.IB.allEntries.unshift(window.IB.currentData);
    await window.IB.saveCache(window.IB.allEntries);
    logBtn.classList.add('success');
    document.getElementById('log-btn-text').textContent = '✓ Saved!';
    document.getElementById('already-logged-row').style.display = 'flex';
    showMsg('success', '"' + window.IB.currentData.question_name + '" saved' + (useFirebase() ? ' to Firestore' : ' locally') + '.');
    await markDoneOnPage();
    setTimeout(function () { logBtn.classList.remove('success'); logBtn.disabled = false; document.getElementById('log-btn-text').textContent = 'Log again (update)'; }, 2000);
  } catch (e) {
    logBtn.disabled = false; document.getElementById('log-btn-text').textContent = 'Log this question';
    showMsg('error', 'Error: ' + e.message);
  }
}

async function logAll() {
  clearMsg();
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  var tab = tabs[0];
  var btn = document.getElementById('log-all-btn');
  btn.disabled = true;
  try {
    if (useFirebase()) {
      btn.textContent = 'Fetching from Firestore...';
      window.IB.allEntries = window.IB.mergeEntries(await window.IB.fsReadAll(), window.IB.allEntries);
      await window.IB.saveCache(window.IB.allEntries);
    }
    btn.textContent = 'Scraping sidebar...';
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeAll' });
    if (response && response.error) { showMsg('error', response.error); return; }
    var questions = response.questions || [];
    if (questions.length === 0) { showMsg('error', 'No questions found in sidebar.'); return; }
    var added = 0, updated = 0, failed = 0;
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i]; delete q.is_active;
      if (typeof q.is_favourite === 'undefined') q.is_favourite = false;
      btn.textContent = 'Writing (' + (i + 1) + '/' + questions.length + ')...';
      try {
        var ex = window.IB.allEntries.find(function (e) { return e.question_name === q.question_name; });
        if (ex) {
          if (ex.new_chapters && ex.new_chapters.length > 0) q.new_chapters = ex.new_chapters;
          if (ex.is_favourite) q.is_favourite = ex.is_favourite; // preserve fav state
        }
        var isNew = !window.IB.allEntries.some(function (e) { return e.question_name === q.question_name; });
        if (useFirebase()) await window.IB.fsWrite(q);
        if (isNew) { window.IB.allEntries.unshift(q); added++; }
        else { var idx = window.IB.allEntries.findIndex(function (e) { return e.question_name === q.question_name; }); if (idx !== -1) window.IB.allEntries[idx] = q; updated++; }
        if (useFirebase()) await new Promise(function (r) { setTimeout(r, 100); });
      } catch (e) { failed++; }
    }
    await window.IB.saveCache(window.IB.allEntries);
    var msg = 'Done! Added ' + added + ', updated ' + updated;
    if (failed > 0) msg += ', ' + failed + ' failed';
    showMsg(failed > 0 ? 'error' : 'success', msg + '. Total: ' + window.IB.allEntries.length);
    if (window.IB.currentData) renderCurrentQuestion(window.IB.currentData);
    await markDoneOnPage();
  } catch (e) { showMsg('error', 'Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Log all questions in sidebar list'; }
}

// ── Questions panel ───────────────────────────────────────────────────────────

async function loadQuestionsPanel() {
  var listEl = document.getElementById('qp-list');
  listEl.innerHTML = '<div class="qp-loading">Loading...</div>';
  document.getElementById('qp-count').textContent = '—';
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('exam-mate.com')) { listEl.innerHTML = '<div class="qp-loading">Open an ExamMate page first.</div>'; return; }
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeAll' });
    if (response && response.error) { listEl.innerHTML = '<div class="qp-loading">' + response.error + '</div>'; return; }
    window.IB.sidebarQuestions = response.questions || [];
    renderQuestionsPanel();
  } catch (e) { listEl.innerHTML = '<div class="qp-loading">Error: ' + e.message + '</div>'; }
}

function renderQuestionsPanel() {
  var listEl = document.getElementById('qp-list');
  var countEl = document.getElementById('qp-count');
  if (window.IB.sidebarQuestions.length === 0) { countEl.textContent = '0 questions'; listEl.innerHTML = '<div class="qp-loading">No questions found.</div>'; return; }
  var loggedNames = new Set(window.IB.allEntries.map(function (e) { return e.question_name; }));
  var doneCount = window.IB.sidebarQuestions.filter(function (q) { return loggedNames.has(q.question_name); }).length;
  countEl.textContent = window.IB.sidebarQuestions.length + ' questions · ' + doneCount + ' done';
  listEl.innerHTML = window.IB.sidebarQuestions.map(function (q) {
    var isDone = loggedNames.has(q.question_name);
    var isActive = q.is_active;
    var cls = (isDone && isActive) ? 'state-active-done' : isDone ? 'state-done' : isActive ? 'state-active' : '';
    var meta = isDone ? (isActive ? '★ active · done' : '✓ done') : (isActive ? '▶ active' : '');
    var redoBtn = isDone ? '<button class="redo-btn" data-name="' + q.question_name + '" data-subject="' + q.subject + '">Redo</button>' : '';
    return '<div class="qp-item ' + cls + '"><div style="flex:1;min-width:0;"><div class="qp-item-name" title="' + q.question_name + '">' + q.question_name + '</div>' + (meta ? '<div class="qp-item-meta">' + meta + '</div>' : '') + '</div>' + redoBtn + '</div>';
  }).join('');
  listEl.querySelectorAll('.redo-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name'), subj = this.getAttribute('data-subject');
      this.textContent = '...'; this.disabled = true;
      try {
        if (useFirebase()) await window.IB.fsDelete(subj, name);
        window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== name; });
        await window.IB.saveCache(window.IB.allEntries); await markDoneOnPage();
        if (window.IB.currentData) renderCurrentQuestion(window.IB.currentData);
        renderQuestionsPanel();
        showQpMsg('success', '"' + name + '" removed — ready to redo.');
      } catch (e) { showQpMsg('error', 'Error: ' + e.message); this.textContent = 'Redo'; this.disabled = false; }
    });
  });
}

function showQpMsg(type, text) {
  var el = document.getElementById('qp-msg');
  el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3000);
}

// ── Today panel ───────────────────────────────────────────────────────────────

function renderTodayPanel() {
  var today = new Date().toISOString().split('T')[0];
  var todayItems = window.IB.allEntries.filter(function(e) { 
    return e.todo_date === today; 
  });
  var doneCount = todayItems.filter(function(e) {
    return !!e.logged_at; 
  }).length;

  var panel = document.getElementById('panel-today');
  if (!panel) return;
  
  if (todayItems.length === 0) {
    panel.innerHTML = '<div class="empty-today">No questions queued for today.<br>' +
      'Use the ☐ Select button in the<br>ExamMate sidebar to build your queue.</div>';
    return;
  }

  var pct = Math.round((doneCount / todayItems.length) * 100);
  
  panel.innerHTML =
    '<div class="today-progress">' +
      '<span>' + doneCount + ' / ' + todayItems.length + ' done</span>' +
      '<div class="today-progress-bar">' +
        '<div class="today-progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<button class="today-clear-btn" id="today-clear-btn">Clear queue</button>' +
    '</div>' +
    '<div id="today-list">' +
    todayItems.map(function(e) {
      var isDone = !!e.logged_at; 
      var subjectNames = e.subject || 'other';
      var topics = e.old_topics || '';
      return '<div class="today-item' + (isDone ? ' is-done' : '') + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="today-name" title="' + (e.question_name || '') + '">' + 
            (e.source_url ? '<a href="' + e.source_url + '" target="_blank" style="color:inherit;text-decoration:none;">' + (e.question_name || '—') + '</a>' : (e.question_name || '—')) + '</div>' +
          '<div class="today-meta">' + subjectNames + 
            (topics ? ' · ' + topics.split(',').slice(0,2).map(function(t) { return t.trim(); }).join(', ') : '') + '</div>' +
        '</div>' +
        '<button class="today-remove-btn" data-name="' + (e.question_name || '') + 
          '" data-subject="' + subjectNames + '">Remove</button>' +
      '</div>';
    }).join('') +
    '</div>';

  panel.querySelectorAll('.today-remove-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var name = this.getAttribute('data-name');
      var entry = window.IB.allEntries.find(function(e) { return e.question_name === name; });
      if (entry) {
        btn.textContent = '...'; btn.disabled = true;
        entry.todo_date = null;
        await window.IB.saveCache(window.IB.allEntries);
        if (useFirebase()) await window.IB.fsWrite(entry);
        await markDoneOnPage();
        renderTodayPanel();
      }
    });
  });

  document.getElementById('today-clear-btn').addEventListener('click', async function() {
    if (!confirm('Clear all ' + todayItems.length + ' questions from today\'s queue?')) return;
    var btn = this;
    btn.textContent = '...'; btn.disabled = true;
    todayItems.forEach(function(e) { e.todo_date = null; });
    await window.IB.saveCache(window.IB.allEntries);
    if (useFirebase()) {
      for (var i = 0; i < todayItems.length; i++) {
        try { await window.IB.fsWrite(todayItems[i]); } catch(_) {}
      }
    }
    await markDoneOnPage();
    renderTodayPanel();
  });
}

// ── Favourites panel ──────────────────────────────────────────────────────────

function renderFavouritesPanel() {
  var filter = (document.getElementById('fav-filter').value || '').toLowerCase();
  var favs = window.IB.allEntries.filter(function (e) { return e.is_favourite === true; });
  var filtered = filter ? favs.filter(function (e) {
    return (e.question_name || '').toLowerCase().includes(filter) ||
      (e.subject || '').toLowerCase().includes(filter) ||
      (e.old_topics || '').toLowerCase().includes(filter);
  }) : favs;

  document.getElementById('fav-count').textContent = favs.length + ' favourite' + (favs.length !== 1 ? 's' : '') + (filter ? ' · ' + filtered.length + ' shown' : '');

  var listEl = document.getElementById('fav-list');
  if (favs.length === 0) {
    listEl.innerHTML = '<div class="empty-fav"><div class="fav-icon">♥</div>No favourites yet.<br>Click the ♥ button next to any question<br>in the ExamMate sidebar to add it here.</div>';
    return;
  }
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-fav">No favourites match "' + filter + '"</div>';
    return;
  }

  listEl.innerHTML = filtered.map(function (e) {
    var isDone = true; // if it's in allEntries it's done (logged)
    var doneBadge = isDone ? '<span class="fav-done-badge">✓ done</span>' : '';
    var qCount = (e.question_imgs || []).length;
    var aCount = (e.answer_imgs || []).length;
    return '<div class="fav-item">' +
      '<div class="fav-heart">♥</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div class="fav-name">' + (e.question_name || '—') + doneBadge + '</div>' +
      '<div class="fav-meta">' + (e.subject || '') + ' · ' + qCount + 'Q ' + aCount + 'A · ' + (e.logged_at || '') + '</div>' +
      (e.old_topics ? '<div class="fav-meta" style="margin-top:2px;">' + e.old_topics.split(',').slice(0, 2).map(function (t) { return t.trim(); }).join(', ') + '</div>' : '') +
      '</div>' +
      '<div class="fav-actions">' +
      '<button class="fav-unfav-btn" data-name="' + (e.question_name || '') + '" data-subject="' + (e.subject || 'other') + '">♡ Unfav</button>' +
      '</div>' +
      '</div>';
  }).join('');

  listEl.querySelectorAll('.fav-unfav-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name');
      var subj = this.getAttribute('data-subject');
      this.textContent = '...'; this.disabled = true;
      try {
        // Set is_favourite = false on the entry (keep it as done)
        var entry = window.IB.allEntries.find(function (e) { return e.question_name === name; });
        if (entry) {
          entry.is_favourite = false;
          await window.IB.saveCache(window.IB.allEntries);
          if (useFirebase()) await window.IB.fsWrite(entry);
          await markDoneOnPage();
          renderFavouritesPanel();
          showFavMsg('success', '"' + name + '" removed from favourites.');
        }
      } catch (e) { showFavMsg('error', 'Error: ' + e.message); this.textContent = '♡ Unfav'; this.disabled = false; }
    });
  });
}

function showFavMsg(type, text) {
  var el = document.getElementById('fav-msg');
  el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3000);
}

// ── DB panel ──────────────────────────────────────────────────────────────────

function renderDBPanel() {
  var subjects = new Set(window.IB.allEntries.map(function (e) { return e.subject; }));
  document.getElementById('stat-total').textContent = window.IB.allEntries.length;
  document.getElementById('stat-tagged').textContent = window.IB.allEntries.filter(function (e) { return e.new_chapters && e.new_chapters.length > 0; }).length;
  document.getElementById('stat-subjects').textContent = subjects.size;
  renderEntryList();
}

function renderEntryList() {
  var filter = (document.getElementById('db-filter').value || '').toLowerCase();
  var filtered = window.IB.allEntries.filter(function (e) {
    if (!filter) return true;
    return (e.question_name || '').toLowerCase().includes(filter) || (e.subject || '').toLowerCase().includes(filter) || (e.old_topics || '').toLowerCase().includes(filter);
  });
  var listEl = document.getElementById('entry-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-db">' + (window.IB.allEntries.length === 0 ? 'No questions logged yet.<br>Go to an ExamMate page and log questions.' : 'No results for "' + filter + '"') + '</div>';
    return;
  }
  listEl.innerHTML = filtered.map(function (e) {
    var chips = (e.new_chapters && e.new_chapters.length > 0) ? e.new_chapters.map(function (c) { return '<span class="entry-chip">' + c + '</span>'; }).join('') : '<span class="entry-chip blank">untagged</span>';
    var favIcon = e.is_favourite ? '<span style="color:#FF8F00;margin-left:4px;font-size:10px;">♥</span>' : '';
    return '<div class="entry-item"><div style="flex:1;min-width:0;"><div class="entry-name">' + (e.question_name || '—') + favIcon + '</div><div class="entry-meta">' + (e.subject || '') + ' · ' + (e.question_imgs || []).length + 'Q ' + (e.answer_imgs || []).length + 'A · ' + (e.logged_at || '') + '</div><div class="entry-chips">' + chips + '</div></div><button class="del-btn" data-name="' + (e.question_name || '') + '" data-subject="' + (e.subject || 'other') + '">✕</button></div>';
  }).join('');
  listEl.querySelectorAll('.del-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name'), subj = this.getAttribute('data-subject');
      try {
        if (useFirebase()) await window.IB.fsDelete(subj, name);
        window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== name; });
        await window.IB.saveCache(window.IB.allEntries); await markDoneOnPage(); renderDBPanel();
      } catch (e) { showMsg('error', 'Delete failed: ' + e.message); }
    });
  });
}

// ── Export / Clear ────────────────────────────────────────────────────────────

function exportJSON() {
  if (window.IB.allEntries.length === 0) { showMsg('error', 'Nothing to export yet.'); return; }
  var grouped = {};
  window.IB.allEntries.forEach(function (e) { var s = e.subject || 'other'; if (!grouped[s]) grouped[s] = { PYQS: [] }; grouped[s].PYQS.push(e); });
  var blob = new Blob([JSON.stringify(grouped, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = 'ib_db_' + new Date().toISOString().split('T')[0] + '.json'; a.click(); URL.revokeObjectURL(url);
}

async function clearAll() {
  if (!confirm('Delete ALL ' + window.IB.allEntries.length + ' questions? Cannot be undone.')) return;
  if (useFirebase()) { for (var i = 0; i < window.IB.allEntries.length; i++) { try { await window.IB.fsDelete(window.IB.allEntries[i].subject, window.IB.allEntries[i].question_name); } catch (_) { } } }
  window.IB.allEntries = []; await window.IB.saveCache([]); await markDoneOnPage(); renderDBPanel();
  showMsg('success', 'All cleared.');
}

// ── UI helpers ────────────────────────────────────────────────────────────────

function showMsg(type, text) { var el = document.getElementById('inline-msg'); if (!el) return; el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block'; }
function clearMsg() { var el = document.getElementById('inline-msg'); if (el) el.style.display = 'none'; }

// Also handle popup unload (to show toast if closing from Settings view)
window.addEventListener('blur', function () {
  if (window.IB.previousView === 'settings') {
    showStatusToast();
  }
});
