// background.js — IB Exam Logger service worker

const CACHE_KEY = 'ib_question_cache';
const SETTINGS_KEY = 'ib_settings';
const KNOWN_SUBJECTS = ['chemistry', 'physics', 'mathematics', 'biology', 'other'];

// ── Startup ───────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(function() {
  setupContextMenu();
  chrome.alarms.create('auto-sync', { periodInMinutes: 3 });
});
chrome.runtime.onStartup.addListener(function() {
  setupContextMenu();
  chrome.alarms.create('auto-sync', { periodInMinutes: 3 });
});

function setupContextMenu() {
  chrome.contextMenus.removeAll(function() {
    chrome.contextMenus.create({
      id: 'toggle-done',
      title: 'IB Logger: Toggle Done ✓',
      contexts: ['all'],
      documentUrlPatterns: ['*://www.exam-mate.com/*']
    });
  });
}

// ── Alarm: periodic auto-sync ─────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(function(alarm) {
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

chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('exam-mate.com')) {
    setTimeout(function() { markTab(tabId); }, 1500);
  }
});

chrome.storage.onChanged.addListener(function(changes, area) {
  if (area === 'local' && changes[CACHE_KEY]) markAllExamMateTabs();
});

async function markAllExamMateTabs() {
  var tabs = await chrome.tabs.query({ url: '*://www.exam-mate.com/*' });
  for (var i = 0; i < tabs.length; i++) markTab(tabs[i].id);
}

async function markTab(tabId) {
  var entries = await loadCache();
  var doneNames = entries.filter(function(e) { return !e.is_favourite; }).map(function(e) { return e.question_name; });
  // All entries that have is_favourite = true
  var favNames = entries.filter(function(e) { return e.is_favourite === true; }).map(function(e) { return e.question_name; });
  // Done = in DB (regardless of fav status)
  var allNames = entries.map(function(e) { return e.question_name; });
  try {
    await chrome.tabs.sendMessage(tabId, {
      action: 'markDone',
      questionNames: allNames,
      favouriteNames: favNames
    });
  } catch (e) {}
}

// ── Context menu ──────────────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(function(info, tab) {
  if (info.menuItemId === 'toggle-done' && tab.url && tab.url.includes('exam-mate.com')) {
    chrome.tabs.sendMessage(tab.id, { action: 'getActiveName' }, async function(response) {
      if (chrome.runtime.lastError || !response || !response.question_name) return;
      var name = response.question_name;
      var entries = await loadCache();
      var exists = entries.some(function(e) { return e.question_name === name; });
      var settings = await getSettings();
      if (exists) {
        entries = entries.filter(function(e) { return e.question_name !== name; });
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsDelete(settings, response.subject, name); } catch (e) {}
        }
      } else {
        var newEntry = {
          question_name: name, subject: response.subject,
          question_imgs: response.question_imgs || [], answer_imgs: response.answer_imgs || [],
          old_topics: response.old_topics || '', new_chapters: [], is_favourite: false,
          logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: tab.url,
        };
        entries.unshift(newEntry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, newEntry); } catch (e) {}
        }
      }
    });
  }
});

// ── Message listener: toggleDoneFromPage + toggleFavouriteFromPage ────────────

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {

  if (request.action === 'toggleDoneFromPage') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      if (request.isDone) {
        // Un-done: remove entry entirely (keep fav state if it was fav)
        var entry = entries.find(function(e) { return e.question_name === name; });
        if (entry && entry.is_favourite) {
          // Keep it but mark not done somehow — actually done = "in DB", so we just leave it
          // but user clicked done btn to un-done → remove from DB
        }
        entries = entries.filter(function(e) { return e.question_name !== name; });
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsDelete(settings, request.subject, name); } catch(e) {}
        }
      } else {
        var entry = request.entryData;
        entry.is_favourite = false;
        var ex = entries.find(function(e) { return e.question_name === name; });
        if (ex) {
          if (ex.new_chapters && ex.new_chapters.length > 0) entry.new_chapters = ex.new_chapters;
          if (ex.is_favourite) entry.is_favourite = ex.is_favourite; // preserve fav state
        }
        entries = entries.filter(function(e) { return e.question_name !== name; });
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch(e) {}
        }
      }
    })();
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'toggleFavouriteFromPage') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      var ex = entries.find(function(e) { return e.question_name === name; });

      if (request.isFav) {
        // Remove favourite — if also done, keep in DB with is_favourite=false; else remove
        if (ex) {
          ex.is_favourite = false;
          await saveCache(entries);
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            try { await fsWrite(settings, ex); } catch(e) {}
          }
        }
      } else {
        // Add favourite — upsert entry with is_favourite=true
        var entry = request.entryData;
        entry.is_favourite = true;
        if (ex) {
          if (ex.new_chapters && ex.new_chapters.length > 0) entry.new_chapters = ex.new_chapters;
          entries = entries.filter(function(e) { return e.question_name !== name; });
        }
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch(e) {}
        }
      }
    })();
    sendResponse({ ok: true });
    return true;
  }

});

// ── Firestore helpers ─────────────────────────────────────────────────────────

function safeId(str) { return (str || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_'); }
function subjectKey(s) { return (s || 'other').toLowerCase(); }
function fsBase(settings) { return 'https://firestore.googleapis.com/v1/projects/' + settings.firebaseProjectId + '/databases/(default)/documents'; }
function qDocUrl(settings, subject, qname) { return fsBase(settings) + '/subjects/' + subjectKey(subject) + '/PYQS/' + safeId(qname) + '?key=' + settings.firebaseApiKey; }
function subjectDocUrl(settings, subject) { return fsBase(settings) + '/subjects/' + subjectKey(subject) + '?key=' + settings.firebaseApiKey; }
function pyqsListUrl(settings, subject, pt) {
  var url = fsBase(settings) + '/subjects/' + subjectKey(subject) + '/PYQS?key=' + settings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}

function toFS(obj) {
  var fields = {};
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (v === null || v === undefined)  fields[k] = { nullValue: null };
    else if (typeof v === 'boolean')    fields[k] = { booleanValue: v };
    else if (typeof v === 'number')     fields[k] = { integerValue: String(v) };
    else if (Array.isArray(v))          fields[k] = { arrayValue: { values: v.map(function(x) { return { stringValue: String(x) }; }) } };
    else                                fields[k] = { stringValue: String(v) };
  });
  return { fields: fields };
}

function fromFS(doc) {
  var obj = {}, fields = doc.fields || {};
  Object.keys(fields).forEach(function(k) {
    var f = fields[k];
    if (f.stringValue !== undefined)      obj[k] = f.stringValue;
    else if (f.integerValue !== undefined) obj[k] = Number(f.integerValue);
    else if (f.booleanValue !== undefined) obj[k] = f.booleanValue;
    else if (f.nullValue !== undefined)    obj[k] = null;
    else if (f.arrayValue !== undefined)   obj[k] = (f.arrayValue.values || []).map(function(v) { return v.stringValue !== undefined ? v.stringValue : String(Object.values(v)[0]); });
    else obj[k] = null;
  });
  return obj;
}

async function fsWrite(settings, entry) {
  await fetch(subjectDocUrl(settings, entry.subject), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { subject: { stringValue: subjectKey(entry.subject) } } }) });
  var r = await fetch(qDocUrl(settings, entry.subject, entry.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(entry)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Write failed'); }
}

async function fsDelete(settings, subject, qname) {
  var r = await fetch(qDocUrl(settings, subject, qname), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('Delete failed (' + r.status + ')');
}

async function fsReadAll(settings) {
  var results = [];
  for (var i = 0; i < KNOWN_SUBJECTS.length; i++) {
    var subj = KNOWN_SUBJECTS[i], pt = null;
    do {
      var r = await fetch(pyqsListUrl(settings, subj, pt));
      if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Read failed'); }
      var d = await r.json();
      if (d.documents) d.documents.forEach(function(doc) { results.push(fromFS(doc)); });
      pt = d.nextPageToken || null;
    } while (pt);
  }
  return results;
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function loadCache() {
  try { var s = await chrome.storage.local.get([CACHE_KEY]); return s[CACHE_KEY] || []; } catch (e) { return []; }
}
async function saveCache(entries) {
  try { await chrome.storage.local.set({ [CACHE_KEY]: entries }); } catch (e) {}
}
async function getSettings() {
  try { var s = await chrome.storage.local.get([SETTINGS_KEY]); return s[SETTINGS_KEY] || {}; } catch (e) { return {}; }
}

function mergeEntries(remote, local) {
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) { if (!map[e.question_name]) map[e.question_name] = e; });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
}
