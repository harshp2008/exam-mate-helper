// firestore.js — IB Exam Logger

window.IB = window.IB || {};

// ── Firebase credential validation ───────────────────────────────────────────
// Makes a lightweight read to verify the key + project are reachable

window.IB.validateFirebaseCredentials = async function(projectId, apiKey) {
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
      // 200 = collection exists, 404 = project exists but collection empty — both are valid credentials
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
};

// ── Firestore URL builders ────────────────────────────────────────────────────

window.IB.safeId = function(str) { return (str || 'unknown').replace(/[^a-zA-Z0-9_\-]/g, '_'); };
window.IB.subjectKey = function(s) { return (s || 'other').toLowerCase(); };
window.IB.fsBase = function() { return 'https://firestore.googleapis.com/v1/projects/' + window.IB.appSettings.firebaseProjectId + '/databases/(default)/documents'; };
window.IB.qDocUrl = function(subject, qname) { return window.IB.fsBase() + '/subjects/' + window.IB.subjectKey(subject) + '/PYQS/' + window.IB.safeId(qname) + '?key=' + window.IB.appSettings.firebaseApiKey; };
window.IB.subjectDocUrl = function(subject) { return window.IB.fsBase() + '/subjects/' + window.IB.subjectKey(subject) + '?key=' + window.IB.appSettings.firebaseApiKey; };
window.IB.pyqsListUrl = function(subject, pt) {
  var url = window.IB.fsBase() + '/subjects/' + window.IB.subjectKey(subject) + '/PYQS?key=' + window.IB.appSettings.firebaseApiKey + '&pageSize=300';
  if (pt) url += '&pageToken=' + encodeURIComponent(pt);
  return url;
};

// ── Firestore converters ──────────────────────────────────────────────────────

window.IB.toFS = function(obj) {
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
};

window.IB.fromFS = function(doc) {
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
};

// ── Firestore ops ─────────────────────────────────────────────────────────────

window.IB.fsWrite = async function(entry) {
  await fetch(window.IB.subjectDocUrl(entry.subject), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { subject: { stringValue: window.IB.subjectKey(entry.subject) } } }) });
  var r = await fetch(window.IB.qDocUrl(entry.subject, entry.question_name), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(window.IB.toFS(entry)) });
  if (!r.ok) { var e = await r.json(); throw new Error(e.error && e.error.message ? e.error.message : 'Write failed (' + r.status + ')'); }
};

window.IB.fsDelete = async function(subject, qname) {
  var r = await fetch(window.IB.qDocUrl(subject, qname), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error('Delete failed (' + r.status + ')');
};

window.IB.fsReadAll = async function() {
  var results = [];
  for (var i = 0; i < window.IB.KNOWN_SUBJECTS.length; i++) {
    var subj = window.IB.KNOWN_SUBJECTS[i], pt = null;
    do {
      var r = await fetch(window.IB.pyqsListUrl(subj, pt));
      if (!r.ok) { if (r.status === 404) break; var e = await r.json(); throw new Error('Read failed: ' + (e.error && e.error.message ? e.error.message : r.status)); }
      var d = await r.json();
      if (d.documents) d.documents.forEach(function(doc) { results.push(window.IB.fromFS(doc)); });
      pt = d.nextPageToken || null;
    } while (pt);
  }
  return results;
};
