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

async function fsWrite(settings, entry) {
  await fetch(subjectDocUrl(settings, entry.subject), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { subject: { stringValue: subjectKey(entry.subject) } } }) });
  var r = await fetch(qDocUrl(settings, entry.subject, entry.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(entry)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Write failed'); }
}

function dupGroupUrl(settings, groupId) {
  return fsBase(settings) + '/duplicates/' + safeId(groupId) + '?key=' + settings.firebaseApiKey;
}
function dupListUrl(settings, pt) {
  var url = fsBase(settings) + '/duplicates?key=' + settings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}
async function fsWriteDupGroup(settings, group) {
  var r = await fetch(dupGroupUrl(settings, group.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(group)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Dup write failed'); }
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
      if (d.documents) d.documents.forEach(function (doc) { results.push(fromFS(doc)); });
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
  try { await chrome.storage.local.set({ [CACHE_KEY]: entries }); } catch (e) { }
}
async function loadDuplicates() {
  try { var s = await chrome.storage.local.get(['ib_duplicates_cache']); return s['ib_duplicates_cache'] || []; } catch (e) { return []; }
}
async function saveDuplicates(groups) {
  try { await chrome.storage.local.set({ ib_duplicates_cache: groups }); } catch (e) { }
}
async function loadRejectedGroups() {
  try { var s = await chrome.storage.local.get(['ib_rejected_duplicates']); return s['ib_rejected_duplicates'] || []; } catch (e) { return []; }
}
async function saveRejectedGroups(groups) {
  try { await chrome.storage.local.set({ ib_rejected_duplicates: groups }); } catch (e) { }
}
async function getSettings() {
  try { var s = await chrome.storage.local.get([SETTINGS_KEY]); return s[SETTINGS_KEY] || {}; } catch (e) { return {}; }
}

function mergeEntries(remote, local) {
  var map = {};
  remote.forEach(function (e) { map[e.question_name] = e; });
  local.forEach(function (e) { if (!map[e.question_name]) map[e.question_name] = e; });
  var arr = Object.values(map);
  arr.sort(function (a, b) { return (b.logged_at || '').localeCompare(a.logged_at || ''); });
  return arr;
}
