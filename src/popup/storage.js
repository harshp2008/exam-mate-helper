// storage.js — IB Exam Logger constants and storage helpers

export const CACHE_KEY = 'ib_question_cache';
export const SETTINGS_KEY = 'ib_settings';
export const DUPLICATES_KEY = 'ib_duplicates_cache';
export const KNOWN_SUBJECTS = ['chemistry', 'physics', 'mathematics', 'biology', 'other'];

// Attach to window.IB for legacy compatibility within the popup
window.IB = window.IB || {};
window.IB.CACHE_KEY = CACHE_KEY;
window.IB.SETTINGS_KEY = SETTINGS_KEY;
window.IB.DUPLICATES_KEY = DUPLICATES_KEY;
window.IB.KNOWN_SUBJECTS = KNOWN_SUBJECTS;

// ── Settings ──────────────────────────────────────────────────────────────────

export async function loadSettings() {
  try {
    var s = await chrome.storage.local.get([SETTINGS_KEY]);
    var stored = s[SETTINGS_KEY] || {};
    if (!stored.initialized) {
      stored = { initialized: true, mode: 'local', firebaseProjectId: '', firebaseApiKey: '', openrouterKey: '' };
      await chrome.storage.local.set({ [SETTINGS_KEY]: stored });
    }
    return stored;
  } catch (e) { return { mode: 'local' }; }
}
window.IB.loadSettings = loadSettings;

// ── Cache ─────────────────────────────────────────────────────────────────────

export async function loadCache() {
  try { var s = await chrome.storage.local.get([CACHE_KEY]); return s[CACHE_KEY] || []; } catch (e) { return []; }
}
window.IB.loadCache = loadCache;

export async function saveCache(entries) {
  try { await chrome.storage.local.set({ [CACHE_KEY]: entries }); } catch (e) {}
}
window.IB.saveCache = saveCache;

// ── Duplicates cache ──────────────────────────────────────────────────────────

export async function loadDuplicates() {
  try { var s = await chrome.storage.local.get([DUPLICATES_KEY]); return s[DUPLICATES_KEY] || []; } catch (e) { return []; }
}
window.IB.loadDuplicates = loadDuplicates;

export async function saveDuplicates(groups) {
  try { await chrome.storage.local.set({ [DUPLICATES_KEY]: groups }); } catch (e) {}
}
window.IB.saveDuplicates = saveDuplicates;

export function mergeEntries(remote, local) {
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) { if (!map[e.question_name]) map[e.question_name] = e; });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
}
window.IB.mergeEntries = mergeEntries;
