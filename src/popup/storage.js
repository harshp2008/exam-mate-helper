// storage.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.CACHE_KEY = 'ib_question_cache';
window.IB.SETTINGS_KEY = 'ib_settings';
window.IB.DUPLICATES_KEY = 'ib_duplicates_cache';
window.IB.TODOS_KEY = 'ib_todos_cache';
window.IB.KNOWN_SUBJECTS = ['biology', 'chemistry', 'physics', 'economics', 'glo_pol', 'philosophy', 'psychology', 'religions', 'mathematics', 'other'];

// ── Settings ──────────────────────────────────────────────────────────────────

window.IB.loadSettings = async function() {
  try {
    var s = await chrome.storage.local.get([window.IB.SETTINGS_KEY]);
    var stored = s[window.IB.SETTINGS_KEY] || {};
    if (!stored.initialized) {
      stored.initialized = true;
      stored.mode = stored.mode || 'local';
      stored.firebaseProjectId = stored.firebaseProjectId || '';
      stored.firebaseApiKey = stored.firebaseApiKey || '';
      stored.openrouterKey = stored.openrouterKey || '';
      await chrome.storage.local.set({ [window.IB.SETTINGS_KEY]: stored });
    }
    return stored;
  } catch (e) { return { mode: 'local' }; }
};

// ── Cache ─────────────────────────────────────────────────────────────────────

window.IB.loadCache = async function() {
  try { 
    var s = await chrome.storage.local.get([window.IB.CACHE_KEY, window.IB.TODOS_KEY]); 
    var entries = s[window.IB.CACHE_KEY] || []; 
    var todos = s[window.IB.TODOS_KEY] || [];
    var dirty = false;
    
    // ONE-TIME MIGRATION: Scrub legacy todo_date to new collection
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].todo_date) {
        if (!todos.some(function(t) { return t.question_name === entries[i].question_name; })) {
          todos.push({
            question_name: entries[i].question_name,
            subject: entries[i].subject || window.IB.KNOWN_SUBJECTS[window.IB.KNOWN_SUBJECTS.length - 1], // fallback
            source_url: entries[i].source_url || '',
            page_num: entries[i].page_num || 1,
            todo_date: entries[i].todo_date,
            logged_at: entries[i].logged_at || new Date().toISOString().replace('T', ' ').substring(0, 19)
          });
        }
        delete entries[i].todo_date;
        dirty = true;
      }
    }
    
    if (dirty) {
      await chrome.storage.local.set({ [window.IB.CACHE_KEY]: entries, [window.IB.TODOS_KEY]: todos });
    }
    
    return entries; 
  } catch (e) { return []; }
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

// ── To-Do cache ───────────────────────────────────────────────────────────────

window.IB.loadTodos = async function() {
  try { var s = await chrome.storage.local.get([window.IB.TODOS_KEY]); return s[window.IB.TODOS_KEY] || []; } catch (e) { return []; }
};

window.IB.saveTodos = async function(todos) {
  try { await chrome.storage.local.set({ [window.IB.TODOS_KEY]: todos }); } catch (e) {}
};

// Note: e.todo_date is removed, do not merge it back.
window.IB.mergeEntries = function(remote, local) {
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) { 
    if (!map[e.question_name]) {
      map[e.question_name] = e; 
    } else {
      if (e.is_favourite && !map[e.question_name].is_favourite) map[e.question_name].is_favourite = e.is_favourite;
    }
  });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
};

window.IB.mergeTodos = function(remote, local) {
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) { if (!map[e.question_name]) map[e.question_name] = e; });
  return Object.values(map);
};
