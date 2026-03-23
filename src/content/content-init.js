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
      }, 150);
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
      
      var focusQ = new URLSearchParams(window.location.search).get('ib_focus');
      if (focusQ) {
        setTimeout(function() {
          var lis = document.querySelectorAll('#questions-list1 li[id^="qid-"]');
          for (var i = 0; i < lis.length; i++) {
            var span = lis[i].querySelector('.ib-qname-text') || lis[i].querySelector('span');
            if (span && span.textContent.trim() === focusQ) {
              lis[i].click();
              lis[i].scrollIntoView({behavior: 'smooth', block: 'center'});
              
              // Remove the parameter from URL to avoid re-triggering on subsequent page logic
              var newUrl = new URL(window.location.href);
              newUrl.searchParams.delete('ib_focus');
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
})();
