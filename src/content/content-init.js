// content-init.js — Initialization and persistent observer for IB Exam Logger

// Set up a persistent observer on the body to catch when #questions-list1 is replaced/updated
function setupPersistentObserver() {
  if (window._ibPersistentObserver) return;
  var observer = new MutationObserver(function(mutations) {
    var needsInjection = false;
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      // Check if nodes were added
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
      clearTimeout(ibInjectionTimeout);
      ibInjectionTimeout = setTimeout(function() {
        injectDoneCheckboxes();
        // V2 REFIX: Ensure auto-scan runs on AJAX page changes (next page, random, search)
        if (typeof autoFindDuplicates === 'function') {
          autoFindDuplicates();
        }
      }, 250);
    }
  });
  
  observer.observe(document.body, { childList: true, subtree: true });
  window._ibPersistentObserver = observer;
}

// ── Init: run on page load ────────────────────────────────────────────────────

(function init() {
  injectAllCSS();
  // Show overlay immediately on page load — background will hide it once markDone arrives
  showLoadingOverlay('Syncing your progress...', 'Loading done questions from database');

  // Wait for question list to appear then setup exactly once
  function tryInject() {
    if (document.getElementById('questions-list1')) {
      injectDoneCheckboxes();
      setupPersistentObserver();
      
      // Trigger auto-duplicate detection exactly once per page load
      if (typeof autoFindDuplicates === 'function' && !window._ibAutoDupTriggered) {
        window._ibAutoDupTriggered = true;
        setTimeout(autoFindDuplicates, 2500);
      }
      
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

              // Remove the parameter from URL to avoid re-triggering on subsequent page logic
              var newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('ib_focus');
              newUrl.searchParams.delete('ib_open_dups');
              window.history.replaceState({}, '', newUrl);
              break;
            }
          }
        }, 400); // give ExamMate's JS time to bind the click listeners before we click
      } else {
        // On a normal hard reload, ExamMate sometimes omits the internal data from the DOM
        // for the active question. A simulated click forces Livewire to attach it.
        setTimeout(function() {
          var activeLi = document.querySelector('#questions-list1 li.active[id^="qid-"]');
          if (activeLi && !parseOnclickData(activeLi)) {
            activeLi.click();
          }
        }, 600);
      }
    } else {
      setTimeout(tryInject, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInject);
  } else {
    tryInject();
  }

  // Safety: remove overlay after 6s max even if background doesn't respond
  setTimeout(removeLoadingOverlay, 6000);

  // Inject duplicate button into question navbar
  injectDupButton();
  setupDupButtonObserver();

  // Ensure sidebar container exists in #app > div.row
  ensureDupSidebar();

  // HIGH PRIORITY: Load at the VERY end
  injectHighPriorityCSS();
})();

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
