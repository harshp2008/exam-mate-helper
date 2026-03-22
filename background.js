// background.js — IB Exam Logger service worker

var CACHE_KEY = 'ib_question_cache';
var SETTINGS_KEY = 'ib_settings';
var KNOWN_SUBJECTS = ['chemistry', 'physics', 'mathematics', 'biology', 'other'];

try {
  importScripts('background-api.js', 'background-messages.js');
} catch (e) {
  console.error('Failed to import scripts: ', e);
}

// ── Startup ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(function () {
  chrome.alarms.create('auto-sync', { periodInMinutes: 3 });
});
chrome.runtime.onStartup.addListener(function () {
  chrome.alarms.create('auto-sync', { periodInMinutes: 3 });
});


// ── Alarm: periodic auto-sync ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === 'auto-sync') autoSync();
});

async function autoSync() {
  var settings = await getSettings();
  if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
    try {
      var remote = await fsReadAll(settings);
      var local = await loadCache();
      await saveCache(mergeEntries(remote, local));
    } catch (e) {
      console.log('IB Logger auto-sync failed:', e.message);
    }
  }
  await markAllExamMateTabs();
}

// ── Tab watching ──────────────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('exam-mate.com')) {
    setTimeout(function () { markTab(tabId); }, 1500);
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
  var today = new Date().toISOString().split('T')[0];
  var favNames = entries.filter(function (e) { return e.is_favourite === true; }).map(function (e) { return e.question_name; });
  var allNames = entries.filter(function (e) { return e.logged_at !== null; }).map(function (e) { return e.question_name; });
  var todoNames = entries.filter(function(e) { return e.todo_date === today; }).map(function(e) { return e.question_name; });
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'markDone',
      questionNames: allNames,
      favouriteNames: favNames,
      todoNames: todoNames
    });
  } catch (e) { }
}

