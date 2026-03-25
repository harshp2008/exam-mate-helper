// popup.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.currentData = null;
window.IB.allEntries = [];
window.IB.sidebarQuestions = [];
window.IB.appSettings = {};
window.IB.duplicatesDB = [];
window.IB.credentialsValid = false; // tracks whether Firebase credentials passed validation
window.IB.previousView = ''; // Tracks the previously active view

function useFirebase() {
  return window.IB.credentialsValid && window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId;
}

window.IB.isNonPrimaryDuplicate = function(name) {
  if (!name) return false;
  
  // Normalize: if the name starts with "DUPLICATE [" and ends with "]", strip it
  var cleanName = name;
  if (name.indexOf('DUPLICATE [') === 0 && name.lastIndexOf(']') === name.length - 1) {
    cleanName = name.substring(11, name.length - 1);
  }

  var groups = window.IB.duplicatesDB || [];
  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    // Check clean name against the group's primary and list
    if (g.primary !== cleanName && (g.questions || []).indexOf(cleanName) !== -1) return g.primary;
  }
  return false;
};

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  window.IB.appSettings = await window.IB.loadSettings();

  // Validate credentials silently on load if Firebase mode
  if (window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId) {
    var check = await window.IB.validateFirebaseCredentials(window.IB.appSettings.firebaseProjectId, window.IB.appSettings.firebaseApiKey);
    window.IB.credentialsValid = check.ok;
    if (!check.ok) window.IB.appSettings._credError = check.error;
  } else {
    window.IB.credentialsValid = false;
  }

  // Nav
  window.IB.previousView = 'log'; // Initial view
  document.getElementById('btn-log-view').addEventListener('click', function () { switchView('log'); });
  document.getElementById('btn-today-view').addEventListener('click', function () { switchView('today'); });
  document.getElementById('btn-favourites-view').addEventListener('click', function () { switchView('favourites'); });
  document.getElementById('btn-db-view').addEventListener('click', function () { switchView('db'); });
  document.getElementById('btn-settings-view').addEventListener('click', function () { switchView('settings'); });
  document.getElementById('btn-dups-view').addEventListener('click', function () { switchView('dups'); });
  document.getElementById('dup-modal-close-btn').addEventListener('click', window.IB.closeDuplicateModal);

  // Trigger new group modal from Dups panel toolbar
  document.getElementById('dups-new-btn').addEventListener('click', function () {
    var currentQ = window.IB.currentData ? window.IB.currentData.question_name : '';
    window.IB.openDuplicateModal(currentQ);
  });

  // Init duplicate modal event wiring
  window.IB.initDuplicateModal();

  // Log panel
  document.getElementById('log-btn').addEventListener('click', logCurrent);
  document.getElementById('log-all-btn').addEventListener('click', logAll);

  // DB panel
  document.getElementById('sync-btn').addEventListener('click', function () { syncFromFirestore(false); });
  document.getElementById('export-btn').addEventListener('click', exportJSON);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('db-filter').addEventListener('input', renderEntryList);
  document.getElementById('more-btn').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('more-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', function () { document.getElementById('more-dropdown').classList.remove('open'); });

  // Favourites panel
  document.getElementById('fav-filter').addEventListener('input', renderFavouritesPanel);

  // Settings
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('mode-local').addEventListener('click', function () { setMode('local'); });
  document.getElementById('mode-firebase').addEventListener('click', function () { setMode('firebase'); });

  // Load cache, update sync btn state, populate settings
  window.IB.allEntries = await window.IB.loadCache();
  window.IB.duplicatesDB = await window.IB.loadDuplicates();
  updateSyncBtnState();
  populateSettingsUI();

  // Background sync
  syncFromFirestore(true);

  // Scrape current page
  var tab;
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (e) { showPageError('Could not access browser tabs.'); return; }

  if (!tab || !tab.url || !tab.url.includes('exam-mate.com/topicalpastpapers')) {
    showPageError('Open an ExamMate topical past papers page first,\nthen click the extension.');
    return;
  }
  // Scrape with retry — ExamMate (Livewire) sometimes hasn't embedded onclick
  // data into the active sidebar <li> yet when the page first loads.
  // content.js auto-clicks the li after 600ms to force Livewire to attach it;
  // we retry here to give that a chance to complete before showing an error.
  var MAX_RETRIES = 3;
  var RETRY_DELAY_MS = 800;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
      if (response && response.error === 'Could not parse onclick data.' && attempt < MAX_RETRIES) {
        // Livewire data not ready yet — wait and retry silently
        await new Promise(function(r) { setTimeout(r, RETRY_DELAY_MS); });
        continue;
      }
      if (response && response.error) { showPageError(response.error); break; }
      if (response) { window.IB.currentData = response; renderCurrentQuestion(response); break; }
      showPageError('No data returned. Try refreshing ExamMate.');
      break;
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise(function(r) { setTimeout(r, RETRY_DELAY_MS); });
      } else {
        showPageError('Could not read the page.\nRefresh ExamMate and try again.');
      }
    }
  }
});

chrome.runtime.onMessage.addListener(function(request) {
  if (request.action === 'switchToToday') {
    switchView('today');
  }
  if (request.action === 'openDuplicateModal' || request.action === 'openDuplicateModalInPopup') {
    var currentQ = window.IB.currentData ? window.IB.currentData.question_name : (request.questionName || '');
    window.IB.openDuplicateModal(currentQ);
  }
});

// Also handle popup unload (to show toast if closing from Settings view)
window.addEventListener('blur', function () {
  if (window.IB.previousView === 'settings') {
    showStatusToast();
  }
});
