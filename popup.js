// popup.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.currentData = null;
window.IB.allEntries = [];
window.IB.sidebarQuestions = [];
window.IB.appSettings = {};
window.IB.credentialsValid = false; // tracks whether Firebase credentials passed validation
window.IB.previousView = ''; // Tracks the previously active view

function useFirebase() {
  return window.IB.credentialsValid && window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId;
}

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

  if (!tab || !tab.url || !tab.url.includes('exam-mate.com')) {
    showPageError('Open an ExamMate page first,\nthen click the extension.');
    return;
  }
  try {
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
    if (response && response.error) showPageError(response.error);
    else if (response) { window.IB.currentData = response; renderCurrentQuestion(response); }
    else showPageError('No data returned. Try refreshing ExamMate.');
  } catch (e) { showPageError('Could not read the page.\nRefresh ExamMate and try again.'); }
});

chrome.runtime.onMessage.addListener(function(request) {
  if (request.action === 'switchToToday') {
    switchView('today');
  }
});

// Also handle popup unload (to show toast if closing from Settings view)
window.addEventListener('blur', function () {
  if (window.IB.previousView === 'settings') {
    showStatusToast();
  }
});
