// storage.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.CACHE_KEY = 'ib_question_cache';
window.IB.SETTINGS_KEY = 'ib_settings';
window.IB.DUPLICATES_KEY = 'ib_duplicates_cache';
window.IB.TODOS_KEY = 'ib_todos_cache';
window.IB.LOCAL_SYNC_TIME_KEY = 'ib_firebase_sync_time';
window.IB.PENDING_CHANGES_KEY = 'ib_pending_changes';
window.IB.MAX_PENDING_CHANGES = 500;
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

    // ONE-TIME MIGRATION: Scrub legacy todo_date to new todos collection
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].todo_date) {
        if (!todos.some(function(t) { return t.question_name === entries[i].question_name; })) {
          todos.push({
            question_name: entries[i].question_name,
            subject: entries[i].subject || window.IB.KNOWN_SUBJECTS[window.IB.KNOWN_SUBJECTS.length - 1],
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

// ── Sync-state helpers ────────────────────────────────────────────────────────
// Mirrors the same helpers in background-api.js, exposed for use in the popup.
// T_local: last time THIS browser completed a sync.
// T_remote: last time ANY client completed a sync (stored in Firestore /meta/sync_state).

window.IB.getLocalSyncTime = async function() {
  try {
    var s = await chrome.storage.local.get([window.IB.LOCAL_SYNC_TIME_KEY]);
    return s[window.IB.LOCAL_SYNC_TIME_KEY] || 0;
  } catch (e) { return 0; }
};

window.IB.setLocalSyncTime = async function(ts) {
  try { await chrome.storage.local.set({ [window.IB.LOCAL_SYNC_TIME_KEY]: ts }); } catch (e) {}
};

// ── Pending changes log ───────────────────────────────────────────────────────
// Each entry: { id, collection, op, key, data, ts }
//   collection: 'entries' | 'todos' | 'dups'
//   op:         'add' | 'update' | 'delete'
//   key:        question_name or group.id
//   data:       full object snapshot (for add/update) or null (for delete)
//   ts:         Date.now() at time of change

window.IB.getPendingChanges = async function() {
  try { var s = await chrome.storage.local.get([window.IB.PENDING_CHANGES_KEY]); return s[window.IB.PENDING_CHANGES_KEY] || []; } catch (e) { return []; }
};

window.IB.clearPendingChanges = async function() {
  try { await chrome.storage.local.set({ [window.IB.PENDING_CHANGES_KEY]: [] }); } catch (e) {}
};

/**
 * Records a user-triggered mutation in the pending changes log.
 * Deduplicates by (collection, key) — only the most recent state for each item is tracked.
 */
window.IB.recordChange = async function(collection, op, key, data) {
  try {
    var changes = await window.IB.getPendingChanges();
    // Remove any prior change for this exact (collection, key) pair
    changes = changes.filter(function(c) { return !(c.collection === collection && c.key === key); });
    changes.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      collection: collection, op: op, key: key, data: data || null, ts: Date.now()
    });
    // Cap log to prevent unbounded growth
    if (changes.length > window.IB.MAX_PENDING_CHANGES) {
      changes = changes.slice(changes.length - window.IB.MAX_PENDING_CHANGES);
    }
    await chrome.storage.local.set({ [window.IB.PENDING_CHANGES_KEY]: changes });
  } catch (e) {}
};

// ── Merge functions (remote-authoritative) ────────────────────────────────────
// Remote is always the ground truth. Pending local changes from the log are the
// only exception that can override remote data. This ensures:
//   - Remote deletions propagate locally (item removed if not in pending log as 'add')
//   - Local deletions propagate remotely (item in remote gets 'delete' applied)
//   - Concurrent edits resolve to whichever side has a pending change

/**
 * Merges PYQ entries. Remote is authoritative. Local pending changes override remote.
 * @param {Array} remote - Entries from Firestore.
 * @param {Array} local  - Entries from chrome.storage.local.
 * @param {Array} pendingChanges - Current pending changes log.
 */
window.IB.mergeEntries = function(remote, local, pendingChanges) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'entries') localChanges[c.key] = c; });

  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });

  local.forEach(function(e) {
    var name = e.question_name;
    var change = localChanges[name];
    if (map[name]) {
      // In both: if we have a pending local change, local wins
      if (change && change.op !== 'delete' && change.data) map[name] = change.data;
    } else {
      // Local-only: keep only if there's a pending add/update (new since last sync)
      if (change && (change.op === 'add' || change.op === 'update')) map[name] = change.data || e;
      // else: deleted remotely, no pending add -> purge (don't add to map)
    }
  });

  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
};

/**
 * Merges Todo entries. Remote is authoritative. Pending add/deletes applied on top.
 * @param {Array} remote - Todos from Firestore.
 * @param {Array} local  - Todos from chrome.storage.local.
 * @param {Array} pendingChanges - Current pending changes log.
 */
window.IB.mergeTodos = function(remote, local, pendingChanges) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'todos') localChanges[c.key] = c; });

  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });

  local.forEach(function(e) {
    var name = e.question_name;
    var change = localChanges[name];
    if (map[name]) {
      // In remote. If pending DELETE -> remove it (user deleted locally)
      if (change && change.op === 'delete') delete map[name];
    } else {
      // Local-only: keep only if there's a pending add
      if (change && (change.op === 'add' || change.op === 'update')) map[name] = change.data || e;
    }
  });

  return Object.values(map);
};

/**
 * Merges Duplicate groups. Remote is authoritative. Pending adds/updates applied on top.
 * @param {Array} remote - Dup groups from Firestore.
 * @param {Array} local  - Dup groups from chrome.storage.local.
 * @param {Array} pendingChanges - Current pending changes log.
 */
window.IB.mergeDupGroups = function(remote, local, pendingChanges) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'dups') localChanges[c.key] = c; });

  var map = {};
  remote.forEach(function(g) { map[g.id] = g; });

  local.forEach(function(g) {
    var change = localChanges[g.id];
    if (map[g.id]) {
      // In remote: if pending local update, local wins
      if (change && change.op !== 'delete' && change.data) map[g.id] = change.data;
    } else {
      // Local-only: keep only if there's a pending add/update (new group)
      if (change && (change.op === 'add' || change.op === 'update')) map[g.id] = change.data || g;
    }
  });

  return Object.values(map);
};
