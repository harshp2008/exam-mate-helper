// popup-actions.js — Actions logic for IB Exam Logger
import { showMsg, clearMsg, renderCurrentQuestion, renderTodayPanel, renderFavouritesPanel, renderDBPanel } from './popup-render.js';
import { loadCache, saveCache, mergeEntries } from './storage.js';
import { fsReadAll, fsWrite, fsDelete } from './firestore.js';
import { useFirebase } from './popup-settings.js';

// ── Mark done + favourites on page ────────────────────────────────────────────

export async function markDoneOnPage() {
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('exam-mate.com/topicalpastpapers')) return;
    
    var allEntries = await loadCache();
    var allNames = allEntries.filter(function(e) { return e.logged_at; }).map(function (e) { return e.question_name; });
    var favNames = allEntries.filter(function (e) { return e.is_favourite === true; }).map(function (e) { return e.question_name; });
    var today = new Date().toISOString().split('T')[0];
    var todoNames = allEntries.filter(function (e) { return e.todo_date === today; }).map(function (e) { return e.question_name; });
    
    await chrome.tabs.sendMessage(tab.id, { action: 'markDone', questionNames: allNames, favouriteNames: favNames, todoNames: todoNames });
  } catch (e) { }
}
window.markDoneOnPage = markDoneOnPage;

// ── Sync button state ─────────────────────────────────────────────────────────

export function updateSyncBtnState() {
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
window.updateSyncBtnState = updateSyncBtnState;

// ── Sync ──────────────────────────────────────────────────────────────────────

export async function syncFromFirestore(silent) {
  var syncBtn = document.getElementById('sync-btn');
  if (!useFirebase()) {
    if (!silent) showMsg('success', 'Local mode — data is already up to date.');
    return;
  }
  if (syncBtn) { syncBtn.textContent = 'Syncing...'; syncBtn.disabled = true; }
  try {
    var remote = await fsReadAll();
    var local = await loadCache();
    window.IB.allEntries = mergeEntries(remote, local);
    await saveCache(window.IB.allEntries);
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
window.syncFromFirestore = syncFromFirestore;

// ── Logging ───────────────────────────────────────────────────────────────────

export async function logCurrent() {
  if (!window.IB.currentData) return;
  clearMsg();
  var logBtn = document.getElementById('log-btn');
  logBtn.disabled = true;
  try {
    if (useFirebase()) {
      document.getElementById('log-btn-text').textContent = 'Fetching...';
      var remote = await fsReadAll();
      var local = await loadCache();
      window.IB.allEntries = mergeEntries(remote, local);
      await saveCache(window.IB.allEntries);
    }
    var ex = window.IB.allEntries.find(function (e) { return e.question_name === window.IB.currentData.question_name; });
    if (ex) {
      if (typeof ex.is_favourite !== 'undefined') window.IB.currentData.is_favourite = ex.is_favourite;
    }
    if (typeof window.IB.currentData.is_favourite === 'undefined') window.IB.currentData.is_favourite = false;
    window.IB.currentData.logged_at = new Date().toISOString().replace('T', ' ').substring(0, 19);
    document.getElementById('log-btn-text').textContent = 'Saving...';
    if (useFirebase()) await fsWrite(window.IB.currentData);
    window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== window.IB.currentData.question_name; });
    window.IB.allEntries.unshift(window.IB.currentData);
    await saveCache(window.IB.allEntries);
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
window.logCurrent = logCurrent;

export async function logAll() {
  clearMsg();
  var logBtn = document.getElementById('log-all-btn');
  logBtn.disabled = true;
  try {
    if (useFirebase()) {
      logBtn.textContent = 'Fetching...';
      var remote = await fsReadAll();
      var local = await loadCache();
      window.IB.allEntries = mergeEntries(remote, local);
      await saveCache(window.IB.allEntries);
    }
    logBtn.textContent = 'Scraping...';
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    var res = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeAll' });
    if (res && res.error) { showMsg('error', res.error); return; }
    var questions = res.questions || [];
    if (questions.length === 0) { showMsg('error', 'No questions found.'); return; }

    var added = 0, updated = 0, failed = 0;
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i]; delete q.is_active;
        if (typeof q.is_favourite === 'undefined') q.is_favourite = false;
        logBtn.textContent = 'Writing (' + (i+1) + '/' + questions.length + ')...';
        try {
          var ex = window.IB.allEntries.find(function(m) { return m.question_name === q.question_name; });
          if (ex && ex.is_favourite) q.is_favourite = true;
          var isNew = !window.IB.allEntries.some(function(m) { return m.question_name === q.question_name; });
          if (useFirebase()) await fsWrite(q);
          if (isNew) { window.IB.allEntries.unshift(q); added++; }
          else { var idx = window.IB.allEntries.findIndex(function(m){return m.question_name===q.question_name;}); if(idx!==-1) window.IB.allEntries[idx]=q; updated++; }
          if (useFirebase()) await new Promise(function(r){setTimeout(r, 100);});
        } catch(e) { failed++; }
    }
    await saveCache(window.IB.allEntries);
    showMsg(failed > 0 ? 'error' : 'success', 'Added ' + added + ', updated ' + updated + (failed > 0 ? ', failed ' + failed : ''));
    if (window.IB.currentData) renderCurrentQuestion(window.IB.currentData);
    await markDoneOnPage();
  } catch (e) { showMsg('error', 'Error: ' + e.message); }
  finally { btn.disabled = false; btn.textContent = 'Log all questions in sidebar list'; }
}
window.logAll = logAll;

// ── Export / Clear ────────────────────────────────────────────────────────────

export function exportJSON() {
  if (window.IB.allEntries.length === 0) { showMsg('error', 'No data to export.'); return; }
  var obj = {};
  window.IB.allEntries.forEach(function (e) {
    var s = e.subject || 'other';
    if (!obj[s]) obj[s] = { PYQS: [] };
    obj[s].PYQS.push(e);
  });
  var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'ib_db_' + new Date().toISOString().split('T')[0] + '.json';
  a.click(); URL.revokeObjectURL(url);
}
window.exportJSON = exportJSON;

export async function clearAll() {
  if (confirm('Delete ALL ' + window.IB.allEntries.length + ' records?')) {
    if (useFirebase()) {
      for (var i = 0; i < window.IB.allEntries.length; i++) {
        try { await fsDelete(window.IB.allEntries[i].subject, window.IB.allEntries[i].question_name); } catch (e) { }
      }
    }
    window.IB.allEntries = [];
    await saveCache([]); await markDoneOnPage(); renderDBPanel();
    showMsg('success', 'Cleared all data.');
  }
}
window.clearAll = clearAll;
window.clearAll = clearAll;
