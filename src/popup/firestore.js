// firestore.js — Firebase and Firestore helpers for the popup

window.IB = window.IB || {};

// ── Firebase credential validation ───────────────────────────────────────────

export async function validateFirebaseCredentials(projectId, apiKey) {
  if (!projectId || !apiKey) return { ok: false, error: 'Project ID and API Key are required.' };

  if (!apiKey.startsWith('AIza') || apiKey.length < 35) {
    return { ok: false, error: 'Invalid API key format. Verify it starts with "AIza...".' };
  }

  try {
    var authUrl = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=' + apiKey;
    var authRes = await fetch(authUrl, { method: 'POST', body: JSON.stringify({ returnSecureToken: true }), headers: { 'Content-Type': 'application/json' } });
    var authBody = await authRes.json();
    if (authRes.status === 400 && authBody.error && authBody.error.message === 'API_KEY_INVALID') {
      return { ok: false, error: 'API key is formally invalid or does not exist on Google Cloud.' };
    }

    // Try listing the subjects collection (pageSize=1 — fast and cheap)
    var url = 'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/subjects?key=' + apiKey + '&pageSize=1';
    var r = await fetch(url);
    if (r.status === 200 || r.status === 404) {
      return { ok: true };
    }
    var body = await r.json();
    var msg = body.error && body.error.message ? body.error.message : 'HTTP ' + r.status;
    if (r.status === 400) return { ok: false, error: 'Invalid API key or project ID. (' + msg + ')' };
    if (r.status === 403) return { ok: false, error: 'Access denied — check Firestore rules and API key restrictions. (' + msg + ')' };
    return { ok: false, error: msg };
  } catch (e) {
    return { ok: false, error: 'Network error — could not reach Firebase: ' + e.message };
  }
}
window.IB.validateFirebaseCredentials = validateFirebaseCredentials;

// ── Firestore URL builders ────────────────────────────────────────────────────

export function safeId(str) { return (str || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_'); }
export function subjectKey(s) { return (s || 'other').toLowerCase(); }
export function fsBase() { return 'https://firestore.googleapis.com/v1/projects/' + window.IB.appSettings.firebaseProjectId + '/databases/(default)/documents'; }
export function qDocUrl(subject, qname) { return fsBase() + '/subjects/' + subjectKey(subject) + '/PYQS/' + safeId(qname) + '?key=' + window.IB.appSettings.firebaseApiKey; }
export function subjectDocUrl(subject) { return fsBase() + '/subjects/' + subjectKey(subject) + '?key=' + window.IB.appSettings.firebaseApiKey; }
export function pyqsListUrl(subject, pt) {
  var url = fsBase() + '/subjects/' + subjectKey(subject) + '/PYQS?key=' + window.IB.appSettings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}
export function dupGroupUrl(groupId) { return fsBase() + '/duplicates/' + safeId(groupId) + '?key=' + window.IB.appSettings.firebaseApiKey; }
export function dupListUrl(pt) {
  var url = fsBase() + '/duplicates?key=' + window.IB.appSettings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
}

window.IB.safeId = safeId;
window.IB.subjectKey = subjectKey;
window.IB.fsBase = fsBase;
window.IB.qDocUrl = qDocUrl;
window.IB.subjectDocUrl = subjectDocUrl;
window.IB.pyqsListUrl = pyqsListUrl;
window.IB.dupGroupUrl = dupGroupUrl;
window.IB.dupListUrl = dupListUrl;

// ── Firestore converters ──────────────────────────────────────────────────────

export function toFS(obj) {
  var fields = {};
  Object.keys(obj).forEach(function(k) {
    var v = obj[k];
    if (v === null || v === undefined)  fields[k] = { nullValue: null };
    else if (typeof v === 'boolean')    fields[k] = { booleanValue: v };
    else if (typeof v === 'number')     fields[k] = { integerValue: String(v) };
    else if (Array.isArray(v))          fields[k] = { arrayValue: { values: v.map(function(x) { return { stringValue: String(x) }; }) } };
    else if (typeof v === 'object')     fields[k] = { mapValue: toFS(v) };
    else                                fields[k] = { stringValue: String(v) };
  });
  return { fields: fields };
}

export function fromFS(doc) {
  var obj = {}, fields = doc.fields || {};
  Object.keys(fields).forEach(function(k) {
    var f = fields[k];
    if (f.stringValue !== undefined)      obj[k] = f.stringValue;
    else if (f.integerValue !== undefined) obj[k] = Number(f.integerValue);
    else if (f.booleanValue !== undefined) obj[k] = f.booleanValue;
    else if (f.nullValue !== undefined)    obj[k] = null;
    else if (f.arrayValue !== undefined)   obj[k] = (f.arrayValue.values || []).map(function(v) { return v.stringValue !== undefined ? v.stringValue : String(Object.values(v)[0]); });
    else if (f.mapValue !== undefined)     obj[k] = fromFS(f.mapValue);
    else obj[k] = null;
  });
  return obj;
}

window.IB.toFS = toFS;
window.IB.fromFS = fromFS;

// ── Firestore ops ─────────────────────────────────────────────────────────────

export async function fsWrite(entry) {
  await fetch(subjectDocUrl(entry.subject), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { subject: { stringValue: subjectKey(entry.subject) } } }) });
  var r = await fetch(qDocUrl(entry.subject, entry.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(entry)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Write failed (' + r.status + ')'); }
}

export async function fsWriteDupGroup(group) {
  var r = await fetch(dupGroupUrl(group.id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(toFS(group)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Dup write failed (' + r.status + ')'); }
}

export async function fsReadAllDupGroups() {
  var results = [], pt = null;
  do {
    var r = await fetch(dupListUrl(pt));
    if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error('Read failed: ' + (e.error && e.error.message ? e.error.message : r.status)); }
    var d = await r.json();
    if (d.documents) d.documents.forEach(function(doc) { results.push(fromFS(doc)); });
    pt = d.nextPageToken || null;
  } while (pt);
  return results;
}

export async function fsDelete(subject, qname) {
  var r = await fetch(qDocUrl(subject, qname), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('Delete failed (' + r.status + ')');
}

export async function fsReadAll() {
  var results = [];
  for (var i = 0; i < window.IB.KNOWN_SUBJECTS.length; i++) {
    var subj = window.IB.KNOWN_SUBJECTS[i], pt = null;
    do {
      var r = await fetch(pyqsListUrl(subj, pt));
      if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error('Read failed: ' + (e.error && e.error.message ? e.error.message : r.status)); }
      var d = await r.json();
      if (d.documents) d.documents.forEach(function (doc) { results.push(fromFS(doc)); });
      pt = d.nextPageToken || null;
    } while (pt);
  }
  return results;
}

window.IB.fsWrite = fsWrite;
window.IB.fsWriteDupGroup = fsWriteDupGroup;
window.IB.fsReadAllDupGroups = fsReadAllDupGroups;
window.IB.fsDelete = fsDelete;
window.IB.fsReadAll = fsReadAll;
