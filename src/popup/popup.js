// popup.js — Main logic for IB Exam Logger popup
import { loadSettings, loadCache, loadDuplicates } from './storage.js';
import { validateFirebaseCredentials } from './firestore.js';
import { 
  switchView, renderCurrentQuestion, renderEntryList, renderFavouritesPanel, 
  showPageError, showStatusToast 
} from './popup-render.js';
import { 
  logCurrent, logAll, syncFromFirestore, exportJSON, clearAll, updateSyncBtnState 
} from './popup-actions.js';
import { populateSettingsUI, setMode, saveSettings, useFirebase } from './popup-settings.js';
import { initDuplicateModal, openDuplicateModal, closeDuplicateModal } from './popup-duplicates.js';

window.IB = window.IB || {};

// Global state moved to window.IB for across-module access
window.IB.currentData = null;
window.IB.allEntries = [];
window.IB.sidebarQuestions = [];
window.IB.appSettings = {};
window.IB.duplicatesDB = [];
window.IB.credentialsValid = false; // tracks whether Firebase credentials passed validation
window.IB.previousView = ''; // Tracks the previously active view

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
  // 1. Load basic settings
  window.IB.appSettings = await loadSettings();

  // 2. Validate credentials silently on load if Firebase mode
  if (window.IB.appSettings.mode === 'firebase' && window.IB.appSettings.firebaseApiKey && window.IB.appSettings.firebaseProjectId) {
    var check = await validateFirebaseCredentials(window.IB.appSettings.firebaseProjectId, window.IB.appSettings.firebaseApiKey);
    window.IB.credentialsValid = check.ok;
    if (!check.ok) window.IB.appSettings._credError = check.error;
  } else {
    window.IB.credentialsValid = false;
  }

  // 3. Setup Navigation
  window.IB.previousView = 'log'; // Initial view
  document.getElementById('btn-log-view').addEventListener('click', function () { switchView('log'); });
  document.getElementById('btn-today-view').addEventListener('click', function () { switchView('today'); });
  document.getElementById('btn-favourites-view').addEventListener('click', function () { switchView('favourites'); });
  document.getElementById('btn-db-view').addEventListener('click', function () { switchView('db'); });
  document.getElementById('btn-settings-view').addEventListener('click', function () { switchView('settings'); });
  document.getElementById('btn-dups-view').addEventListener('click', function () { switchView('dups'); });
  document.getElementById('dup-modal-close-btn').addEventListener('click', closeDuplicateModal);

  // 4. Trigger new group modal from Dups panel toolbar
  document.getElementById('dups-new-btn').addEventListener('click', function () {
    var currentQ = window.IB.currentData ? window.IB.currentData.question_name : '';
    openDuplicateModal(currentQ);
  });

  // 5. Init duplicate modal event wiring
  initDuplicateModal();

  // 6. Log panel actions
  document.getElementById('log-btn').addEventListener('click', logCurrent);
  document.getElementById('log-all-btn').addEventListener('click', logAll);

  // 7. DB panel actions
  document.getElementById('sync-btn').addEventListener('click', function () { syncFromFirestore(false); });
  document.getElementById('export-btn').addEventListener('click', exportJSON);
  document.getElementById('clear-btn').addEventListener('click', clearAll);
  document.getElementById('db-filter').addEventListener('input', renderEntryList);
  document.getElementById('more-btn').addEventListener('click', function (e) {
    e.stopPropagation();
    document.getElementById('more-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', function () { document.getElementById('more-dropdown').classList.remove('open'); });

  // 8. Favourites panel
  document.getElementById('fav-filter').addEventListener('input', renderFavouritesPanel);

  // 9. Settings panel actions
  document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
  document.getElementById('mode-local').addEventListener('click', function () { setMode('local'); });
  document.getElementById('mode-firebase').addEventListener('click', function () { setMode('firebase'); });

  // 10. Load cached data and sync UI
  window.IB.allEntries = await loadCache();
  window.IB.duplicatesDB = await loadDuplicates();
  updateSyncBtnState();
  populateSettingsUI();

  // 11. Silent background sync
  syncFromFirestore(true);

  // 12. Scrape current page
  var tab;
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
  } catch (e) { showPageError('Could not access browser tabs.'); return; }

  if (!tab || !tab.url || !tab.url.includes('exam-mate.com/topicalpastpapers')) {
    showPageError('Open an ExamMate topical past papers page first,\nthen click the extension.');
    return;
  }
  
  // Scrape with retry for Livewire sync
  var MAX_RETRIES = 3;
  var RETRY_DELAY_MS = 800;
  for (var attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrape' });
      if (response && response.error === 'Could not parse onclick data.' && attempt < MAX_RETRIES) {
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
    openDuplicateModal(currentQ);
  }
});

// Also handle popup unload (to show toast if closing from Settings view)
window.addEventListener('blur', function () {
  if (window.IB.previousView === 'settings') {
    showStatusToast();
  }
});
