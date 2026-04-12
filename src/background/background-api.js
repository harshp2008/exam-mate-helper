// background-api.js — Firebase and Storage helpers for service worker

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
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    if (v === null || v === undefined) fields[k] = { nullValue: null };
    else if (typeof v === 'boolean') fields[k] = { booleanValue: v };
    else if (typeof v === 'number') fields[k] = { integerValue: String(v) };
    else if (Array.isArray(v)) fields[k] = { arrayValue: { values: v.map(function (x) { return { stringValue: String(x) }; }) } };
    else if (typeof v === 'object') fields[k] = { mapValue: toFS(v) };
    else fields[k] = { stringValue: String(v) };
  });
  return { fields: fields };
}

function fromFS(doc) {
  var obj = {}, fields = doc.fields || {};
  Object.keys(fields).forEach(function (k) {
    var f = fields[k];
    if (f.stringValue !== undefined) obj[k] = f.stringValue;
    else if (f.integerValue !== undefined) obj[k] = Number(f.integerValue);
    else if (f.booleanValue !== undefined) obj[k] = f.booleanValue;
    else if (f.nullValue !== undefined) obj[k] = null;
    else if (f.arrayValue !== undefined) obj[k] = (f.arrayValue.values || []).map(function (v) { return v.stringValue !== undefined ? v.stringValue : String(Object.values(v)[0]); });
    else if (f.mapValue !== undefined) obj[k] = fromFS(f.mapValue);
    else obj[k] = null;
  });
  return obj;
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsWrite(settings, entry, skipSyncTouch) {
  await fetch(subjectDocUrl(settings, entry.subject), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { subject: { stringValue: subjectKey(entry.subject) } } }) });
  var r = await fetch(qDocUrl(settings, entry.subject, entry.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(entry)) });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok) {
    var e = await r.json();
    throw new Error(e.error && e.error.message ? e.error.message : 'Write failed');
  }
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsDelete(settings, subject, name, skipSyncTouch) {
  var url = qDocUrl(settings, subject, name);
  var r = await fetch(url, { method: 'DELETE' });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok && r.status !== 404) {
    throw new Error('Delete failed (' + r.status + ')');
  }
}

function dupGroupUrl(settings, groupId) {
  return fsBase(settings) + '/duplicates/' + safeId(groupId) + '?key=' + settings.firebaseApiKey;
}
function dupListUrl(settings, pt) {
  var url = fsBase(settings) + '/duplicates?key=' + settings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}
function todoDocUrl(settings, qname) { return fsBase(settings) + '/todos/' + safeId(qname) + '?key=' + settings.firebaseApiKey; }
function todoListUrl(settings, pt) {
  var url = fsBase(settings) + '/todos?key=' + settings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsWriteDupGroup(settings, group, skipSyncTouch) {
  var r = await fetch(dupGroupUrl(settings, group.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(group)) });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok) {
    var e = await r.json();
    throw new Error(e.error && e.error.message ? e.error.message : 'Dup write failed');
  }
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsDeleteDupGroup(settings, groupId, skipSyncTouch) {
  var r = await fetch(dupGroupUrl(settings, groupId), { method: 'DELETE' });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok && r.status !== 404) {
    throw new Error('Delete failed (' + r.status + ')');
  }
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsWriteTodo(settings, todo, skipSyncTouch) {
  var r = await fetch(todoDocUrl(settings, todo.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(todo)) });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok) {
    var e = await r.json();
    throw new Error(e.error && e.error.message ? e.error.message : 'Todo write failed');
  }
}

/** @param {boolean} skipSyncTouch - If true, do NOT update the global gatekeeper timestamp. */
async function fsDeleteTodo(settings, qname, skipSyncTouch) {
  var r = await fetch(todoDocUrl(settings, qname), { method: 'DELETE' });
  if (r.ok && !skipSyncTouch) {
    await bumpGlobalSyncTime(settings);
  } else if (!r.ok && r.status !== 404) {
    throw new Error('Todo delete failed (' + r.status + ')');
  }
}

async function fsReadAllDupGroups(settings) {
  var results = [], pt = null;
  do {
    var r = await fetch(dupListUrl(settings, pt));
    if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error('Read failed: ' + (e.error && e.error.message ? e.error.message : r.status)); }
    var d = await r.json();
    if (d.documents) d.documents.forEach(function (doc) { results.push(fromFS(doc)); });
    pt = d.nextPageToken || null;
  } while (pt);
  return results;
}

async function fsReadAllTodos(settings) {
  var results = [], pt = null;
  do {
    var r = await fetch(todoListUrl(settings, pt));
    if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error('Todo read failed: ' + (e.error && e.error.message ? e.error.message : r.status)); }
    var d = await r.json();
    if (d.documents) d.documents.forEach(function (doc) { results.push(fromFS(doc)); });
    pt = d.nextPageToken || null;
  } while (pt);
  return results;
}

async function fsReadAll(settings) {
  var results = [];
  for (var i = 0; i < KNOWN_SUBJECTS.length; i++) {
    var subj = KNOWN_SUBJECTS[i], pt = null;
    do {
      var r = await fetch(pyqsListUrl(settings, subj, pt));
      if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Read failed'); }
      var d = await r.json();
      if (d.documents) d.documents.forEach(function (doc) { results.push(fromFS(doc)); });
      pt = d.nextPageToken || null;
    } while (pt);
  }
  return results;
}

async function fsRunQuery(settings, collectionId, parentPath, sinceTs) {
  var base = fsBase(settings);
  var parent = parentPath ? (base + '/' + parentPath) : base;
  var url = parent + ':runQuery?key=' + settings.firebaseApiKey;
  var query = {
    structuredQuery: {
      from: [{ collectionId: collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'updated_at' },
          op: 'GREATER_THAN',
          value: { integerValue: String(sinceTs) }
        }
      }
    }
  };
  var r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query)
  });
  if (!r.ok) {
    if (r.status === 404) return [];
    var e = await r.json();
    throw new Error('runQuery failed: ' + (e.error && e.error.message ? e.error.message : r.status));
  }
  var results = await r.json();
  return results
    .filter(function(row) { return row.document && row.document.fields; })
    .map(function(row) { return fromFS(row.document); });
}

async function fsReadDeltaEntries(settings, sinceTs) {
  var promises = KNOWN_SUBJECTS.map(function(subj) {
    return fsRunQuery(settings, 'PYQS', 'subjects/' + subjectKey(subj), sinceTs)
      .catch(function() { return []; });
  });
  var results = await Promise.all(promises);
  return [].concat.apply([], results);
}

async function fsReadDeltaTodos(settings, sinceTs) {
  return fsRunQuery(settings, 'todos', null, sinceTs).catch(function() { return []; });
}

async function fsReadDeltaDups(settings, sinceTs) {
  return fsRunQuery(settings, 'duplicates', null, sinceTs).catch(function() { return []; });
}

var LOCAL_SYNC_TIME_KEY = 'ib_firebase_sync_time';
var PENDING_CHANGES_KEY = 'ib_pending_changes';
var MAX_PENDING_CHANGES = 500;

function metaSyncUrl(settings) {
  return fsBase(settings) + '/meta/sync_state?key=' + settings.firebaseApiKey;
}

async function getLocalSyncTime() {
  try {
    var s = await chrome.storage.local.get([LOCAL_SYNC_TIME_KEY]);
    return s[LOCAL_SYNC_TIME_KEY] || 0;
  } catch (e) { return 0; }
}

async function setLocalSyncTime(ts) {
  try { await chrome.storage.local.set({ [LOCAL_SYNC_TIME_KEY]: ts }); } catch (e) {}
}

async function getRemoteSyncTime(settings) {
  try {
    var r = await fetch(metaSyncUrl(settings));
    if (!r.ok) return 0;
    var d = await r.json();
    return d.fields && d.fields.last_sync_time ? Number(d.fields.last_sync_time.integerValue) : 0;
  } catch (e) { return 0; }
}

async function setRemoteSyncTime(settings, ts) {
  await fetch(metaSyncUrl(settings), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { last_sync_time: { integerValue: String(ts) } } })
  });
}

async function bumpGlobalSyncTime(settings) {
  if (!settings || settings.mode !== 'firebase' || !settings.firebaseApiKey || !settings.firebaseProjectId) return;
  var T_new = Date.now();
  try {
    await setRemoteSyncTime(settings, T_new);
    await setLocalSyncTime(T_new);
    console.log('[IB Sync] Gatekeeper Cloud Update Success: Sync Time advanced to ' + T_new);
  } catch (e) {
    console.error('[IB Sync] Failed to bump global sync time:', e.message);
  }
}

async function getPendingChanges() {
  try {
    var s = await chrome.storage.local.get([PENDING_CHANGES_KEY]);
    return s[PENDING_CHANGES_KEY] || [];
  } catch (e) { return []; }
}

async function clearPendingChanges() {
  try { await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: [] }); } catch (e) {}
}

async function recordChange(collection, op, key, data) {
  try {
    var changes = await getPendingChanges();
    changes = changes.filter(function(c) { return !(c.collection === collection && c.key === key); });
    changes.push({
      id: Date.now() + '_' + Math.random().toString(36).slice(2),
      collection: collection, op: op, key: key, data: data || null, ts: Date.now()
    });
    if (changes.length > MAX_PENDING_CHANGES) {
      changes = changes.slice(changes.length - MAX_PENDING_CHANGES);
    }
    await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: changes });
  } catch (e) {}
}

async function loadCache() {
  try { 
    var s = await chrome.storage.local.get([CACHE_KEY, 'ib_todos_cache']); 
    var entries = s[CACHE_KEY] || []; 
    var todos = s['ib_todos_cache'] || [];
    var dirty = false;
    for (var i = 0; i < entries.length; i++) {
        if (entries[i].todo_date) {
            if (!todos.some(function(t) { return t.question_name === entries[i].question_name; })) {
                todos.push({
                    question_name: entries[i].question_name,
                    subject: entries[i].subject || KNOWN_SUBJECTS[KNOWN_SUBJECTS.length - 1],
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
        await chrome.storage.local.set({ [CACHE_KEY]: entries, ib_todos_cache: todos });
    }
    return entries; 
  } catch (e) { return []; }
}
async function saveCache(entries) { try { await chrome.storage.local.set({ [CACHE_KEY]: entries }); } catch (e) { } }
async function loadTodos() { try { var s = await chrome.storage.local.get(['ib_todos_cache']); return s['ib_todos_cache'] || []; } catch (e) { return []; } }
async function saveTodos(todos) { try { await chrome.storage.local.set({ ib_todos_cache: todos }); } catch (e) { } }
async function loadDuplicates() { try { var s = await chrome.storage.local.get(['ib_duplicates_cache']); return s['ib_duplicates_cache'] || []; } catch (e) { return []; } }
async function saveDuplicates(groups) { try { await chrome.storage.local.set({ ib_duplicates_cache: groups }); } catch (e) { } }
async function loadRejectedGroups() { try { var s = await chrome.storage.local.get(['ib_rejected_duplicates']); return s['ib_rejected_duplicates'] || []; } catch (e) { return []; } }
async function saveRejectedGroups(groups) { try { await chrome.storage.local.set({ ib_rejected_duplicates: groups }); } catch (e) { } }
async function getSettings() { try { var s = await chrome.storage.local.get([SETTINGS_KEY]); return s[SETTINGS_KEY] || {}; } catch (e) { return {}; } }

function mergeEntries(remote, local, pendingChanges, isFirstSync, isDelta) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'entries') localChanges[c.key] = c; });
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) {
    var name = e.question_name, change = localChanges[name];
    if (map[name]) {
      if (change && change.op !== 'delete' && change.data) map[name] = change.data;
    } else {
      if (isFirstSync || isDelta) map[name] = e;
      else if (change && (change.op === 'add' || change.op === 'update')) map[name] = change.data || e;
    }
  });
  var arr = Object.values(map);
  arr.sort(function(a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
}

function mergeTodos(remote, local, pendingChanges, isFirstSync, isDelta) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'todos') localChanges[c.key] = c; });
  var map = {};
  remote.forEach(function(e) { map[e.question_name] = e; });
  local.forEach(function(e) {
    var name = e.question_name, change = localChanges[name];
    if (map[name]) { if (change && change.op === 'delete') delete map[name]; }
    else {
      if (isFirstSync || isDelta) map[name] = e;
      else if (change && (change.op === 'add' || change.op === 'update')) map[name] = change.data || e;
    }
  });
  return Object.values(map);
}

function mergeDupGroups(remote, local, pendingChanges, isFirstSync, isDelta) {
  pendingChanges = pendingChanges || [];
  var localChanges = {};
  pendingChanges.forEach(function(c) { if (c.collection === 'dups') localChanges[c.key] = c; });
  var map = {};
  remote.forEach(function(g) { map[g.id] = g; });
  local.forEach(function(g) {
    var change = localChanges[g.id];
    if (map[g.id]) { if (change && change.op !== 'delete' && change.data) map[g.id] = change.data; }
    else {
      if (isFirstSync || isDelta) map[g.id] = g;
      else if (change && (change.op === 'add' || change.op === 'update')) map[g.id] = change.data || g;
    }
  });
  return Object.values(map);
}
