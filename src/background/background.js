// background.js — IB Exam Logger service worker

var CACHE_KEY = 'ib_question_cache';
var SETTINGS_KEY = 'ib_settings';
var KNOWN_SUBJECTS = ['chemistry', 'physics', 'mathematics', 'biology', 'other'];

try {
  importScripts('./background-api.js', './background-messages.js');
} catch (e) {
  console.error('Failed to import scripts: ', e);
}

// ── Startup ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create('auto-sync', { periodInMinutes: 1 });
});
chrome.runtime.onStartup.addListener(function () {
  chrome.alarms.create('auto-sync', { periodInMinutes: 1 });
  chrome.alarms.create('ib_auto_sync', { periodInMinutes: 1 });
});


// ── Alarm: periodic auto-sync ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'ib_auto_sync') {
    // 1-minute sync is now PULL-ONLY to preserve battery/bandwidth 
    // and rely on active-push logic.
    autoSync(true); 
  }
});

var isSyncing = false;
var activeSyncPromise = null;

/**
 * Applies a list of pending changes to Firebase.
 * Used in both the Push-Only (Path B) and Full-Sync (Path C) paths.
 * Processes changes sequentially and silently skips individual failures
 * so that one bad document doesn't block the entire batch.
 *
 * @param {Array}  changes  - Array of pending change objects from the changes log.
 * @param {object} settings - Firebase settings (projectId, apiKey).
 */
async function applyChangesToFirebase(changes, settings) {
  for (var i = 0; i < changes.length; i++) {
    var c = changes[i];
    try {
      if (c.op === 'add' || c.op === 'update') {
        if (c.collection === 'entries') await fsWrite(settings, c.data, true);
        else if (c.collection === 'todos') await fsWriteTodo(settings, c.data, true);
        else if (c.collection === 'dups') await fsWriteDupGroup(settings, c.data, true);
      } else if (c.op === 'delete') {
        if (c.collection === 'entries') await fsDelete(settings, c.data.subject, c.key, true);
        else if (c.collection === 'todos') await fsDeleteTodo(settings, c.key, true);
        else if (c.collection === 'dups') await fsDeleteDupGroup(settings, c.key, true);
      }
    } catch (_) {
      // Silent failure: this change remains in the log and is retried on the next alarm cycle.
    }
  }
}

/**
 * Pushes every local document to Firebase.
 * Called during first-time initialization (Path D) when the remote database is empty.
 * This seeds the database from local state without a prior pull step.
 *
 * A small throttle (50ms every 10 writes) is applied to stay under Firestore
 * rate limits without noticeably slowing down the initialization.
 *
 * @param {Array}  entries  - All local PYQ entries.
 * @param {Array}  todos    - All local Todo entries.
 * @param {Array}  dups     - All local Dup groups.
 * @param {object} settings - Firebase settings.
 */
async function pushAllLocalToFirebase(entries, todos, dups, settings) {
  console.log('[IB Sync] Path D: Initializing Firebase from local data (' +
    entries.length + ' entries, ' + todos.length + ' todos, ' + dups.length + ' dups).');

  // Batch Push: Skip cloud handshake inside the loop to avoid rate limiting.
  // We will call bumpGlobalSyncTime ONCE at the end of the sync path instead.
  for (var i = 0; i < entries.length; i++) {
    try { await fsWrite(settings, entries[i], true); } catch (_) {}
  }
  for (var j = 0; j < todos.length; j++) {
    try { await fsWriteTodo(settings, todos[j], true); } catch (_) {}
  }
  // Push all dup groups.
  for (var k = 0; k < dups.length; k++) {
    try { await fsWriteDupGroup(settings, dups[k], true); } catch (_) {}
  }
}

/**
 * Main sync function. Implements a 4-path algorithm based on two state signals:
 *
 *   T_local  = timestamp of the last successful sync on THIS device (chrome.storage.local).
 *   T_remote = timestamp of the last successful sync on ANY client (Firestore /meta/sync_state).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │  PATH A (No-op):     T_local === T_remote AND no pending changes.        │
 * │                      Cost: 1 read (metadata check only).                 │
 * │                                                                          │
 * │  PATH B (Push-only): T_local === T_remote AND pending changes exist.     │
 * │                      Remote unchanged, push local mutations only.        │
 * │                      Cost: pending_changes.length writes.                │
 * │                                                                          │
 * │  PATH C (Delta):     T_local !== T_remote AND T_remote > 0.             │
 * │                      Remote changed. Use :runQuery to fetch only the     │
 * │                      documents with updated_at > T_local. Merge + push. │
 * │                      Cost: 3 queries (one per collection type).          │
 * │                                                                          │
 * │  PATH D (Init):      T_remote === 0. Database is empty/new.             │
 * │                      Push all local data to initialize the database.    │
 * │                      Cost: local_count writes (one-time only).           │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Only runs in Firebase mode with valid credentials./**
 * @param {boolean} isPullOnly - If true, skip Path B/D and skip the push step in Path C.
 *                               Used by the lightweight periodic alarm.
 */
async function autoSync(isPullOnly) {
  // ── Sync Locking ───────────────────────────────────────────────────────────
  if (isSyncing && activeSyncPromise) {
    // If a sync is already running, wait for it to finish and return its result.
    // This prevents "sync storms" and ensures all tabs get the same fresh data.
    return activeSyncPromise;
  }
  
  // Create a new promise for this sync cycle
  activeSyncPromise = (async function() {
    isSyncing = true;
    try {
      var settings = await getSettings();

      // Guard: skip entirely if not in Firebase mode or credentials are missing/invalid.
      if (settings.mode !== 'firebase' || !settings.firebaseApiKey || !settings.firebaseProjectId) {
        return false;
      }

      if (isPullOnly) {
        console.log('[IB Sync] Periodic Alarm Triggered (Pull-Only Mode)');
      }

      // ── Step 1: Cheap gatekeeper check ───────────────────────────────────────
      var T_local  = await getLocalSyncTime();
      var T_remote = await getRemoteSyncTime(settings);
      var pending  = await getPendingChanges();

      // ── PATH A: Everything is in sync, nothing to do ──────────────────────────
      if (T_local === T_remote && pending.length === 0) {
        console.log('[IB Sync] Path A: Up to date.');
        return true;

      // ── PATH B: Push-only ─────────────────────────────────────────────────────
      } else if (T_local === T_remote && pending.length > 0) {
        if (isPullOnly) {
          console.log('[IB Sync] Path B skipped (Pull-Only).');
          return true;
        }
        console.log('[IB Sync] Path B: Push-only (' + pending.length + ' pending changes).');
        await applyChangesToFirebase(pending, settings);
        await clearPendingChanges();
        await bumpGlobalSyncTime(settings);

      // ── PATH D: First-time initialization ─────────────────────────────────────
      } else if (T_remote === 0) {
        if (isPullOnly) {
          console.log('[IB Sync] Path D skipped (Pull-Only).');
          return true;
        }
        console.log('[IB Sync] Path D: Initializing Firebase from local data.');
        var localResults = await Promise.all([loadCache(), loadTodos(), loadDuplicates()]);
        var initEntries  = localResults[0];
        var initTodos    = localResults[1];
        var initDups     = localResults[2];

        var stampNow = Date.now();
        initEntries.forEach(function(e) { if (!e.updated_at) e.updated_at = stampNow; });
        initTodos.forEach(function(t)   { if (!t.updated_at) t.updated_at = stampNow; });
        initDups.forEach(function(g)    { if (!g.updated_at) g.updated_at = stampNow; });

        await saveCache(initEntries);
        await saveTodos(initTodos);
        await saveDuplicates(initDups);
        await pushAllLocalToFirebase(initEntries, initTodos, initDups, settings);
        await clearPendingChanges();
        await bumpGlobalSyncTime(settings);

      // ── PATH C: Delta sync ────────────────────────────────────────────────────
      } else {
        console.log('[IB Sync] Path C: Delta sync (T_local=' + T_local + ', T_remote=' + T_remote + ').');
        var deltaResults = await Promise.all([
          fsReadDeltaEntries(settings, T_local),
          fsReadDeltaTodos(settings, T_local),
          fsReadDeltaDups(settings, T_local)
        ]);
        var deltaEntries = deltaResults[0];
        var deltaTodos   = deltaResults[1];
        var deltaDups    = deltaResults[2];

        var localResults = await Promise.all([loadCache(), loadTodos(), loadDuplicates()]);
        var localEntries = localResults[0];
        var localTodos   = localResults[1];
        var localDups    = localResults[2];

        var merged      = mergeEntries(deltaEntries, localEntries, pending, false, true);
        var mergedTodos = mergeTodos(deltaTodos, localTodos, pending, false, true);
        var mergedDups  = mergeDupGroups(deltaDups, localDups, pending, false, true);

        merged.forEach(function(e) { delete e.repeated_question; });
        var entriesToSave = merged;
        
        // V2 REFIX: Ensure any newly pulled delta items that were missing updated_at (legacy)
        // are stamped locally so they don't break future delta pulls on THIS device.
        var now = Date.now();
        entriesToSave.forEach(function(e) { if (!e.updated_at) e.updated_at = now; });

        await saveCache(entriesToSave);
        await saveTodos(mergedTodos);
        await saveDuplicates(mergedDups);

        if (!isPullOnly && pending.length > 0) {
          await applyChangesToFirebase(pending, settings);
        }

        await clearPendingChanges();
        await bumpGlobalSyncTime(settings);
      }

      return true;
    } catch (e) {
      console.error('[IB Sync] autoSync failed:', e.message);
      return false;
    } finally {
      // Always refresh the sidebar markers on open ExamMate tabs after any sync path.
      await markAllExamMateTabs();
      isSyncing = false;
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

// ── Tab watching ──────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('exam-mate.com')) {
    // Standard background sync is fine for general updates, 
    // but the content script will now also request its own blocking sync in C:
  }
});

chrome.tabs.onRemoved.addListener(async function (tabId, removeInfo) {
  if (removeInfo.isWindowClosing) {
    autoSync();
  } else {
    // We cannot reliably read the url of a removed tab without caching, 
    // but running an autoSync on any tab close is cheap enough if we are locked and debounced
    autoSync();
  }
});

chrome.storage.onChanged.addListener(function (changes, area) {
  if (area === 'local' && changes[CACHE_KEY]) markAllExamMateTabs();
});

async function markAllExamMateTabs() {
  var tabs = await chrome.tabs.query({ url: '*://www.exam-mate.com/*' });
  for (var i = 0; i < tabs.length; i++) markTab(tabs[i].id);
}

async function markTab(tabId) {
  var data = await getSyncDataForTab();
  try {
    await chrome.tabs.sendMessage(tabId, Object.assign({ action: 'markDone' }, data));
  } catch (e) { }
}

async function getSyncDataForTab() {
  var entries = await loadCache();
  var todos = await loadTodos();
  var allGroups = await loadDuplicates();
  var groups = allGroups.filter(function(g) { return g.status !== 'ai-rejected'; });
  var rejectedGroups = allGroups.filter(function(g) { return g.status === 'ai-rejected'; });
  var favNames = entries.filter(function (e) { return e.is_favourite === true; }).map(function (e) { return e.question_name; });
  var allNames = entries.filter(function (e) { return e.logged_at !== null; }).map(function (e) { return e.question_name; });
  var todoNames = todos.map(function(t) { return t.question_name; });
  // Build dupInfo: name -> { is_primary, linked_questions, primary_name }
  var dupInfo = {};
  groups.forEach(function(g) {
    var qList = g.questions || [];
    qList.forEach(function(name) {
      dupInfo[name] = { 
        is_primary: name === g.primary, 
        linked_questions: qList.filter(function(n) { return n !== name; }), 
        primary_name: g.primary || qList[0] || '',
        status: g.status || 'user'
      };
    });
  });

  return {
    questionNames: allNames,
    favouriteNames: favNames,
    todoNames: todoNames,
    dupInfo: dupInfo,
    rejectedGroups: rejectedGroups
  };
}

