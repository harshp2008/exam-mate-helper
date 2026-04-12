// content-init.js — Initialization and persistent observer for IB Exam Logger

var _ibLastSyncResponse = null;
var _ibLastAutoUrl = ''; // V5 Guard: Tracks last processed URL to allow auto-run on navigation (Page 2, etc.)

// Set up a persistent observer on the body to catch when #questions-list1 is replaced/updated
function setupPersistentObserver() {
  if (window._ibPersistentObserver) return;
  var observer = new MutationObserver(function(mutations) {
    var needsInjection = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.addedNodes.length > 0) {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var node = m.addedNodes[j];
          if (node.nodeType === 1) { // Element node
            if (node.id === 'questions-list1' || node.querySelector('#questions-list1') || (node.tagName === 'LI' && node.id && node.id.startsWith('qid-'))) {
              needsInjection = true;
              break;
            }
          }
        }
      }
      if (needsInjection) break;
    }

    if (needsInjection) {
      clearTimeout(window.ibInjectionTimeout);
      window.ibInjectionTimeout = setTimeout(function() {
        triggerFullUiInjection(_ibLastSyncResponse);
      }, 250);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  window._ibPersistentObserver = observer;
}

/**
 * MASTER INJECTOR: Handles Done, Dup, Copy, and Sidebar in one go.
 */
function triggerFullUiInjection(syncResponse) {
    console.log('[IB] Triggering Master Injection Loop...');
    
    // 1. Structural Injections
    if (typeof injectDoneCheckboxes === 'function') injectDoneCheckboxes();
    
    if (typeof injectDupButton === 'function') {
        injectDupButton();
        // Catch-up pulses for slow navbars
        setTimeout(injectDupButton, 800);
        setTimeout(injectDupButton, 2000);
    }
    
    if (typeof ensureDupSidebar === 'function') ensureDupSidebar();
    if (typeof setupDupButtonObserver === 'function') setupDupButtonObserver();

    // 2. State Application (Hearts, Checks, Labels)
    if (syncResponse && typeof markDone === 'function') {
        markDone(syncResponse);
    }

    // 3. Last-to-load: Auto-Scanner (Run exactly once per load/navigation)
    if (_ibLastAutoUrl !== window.location.href && typeof autoFindDuplicates === 'function') {
        _ibLastAutoUrl = window.location.href;
        // Debounce scanner to ensure DOM is settled
        clearTimeout(window._ibAutoDupTimer);
        window._ibAutoDupTimer = setTimeout(autoFindDuplicates, 1500);
    }
}

// ── Init: run on page load ────────────────────────────────────────────────────

(function init() {
  injectAllCSS();
  
  // 1. Initial State: Hold user at loading page
  showLoadingOverlay('Synchronizing with Cloud...', 'Verifying your progress across devices');

  // 2. Request blocking sync and fresh state
  chrome.runtime.sendMessage({ action: 'syncAndGetState' }, function(res) {
    _ibLastSyncResponse = res;
    
    if (chrome.runtime.lastError || !res) {
      console.warn('[IB] Startup sync failed or timed out. Falling back to local state.');
    } else {
      console.log('[IB] Startup sync complete.');
    }
    
    // 3. Proceed with DOM injection
    function tryInject() {
      if (document.getElementById('questions-list1')) {
        setupPersistentObserver();
        triggerFullUiInjection(_ibLastSyncResponse);

        // Hide overlay only after structure is built
        setTimeout(completeLoadingOverlay, 500);
        
        handleUrlParameters();
      } else {
        setTimeout(tryInject, 300);
      }
    }
    tryInject();
  });

  // Safety: remove overlay after 10s max
  setTimeout(removeLoadingOverlay, 10000);

  // HIGH PRIORITY: Load at the VERY end
  injectHighPriorityCSS();
})();

function handleUrlParameters() {
  var focusQ = new URLSearchParams(window.location.search).get('ib_focus');
  if (focusQ) {
    setTimeout(function() {
      var lis = document.querySelectorAll('#questions-list1 li[id^="qid-"]');
      for (var i = 0; i < lis.length; i++) {
        var textEl = lis[i].querySelector('.ib-qname-text') || lis[i].querySelector('span');
        var realName = textEl ? (textEl.getAttribute('data-realname') || textEl.textContent.trim()) : '';
        
        if (realName === focusQ || (textEl && textEl.textContent.trim() === focusQ)) {
          lis[i].click();
          lis[i].scrollIntoView({behavior: 'smooth', block: 'center'});
          
          var sp = new URLSearchParams(window.location.search);
          if (sp.get('ib_open_dups') === '1' && typeof openDupSidebar === 'function') {
            setTimeout(function() { openDupSidebar(focusQ); }, 600);
          }

          var newUrl = new URL(window.location.href);
          newUrl.searchParams.delete('ib_focus');
          newUrl.searchParams.delete('ib_open_dups');
          window.history.replaceState({}, '', newUrl);
          break;
        }
      }
    }, 400);
  } else {
    setTimeout(function() {
      var activeLi = document.querySelector('#questions-list1 li.active[id^="qid-"]');
      if (activeLi && !parseOnclickData(activeLi)) {
        activeLi.click();
      }
    }, 600);
  }
}

// ── Manual Rescan Coordination ───────────────────────────────────────────────

window.IB = window.IB || {};
window.IB.rescanPage = function() {
  console.log('[IB] Manual Page Rescan Triggered...');
  if (typeof window.IB.showToast === 'function') window.IB.showToast('Rescanning page components...', 'loading');
  
  // Re-run all core injections
  if (typeof injectDoneCheckboxes === 'function') injectDoneCheckboxes();
  if (typeof injectDupButton === 'function') injectDupButton();
  if (typeof setupPersistentObserver === 'function') setupPersistentObserver();
  if (typeof ensureDupSidebar === 'function') ensureDupSidebar();
  if (typeof injectHighPriorityCSS === 'function') injectHighPriorityCSS();
  
  // Trigger pixel-based duplicate detection
  if (typeof window.IB.rescanWithReset === 'function') {
    window.IB.rescanWithReset();
  } else if (typeof window.IB.autoFindDuplicates === 'function') {
    window.IB.autoFindDuplicates(true);
  } else if (typeof autoFindDuplicates === 'function') {
    autoFindDuplicates(true);
  } else {
    if (typeof window.IB.showToast === 'function') window.IB.showToast('Rescan complete!', 'success');
  }
};
