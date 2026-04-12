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
});


// ── Alarm: periodic auto-sync ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'auto-sync') autoSync();
});

var isSyncing = false;

async function autoSync() {
  if (isSyncing) return;
  isSyncing = true;
  var settings = await getSettings();
  if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
    try {
      // 1. Sync Entries
      var remoteEntries = await fsReadAll(settings);
      var localEntries = await loadCache();
      var merged = mergeEntries(remoteEntries, localEntries);
      merged.forEach(function(e) { delete e.repeated_question; }); // V2 PURGE: ensure sync stays clean
      await saveCache(merged);
      
      // 1b. Sync Todos
      var remoteTodos = await fsReadAllTodos(settings);
      var localTodos = await loadTodos();
      var mergedTodos = mergeTodos(remoteTodos, localTodos);
      await saveTodos(mergedTodos);
      
      // 2. Sync Duplicates
      var remoteDups = await fsReadAllDupGroups(settings);
      var localDups = await loadDuplicates();
      // Merge Duplicates
      var mergedDups = localDups.slice();
      remoteDups.forEach(function(rg) {
        var idx = mergedDups.findIndex(function(lg) { return lg.id === rg.id; });
        if (idx !== -1) mergedDups[idx] = rg; else mergedDups.push(rg);
      });
      await saveDuplicates(mergedDups);

      // 3. DIFFERENTIAL PUSH (Local -> Remote)
      // Push entries that are new or modified locally
      for (var i = 0; i < merged.length; i++) {
        var e = merged[i];
        var r = remoteEntries.find(re => re.question_name === e.question_name);
        if (!r || r.is_favourite !== e.is_favourite || r.logged_at !== e.logged_at || r.source_url !== e.source_url) {
          try { await fsWrite(settings, e); } catch (_) {}
        }
      }

      // Push todos that are new locally
      for (var k = 0; k < mergedTodos.length; k++) {
        var t = mergedTodos[k];
        var rt = remoteTodos.find(re => re.question_name === t.question_name);
        if (!rt) {
          try { await fsWriteTodo(settings, t); } catch (_) {}
        }
      }

      // Push duplicates that are new or modified locally
      for (var j = 0; j < mergedDups.length; j++) {
        var lg = mergedDups[j];
        var rg = remoteDups.find(g => g.id === lg.id);
        if (!rg || rg.status !== lg.status || lg.questions.length !== (rg.questions || []).length || lg.primary !== rg.primary) {
          try { await fsWriteDupGroup(settings, lg); } catch (_) {}
        }
      }

    } catch (e) {
      console.log('IB Logger auto-sync failed:', e.message);
    }
  }
  await markAllExamMateTabs();
  isSyncing = false;
}

// ── Tab watching ──────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('exam-mate.com')) {
    setTimeout(function () { autoSync(); }, 800);
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
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'markDone',
      questionNames: allNames,
      favouriteNames: favNames,
      todoNames: todoNames,
      dupInfo: dupInfo,
      rejectedGroups: rejectedGroups
    });
  } catch (e) { }
}

