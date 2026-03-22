// popup-actions.js — Actions logic for IB Exam Logger

// ── Mark done + favourites on page ────────────────────────────────────────────

async function markDoneOnPage() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('exam-mate.com/topicalpastpapers')) return;
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
