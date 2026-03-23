// storage.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.CACHE_KEY = 'ib_question_cache';
window.IB.SETTINGS_KEY = 'ib_settings';
window.IB.DUPLICATES_KEY = 'ib_duplicates_cache';
window.IB.KNOWN_SUBJECTS = ['chemistry', 'physics', 'mathematics', 'biology', 'other'];

// ── Settings ──────────────────────────────────────────────────────────────────

window.IB.loadSettings = async function() {
  try {
    var s = await chrome.storage.local.get([window.IB.SETTINGS_KEY]);
    var stored = s[window.IB.SETTINGS_KEY] || {};
    if (!stored.initialized) {
      stored = { initialized: true, mode: 'local', firebaseProjectId: '', firebaseApiKey: '', openrouterKey: '' };
      await chrome.storage.local.set({ [window.IB.SETTINGS_KEY]: stored });
    }
    return stored;
  } catch (e) { return { mode: 'local' }; }
};

// ── Cache ─────────────────────────────────────────────────────────────────────

window.IB.loadCache = async function() {
  try { var s = await chrome.storage.local.get([window.IB.CACHE_KEY]); return s[window.IB.CACHE_KEY] || []; } catch (e) { return []; }
};

window.IB.saveCache = async function(entries) {
  try { await chrome.storage.local.set({ [window.IB.CACHE_KEY]: entries }); } catch (e) {}
};

// ── Duplicates cache ──────────────────────────────────────────────────────────

// A duplicate group: { id: string, questions: string[], primary: string }
window.IB.loadDuplicates = async function() {
  try { var s = await chrome.storage.local.get([window.IB.DUPLICATES_KEY]); return s[window.IB.DUPLICATES_KEY] || []; } catch (e) { return []; }
};

window.IB.saveDuplicates = async function(groups) {
  try { await chrome.storage.local.set({ [window.IB.DUPLICATES_KEY]: groups }); } catch (e) {}
};

window.IB.mergeEntries = function(remote, local) {
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) { if (!map[e.question_name]) map[e.question_name] = e; });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
};
