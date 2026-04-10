// popup.js — IB Exam Logger

window.IB = window.IB || {};

window.IB.currentData = null;
window.IB.allEntries = [];
window.IB.sidebarQuestions = [];
window.IB.appSettings = {};
window.IB.duplicatesDB = [];
window.IB.credentialsValid = false; // tracks whether Firebase credentials passed validation
window.IB.previousView = ''; // Tracks the previously active view
window.IB.dbShowTodos = false;
window.IB.dbShowDups = false;

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

  document.getElementById('dups-rescan-btn').addEventListener('click', async function() {
    var btn = this;
    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⌛ Scanning...';

    console.log('[IB] Requesting rescan for active tab...');
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function(tabs) {
      var tab = tabs[0];
      if (!tab) {
        // Fallback to current window if lastFocused fails (rare)
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs2) {
          processTab(tabs2[0]);
        });
      } else {
        processTab(tab);
      }
    });

    function processTab(target) {
      if (!target) {
        console.error('[IB] No active tab found.');
        showMsg('error', 'Could not find an active tab.');
        btn.disabled = false; btn.innerHTML = originalText;
        return;
      }
      
      console.log('[IB] Target Tab:', target.id, target.url);
      if (!(target.url || '').includes('exam-mate.com')) {
        showMsg('error', 'Please navigate to an ExamMate page to use the Pixel Engine.');
        btn.disabled = false; btn.innerHTML = originalText;
        return;
      }
      
      // Phase 1: Ping handshake
      var pingTimedOut = false;
      var pingTimer = setTimeout(function() {
        pingTimedOut = true;
        console.error('[IB] Ping Handshake Timed Out.');
        showMsg('error', 'Content script not responding. Refresh the page!');
        btn.disabled = false; btn.innerHTML = originalText;
      }, 1000);

      chrome.tabs.sendMessage(target.id, { action: 'ping' }, function(response) {
        if (pingTimedOut) return;
        clearTimeout(pingTimer);

        if (chrome.runtime.lastError || !(response && response.pong)) {
          console.log('[IB] Ping Failed, attempting scripting fail-safe...');
          // Fail-safe: Direct execution via chrome.scripting
          chrome.scripting.executeScript({
            target: { tabId: target.id },
            func: () => {
              if (window.IB && typeof window.IB.rescanPage === 'function') {
                window.IB.rescanPage();
              } else if (typeof autoFindDuplicates === 'function') {
                autoFindDuplicates(true);
              }
            }
          }, () => {
            showMsg('success', 'Pixel scan initiated (via fail-safe)!');
            setTimeout(() => { btn.disabled = false; btn.innerHTML = originalText; }, 1500);
          });
        } else {
          console.log('[IB] Ping OK. Sending rescanDuplicates...');
          chrome.tabs.sendMessage(target.id, { action: 'rescanDuplicates' }, function(res) {
             showMsg('success', 'Pixel scan initiated! Check the ExamMate page for updates.');
             setTimeout(function() {
               btn.disabled = false;
               btn.innerHTML = originalText;
             }, 1500);
          });
        }
      });
    }
  });

  // Init duplicate modal event wiring
  window.IB.initDuplicateModal();

  // Log panel
  document.getElementById('log-btn').addEventListener('click', logCurrent);
  document.getElementById('log-all-btn').addEventListener('click', logAll);

  // DB panel
  var dbFilterMenuBtn = document.getElementById('db-filter-menu-btn');
  var dbFilterDropdown = document.getElementById('db-filter-dropdown');
  if (dbFilterMenuBtn && dbFilterDropdown) {
    dbFilterMenuBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      dbFilterDropdown.style.display = dbFilterDropdown.style.display === 'block' ? 'none' : 'block';
    });
    dbFilterDropdown.addEventListener('click', function(e) { e.stopPropagation(); });
    document.addEventListener('click', function() { dbFilterDropdown.style.display = 'none'; });
  }

  var dbChkTodos = document.getElementById('db-chk-todos');
  if (dbChkTodos) {
    dbChkTodos.addEventListener('change', function() {
      window.IB.dbShowTodos = this.checked;
      if (typeof renderEntryList === 'function') renderEntryList();
    });
  }
  var dbChkDups = document.getElementById('db-chk-dups');
  if (dbChkDups) {
    dbChkDups.addEventListener('change', function() {
      window.IB.dbShowDups = this.checked;
      if (typeof renderEntryList === 'function') renderEntryList();
    });
  }

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
  document.getElementById('rerun-migration-btn').addEventListener('click', async function() {
    if (!confirm('Re-run the V2 migration? This will perform a deep cleanup and URL discovery sweep. Your duplicate groups will stay, but their data will be optimized.')) return;
    await window.IB.startFullMigration(true);
  });
  document.getElementById('clean-dups-btn').addEventListener('click', function() {
    if (!confirm('Clean violating duplicates? This will remove all duplicate groups that violate the strict nomenclature rule.')) return;
    var btn = this;
    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '⌛ Cleaning...';
    chrome.runtime.sendMessage({ action: 'cleanViolatingDups' }, function(res) {
       btn.disabled = false;
       btn.innerHTML = originalText;
       if (res && res.ok) {
         if (typeof showMsg === 'function') showMsg('success', 'Cleaned ' + (res.removedCount || 0) + ' violating groups.');
         setTimeout(function() { window.location.reload(); }, 1500);
       } else {
         if (typeof showMsg === 'function') showMsg('error', 'Error cleaning groups.');
       }
    });
  });

  // Load cache, update sync btn state, populate settings
  window.IB.allEntries = await window.IB.loadCache();
  window.IB.duplicatesDB = await window.IB.loadDuplicates();
  updateSyncBtnState();
  populateSettingsUI();

  // Check for V2 Migration
  chrome.storage.local.get(['ib_v2_migrated'], async function(res) {
    if (!res.ib_v2_migrated) {
      await window.IB.startFullMigration();
    }
  });

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
