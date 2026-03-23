// popup-settings.js — Settings panel logic for IB Exam Logger

function populateSettingsUI() {
  var displayMode = window.IB.appSettings.mode || 'local';

  document.getElementById('mode-local').classList.toggle('active', displayMode === 'local');
  document.getElementById('mode-firebase').classList.toggle('active', displayMode === 'firebase');
  document.getElementById('firebase-section').style.display = displayMode === 'firebase' ? 'block' : 'none';
  document.getElementById('local-only-note').style.display = displayMode === 'local' ? 'block' : 'none';

  // Credential status badge
  var credEl = document.getElementById('cred-status');
  if (window.IB.appSettings.mode === 'firebase') {
    credEl.style.display = 'flex';
    if (window.IB.credentialsValid) {
      credEl.className = 'cred-status ok';
      credEl.textContent = '✓ Firebase connected';
    } else if (window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId) {
      credEl.className = 'cred-status fail';
      credEl.textContent = '✗ Credentials invalid — using local mode';
    } else {
      credEl.className = 'cred-status checking';
      credEl.textContent = 'Enter credentials below to connect Firebase';
    }
  } else {
    credEl.style.display = 'none';
  }

  document.getElementById('s-project-id').value = window.IB.appSettings.firebaseProjectId || '';
  document.getElementById('s-api-key').value = window.IB.appSettings.firebaseApiKey || '';


  // Show saved error if credentials failed previously
  var errEl = document.getElementById('settings-error');
  var fallbackEl = document.getElementById('settings-fallback');
  if (window.IB.appSettings.mode === 'firebase' && !window.IB.credentialsValid && window.IB.appSettings._credError) {
    errEl.textContent = window.IB.appSettings._credError;
    errEl.style.display = 'block';
    fallbackEl.style.display = 'block';
  } else {
    errEl.style.display = 'none';
    fallbackEl.style.display = 'none';
  }
}

function setMode(mode) {
  window.IB.appSettings.mode = mode;
  document.getElementById('mode-local').classList.toggle('active', mode === 'local');
  document.getElementById('mode-firebase').classList.toggle('active', mode === 'firebase');
  document.getElementById('firebase-section').style.display = mode === 'firebase' ? 'block' : 'none';
  document.getElementById('local-only-note').style.display = mode === 'local' ? 'block' : 'none';
  // Clear cred status when switching modes
  var credEl = document.getElementById('cred-status');
  credEl.style.display = mode === 'firebase' ? 'flex' : 'none';
  if (mode === 'firebase') { credEl.className = 'cred-status checking'; credEl.textContent = 'Click "Save & verify" to test credentials'; }
  document.getElementById('settings-error').style.display = 'none';
  document.getElementById('settings-fallback').style.display = 'none';
}

async function saveSettings() {
  var pid = document.getElementById('s-project-id').value.trim();
  var akey = document.getElementById('s-api-key').value.trim();
  var mode = window.IB.appSettings.mode || 'local';

  var btn = document.getElementById('save-settings-btn');
  var errEl = document.getElementById('settings-error');
  var fallbackEl = document.getElementById('settings-fallback');
  var savedEl = document.getElementById('settings-saved');
  var credEl = document.getElementById('cred-status');

  errEl.style.display = 'none';
  fallbackEl.style.display = 'none';
  savedEl.style.display = 'none';
  btn.textContent = 'Verifying...';
  btn.disabled = true;

  window.IB.credentialsValid = false;

  if (mode === 'firebase') {
    credEl.style.display = 'flex';
    credEl.className = 'cred-status checking';
    credEl.textContent = 'Checking credentials...';

    var check = await window.IB.validateFirebaseCredentials(pid, akey);
    if (check.ok) {
      window.IB.credentialsValid = true;
      credEl.className = 'cred-status ok';
      credEl.textContent = '✓ Firebase connected';
    } else {
      window.IB.credentialsValid = false;
      credEl.className = 'cred-status fail';
      credEl.textContent = '✗ Connection failed';
      errEl.textContent = check.error;
      errEl.style.display = 'block';
      fallbackEl.style.display = 'block';
      // (Keep Firebase tab active — user can see the error and decide what to do)
    }
  } else {
    credEl.style.display = 'none';
  }

  // Always save whatever was entered, but record credError
  var newSettings = {
    initialized: true, mode: mode,
    firebaseProjectId: pid, firebaseApiKey: akey,
    _credError: (mode === 'firebase' && !window.IB.credentialsValid) ? (errEl.textContent || 'Unknown error') : '',
  };
  await chrome.storage.local.set({ [window.IB.SETTINGS_KEY]: newSettings });
  window.IB.appSettings = newSettings;
  updateSyncBtnState();

  btn.textContent = 'Save & verify';
  btn.disabled = false;

  if (window.IB.credentialsValid || mode === 'local') {
    savedEl.style.display = 'block';
    setTimeout(function () { savedEl.style.display = 'none'; }, 2500);
    if (useFirebase()) syncFromFirestore(false);
  }
}
