// content.js — IB Exam Logger
// Injects: done CSS, done checkboxes in sidebar, loading overlay, page clean CSS

var IB_STYLE_ID = 'ib-tagger-styles';
var IB_CHECKBOXES_INJECTED = false;

// ── CSS: done marks + clean page styles ───────────────────────────────────────

function injectAllCSS() {
  if (document.getElementById(IB_STYLE_ID)) return;
  var style = document.createElement('style');
  style.id = IB_STYLE_ID;
  style.textContent = [

    // ── Page clean-up CSS (removes clutter) ──
    'div.left-side-menu { display: none  }',
    'div.logo-box {display: none}',
    '#wrapper {padding-left: 0px; margin-left: 0px; border-top-width: 0px; margin-top: 0px; padding-top: 0px;}',
    'div.content-page { margin-left: 0px; padding-bottom: 0px; padding-left: 3px; padding-right: 3px; margin-top: 0px; }',    
    'ul.list-unstyled.topnav-menu.topnav-menu-left.m-0.d-flex {display: none;}',
    'div.row.h-100 {display: none;}',
    'footer.footer {display: none;}',
    'div.clearfix {background-color: rgba(2555,255,255,0); width: 0px; height: 0px;}',    
    'div.navbar-custom {height: 0px;}',
    'i.fas.fa-network-wired {display: none;}',
    'i.fas.fa-question {display: none;}',
    'i.fas.fa-envelope {display: none;}',    
    'i.fe-shopping-cart.noti-icon {display: none;}',
    'i.mdi.mdi-chevron-down {display: none;}',
    'ul.list-unstyled.topnav-menu.float-end.mb-0 {width: 50px;}',
    'a.nav-link.dropdown-toggle.nav-user.me-0.waves-effect.waves-light {background-color: white; border-radius: 50%; padding-left: 2px; aspect-ratio: 1; height: 40px; margin-top:8px; font-weight: 900; font-style: normal; border-style: double;}',
    'div.mt-0.mb-3.page-title-box { display: none; margin-top: 0px; border-top-width: 0px; padding-top: 0px;}',
    'div.row.justify-content-center.justify-content-lg-start.align-items-center.align-items-lg-start { display: none; }',
    'div.p-0.card.card-body { margin-bottom: 3px; }',
    'div.col-xl-3.col-lg-4.pe-lg-0 { width:300px !important; padding-left: 0px; padding-right: 0px }',
    'div.col-xl-9.col-lg-8.ps-lg-1 { width: calc(100% - 325px) !important; padding-right: 0px;}',
    '#body-vertical-page { padding-bottom: 0px;}',
    'div.d-block.q-topics {text-align: left;}',
    'img.img-fluid {text-align: center;}',
    '#app>div.row:nth-child(2) { justify-content: center;}',
    'ul.list-unstyled.topnav-menu.topnav-menu-left.m-0.d-flex {display: none !important;}',
    'div.navbar-custom {height: 0px !important;}',
    'img.rounded-circle{ width: 250%; margin-left: -8px; margin-top: -10px;}',


    // ── Done question colours & Name Wrapper ──
    ':root { --ib-border: 10px; /* Change this to edit border-left width globally */ }',
    '.ib-qname-wrapper { display: flex; align-items: center; gap: 8px; }',
    '.ib-status-rect { width: var(--ib-border); height: 18px; border-radius: 3px; background-color: transparent; }',
    '#questions-list1 li.done {',
    '  background-color: #E8F5E9 !important;',
    '  border-left: none !important;',
    '}',
    '#questions-list1 li.done .ib-status-rect { background-color: #E8F5E9 !important; }',
    '#questions-list1 li.active.done {',
    '  background-color: #FFF176 !important;',
    '  border-left: none !important;',
    '}',
    '#questions-list1 li.active.done .ib-status-rect { background-color: #FFF176 !important; }',

    // ── Done & Fav buttons ──
    '.ib-done-btn, .ib-fav-btn {',
    '  display: inline-flex; align-items: center; justify-content: center;',
    '  width: 22px; height: 22px; border-radius: 50%;',
    '  border: 1.5px solid #ccc; background: #fff;',
    '  cursor: pointer; margin-left: 6px; flex-shrink: 0;',
    '  font-size: 12px; line-height: 1; color: #aaa;',
    '  transition: background 0.15s, border-color 0.15s, color 0.15s;',
    '  vertical-align: middle; padding: 0; outline: none;',
    '  position: relative; top: -1px;',
    '}',
    '.ib-done-btn:hover { border-color: #4CAF50; color: #4CAF50; }',
    '.ib-done-btn.is-done { background: #4CAF50; border-color: #4CAF50; color: #fff; }',
    '.ib-done-btn.is-done:hover { background: #c62828; border-color: #c62828; }',
    '.ib-fav-btn:hover { border-color: #FFB300; color: #FFB300; }',
    '.ib-fav-btn.is-fav { background: #FFF8E1; border-color: #FFB300; color: #FF8F00; font-size: 14px; }',

    // ── Permanently hide ExamMate's heart button (CSS survives Livewire re-renders) ──
    // Targets the .d-inline-block.pe-1 span that wraps the wire:id heart div
    '#questions-list1 span.d-inline-block.pe-1 { display: none !important; }',

    // ── Loading overlay ──
    '#ib-loading-overlay {',
    '  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;',
    '  background: rgba(255,255,255,0.88); z-index: 99999;',
    '  display: flex; flex-direction: column; align-items: center; justify-content: center;',
    '  gap: 14px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '}',
    '#ib-loading-overlay .ib-lo-title {',
    '  font-size: 15px; font-weight: 600; color: #185FA5;',
    '}',
    '#ib-loading-overlay .ib-lo-sub {',
    '  font-size: 12px; color: #888; margin-top: -8px;',
    '}',
    '#ib-loading-overlay .ib-lo-bar-wrap {',
    '  width: 220px; height: 5px; background: #e0e0e0; border-radius: 3px; overflow: hidden;',
    '}',
    '#ib-loading-overlay .ib-lo-bar {',
    '  height: 100%; width: 0%; background: #185FA5; border-radius: 3px;',
    '  transition: width 0.4s ease;',
    '}',

    // ── To-Do Queue CSS ──
    '#questions-list1.ib-select-mode .ib-fav-btn, #questions-list1.ib-select-mode .ib-done-btn { display: none !important; }',
    '#questions-list1.ib-select-mode .ib-todo-checkbox { display: inline-block !important; margin-left: 6px; vertical-align: middle; }',
    '.ib-todo-checkbox { display: none; width: 16px; height: 16px; cursor: pointer; }',
    'body.ib-focus-mode #questions-list1 li[id^="qid-"]:not(.ib-todo) { display: none !important; }',
    'body.ib-focus-mode .randomdropdown, body.ib-focus-mode #ib-todo-nav-item { pointer-events: none !important; opacity: 0.4 !important; }',
    '#ib-todo-toast { position: fixed; bottom: 20px; left: 20px; background: #1a1a1a; color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; z-index: 99998; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: ib-slidein 0.2s ease; }',
    '#ib-todo-toast button { background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 3px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; }',
    '#ib-todo-toast button:hover { background: rgba(255,255,255,0.1); }',
    '@keyframes ib-slidein { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }',
    
    // Priority order: done > todo > favourite
    '#questions-list1 li.ib-todo { background-color: #FFFFFF !important; border-left: none !important; }',
    '#questions-list1 li.ib-todo .ib-status-rect { background-color: #2196F3 !important; }',
    '#questions-list1 li.active.ib-todo { background-color: #E3F2FD !important; border-left: none !important; }',
    '#questions-list1 li.active.ib-todo .ib-status-rect { background-color: #1565C0 !important; }',
    '#questions-list1 li.done.ib-todo { background-color: #E8F5E9 !important; border-left: none !important; }',
    '#questions-list1 li.done.ib-todo .ib-status-rect { background-color: #4CAF50 !important; }',
    '#questions-list1 li.active.done.ib-todo { background-color: #FFF176 !important; border-left: none !important; }',
    '#questions-list1 li.active.done.ib-todo .ib-status-rect { background-color: #F9A825 !important; }',
    '#questions-list1 li.ib-todo.ib-fav:not(.done) { background-color: #FFFFFF !important; border-left: none !important; }',
    '#questions-list1 li.ib-todo.ib-fav:not(.done) .ib-status-rect { background-color: #2196F3 !important; }',
    '#questions-list1 li.done.ib-todo.ib-fav { background-color: #E8F5E9 !important; border-left: none !important; }',
    '#questions-list1 li.done.ib-todo.ib-fav .ib-status-rect { background-color: #4CAF50 !important; }',

    // improved styling for do-to-list
    'li.question-item-1.list-group-item.d-flex.justify-content-between.align-items-center {',
    '  padding-left: 0px;',
    '  padding-top: 0px !important;',
    '  padding-bottom: 0px !important;',
    '}',
    '',
    'div.ib-status-rect {',
    '  height: 36px;',
    '  border-radius: 0px;',
    '  width: 8px;',
    '}',
    '',
    'span.ib-qname-wrapper {',
    '  padding-top: 0px !important;',
    '  padding-bottom: 0px !important;',
    '  height: 100% !important;',
    '}',
    '',
    '#questions-list1 li.done.ib-todo .ib-qname-text {',
    '  text-decoration: line-through;',
    '  opacity: 0.65;',
    '}',
    '',
    'li.question-item-1.list-group-item.d-flex.justify-content-between.align-items-center {',
    '  border-bottom: 1px solid grey;',
    '}',

  ].join('\n');
  document.head.appendChild(style);
}

// ── Loading overlay ───────────────────────────────────────────────────────────

function showLoadingOverlay(msg, sub) {
  removeLoadingOverlay();
  var el = document.createElement('div');
  el.id = 'ib-loading-overlay';
  el.innerHTML =
    '<div class="ib-lo-title">' + (msg || 'Syncing your progress...') + '</div>' +
    '<div class="ib-lo-sub">' + (sub || 'Loading done questions from database') + '</div>' +
    '<div class="ib-lo-bar-wrap"><div class="ib-lo-bar" id="ib-lo-bar"></div></div>';
  document.body.appendChild(el);
  // Animate bar to ~80% while waiting, 100% on done
  var pct = 0;
  var interval = setInterval(function () {
    pct = Math.min(pct + Math.random() * 18, 80);
    var bar = document.getElementById('ib-lo-bar');
    if (bar) bar.style.width = pct + '%';
    else clearInterval(interval);
  }, 200);
  el._interval = interval;
}

function completeLoadingOverlay() {
  var el = document.getElementById('ib-loading-overlay');
  if (!el) return;
  clearInterval(el._interval);
  var bar = document.getElementById('ib-lo-bar');
  if (bar) bar.style.width = '100%';
  setTimeout(removeLoadingOverlay, 400);
}

function removeLoadingOverlay() {
  var el = document.getElementById('ib-loading-overlay');
  if (el) { clearInterval(el._interval); el.remove(); }
}

// ── Done checkboxes & State Re-sync ───────────────────────────────────────────

var ibInjectionTimeout = null;
var ibStateSyncInProgress = false;
var ibSelectModeActive = false;
var ibCurrentTodoSet = new Set();
var ibInitialTodoSet = new Set();

function injectDoneCheckboxes() {
  var list = document.getElementById('questions-list1');
  if (!list) return;

  // 1. Inject checkboxes into any <li> that doesn't have them yet.
  list.querySelectorAll('li[id^="qid-"]').forEach(function (li) {
    injectCheckboxIntoLi(li);
  });

  // 2. Fetch current state from background to ensure UI is accurate
  //    (especially after a Livewire refresh of the list)
  if (!ibStateSyncInProgress) {
    ibStateSyncInProgress = true;
    chrome.runtime.sendMessage({ action: 'requestSyncState' }, function(response) {
      ibStateSyncInProgress = false;
      if (!response) return;
      var doneNames = new Set(response.questionNames || []);
      var favNames = new Set(response.favouriteNames || []);
      
      var currentList = document.getElementById('questions-list1');
      if (currentList) {
        var todoNames = new Set(response.todoNames || []);
        currentList.querySelectorAll('li[id^="qid-"]').forEach(function (li) {
          var nameSpan = li.querySelector('span');
          var name = nameSpan ? nameSpan.textContent.trim() : null;
          if (name && doneNames.has(name)) li.classList.add('done');
          else li.classList.remove('done');
          if (name) li.classList.toggle('ib-todo', todoNames.has(name));
        });
        updateButtonStates(doneNames, favNames);

        // Disable focus mode automatically if globally there are NO to-dos for today
        if (todoNames.size === 0) {
          chrome.storage.local.set({ ib_focus_mode: false });
          document.body.classList.remove('ib-focus-mode');
          var fb = document.getElementById('ib-todo-filter-nav-item');
          if (fb) {
            var icon = fb.querySelector('i');
            var textSpan = fb.querySelector('span');
            if (icon) icon.className = 'fi fi-br-eye d-block text-center';
            if (textSpan) textSpan.textContent = ' Focus ';
          }
        }
        
        if (typeof checkEmptyFocusState === 'function') checkEmptyFocusState();
      }
    });
  }

  if (ibSelectModeActive) list.classList.add('ib-select-mode');

  // Inject Toolbar Buttons into sortable-header
  var toolbarRow = document.querySelector('ul.sortable-header');
  if (toolbarRow && !document.getElementById('ib-todo-nav-item')) {
    // Permanently hide the filtered and page count badges (elements without nav-item usually)
    Array.from(toolbarRow.children).forEach(function(child) {
      if (child.tagName === 'LI' && !child.classList.contains('nav-item')) {
        child.style.display = 'none';
      }
    });

    var todoNavItem = document.createElement('li');
    todoNavItem.className = 'nav-item';
    todoNavItem.id = 'ib-todo-nav-item';
    todoNavItem.title = 'Manage your daily To-Do questions';
    todoNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link nav-no-border"><i class="fi fi-br-list d-block text-center"></i><span style="font-size:0.6rem; font-weight:700"> To-Do </span></a>';
    todoNavItem.onclick = toggleSelectMode;

    var filterTodoNavItem = document.createElement('li');
    filterTodoNavItem.className = 'nav-item';
    filterTodoNavItem.id = 'ib-todo-filter-nav-item';
    filterTodoNavItem.title = 'Toggle Focus Mode: Hide all non-queued questions to quickly filter the page';
    filterTodoNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link nav-no-border"><i class="fi fi-br-eye d-block text-center"></i><span style="font-size:0.6rem; font-weight:700"> Focus </span></a>';
    
    filterTodoNavItem.onclick = function() {
      var isActive = document.body.classList.toggle('ib-focus-mode');
      chrome.storage.local.set({ ib_focus_mode: isActive });
      updateFocusButtonUI(isActive);
      checkEmptyFocusState();
    };
    
    // Initial fetch of focus mode state when creating button
    chrome.storage.local.get(['ib_focus_mode'], function(res) {
      if (res.ib_focus_mode) {
        document.body.classList.add('ib-focus-mode');
        updateFocusButtonUI(true);
        setTimeout(checkEmptyFocusState, 150);
      }
    });

    function updateFocusButtonUI(isActive) {
      if (!filterTodoNavItem) return;
      var icon = filterTodoNavItem.querySelector('i');
      var textSpan = filterTodoNavItem.querySelector('span');
      if (icon && textSpan) {
        if (isActive) {
          icon.className = 'fi fi-br-eye-crossed d-block text-center';
          textSpan.textContent = ' Show All ';
        } else {
          icon.className = 'fi fi-br-eye d-block text-center';
          textSpan.textContent = ' Focus ';
        }
      }
    }

    var infoNavItem = document.createElement('li');
    infoNavItem.className = 'nav-item ib-select-mode-only';
    infoNavItem.id = 'ib-todo-info-nav-item';
    infoNavItem.style.display = 'none';
    infoNavItem.title = 'Queue Load: Details your queued selections on this page vs your total global queue volume';
    infoNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link nav-no-border pe-none" style="padding-left:0; padding-right:0; margin-right:8px;">' +
                            '<div id="ib-info-page-count" style="font-size:13px; font-weight:800; color:#185FA5; text-align:center; height:18px; line-height:18px; margin-bottom:1px;">0/0</div>' +
                            '<span style="font-size:0.6rem; font-weight:700">Total: <span id="ib-info-total-count">0</span></span></a>';

    var allNavItem = document.createElement('li');
    allNavItem.className = 'nav-item ib-select-mode-only';
    allNavItem.id = 'ib-all-nav-item';
    allNavItem.style.display = 'none';
    allNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link nav-no-border"><i class="fi fi-br-check-double d-block text-center"></i><span style="font-size:0.6rem; font-weight:700" id="ib-all-text"> All </span></a>';
    allNavItem.onclick = function() {
      var checkboxes = list.querySelectorAll('.ib-todo-checkbox');
      var anyUnchecked = Array.from(checkboxes).some(function(cb) { return !cb.checked; });
      var targetState = anyUnchecked;
      
      var add = [];
      var remove = [];
      var addWithData = [];
      
      chrome.storage.local.get(['ib_question_cache'], function(res) {
        var entries = res.ib_question_cache || [];
        var cacheSet = new Set(entries.map(function(e) { return e.question_name; }));
        var today = new Date().toISOString().split('T')[0];
        
        checkboxes.forEach(function(cb) {
          if (cb.checked !== targetState) {
            cb.checked = targetState;
            var name = cb.getAttribute('data-qname');
            if (targetState) {
              ibCurrentTodoSet.add(name);
              if (cacheSet.has(name)) add.push(name);
              else {
                var li = cb.closest('li');
                var parsed = parseOnclickData(li);
                addWithData.push({
                  question_name: name,
                  subject: inferSubject(name),
                  question_imgs: parsed ? (parsed.question_images || []) : [],
                  answer_imgs: parsed ? (parsed.answer_images || []) : [],
                  old_topics: parsed ? (parsed.topics || '') : '',
                  new_chapters: [],
                  is_favourite: false,
                  logged_at: null,
                  todo_date: today,
                  source_url: window.location.href,
                  page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1)
                });
              }
            } else {
              ibCurrentTodoSet.delete(name);
              remove.push(name);
            }
          }
        });
        
        if (add.length > 0 || remove.length > 0 || addWithData.length > 0) {
          chrome.runtime.sendMessage({
            action: 'updateTodoQueue',
            add: add,
            remove: remove,
            addWithData: addWithData
          });
        }
        
        if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
      });
    };

    var saveNavItem = document.createElement('li');
    saveNavItem.className = 'nav-item ib-select-mode-only';
    saveNavItem.id = 'ib-save-nav-item';
    saveNavItem.style.display = 'none';
    saveNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link nav-no-border"><i class="fi fi-br-disk d-block text-center"></i><span style="font-size:0.6rem; font-weight:700"> Save </span></a>';
    saveNavItem.onclick = toggleSelectMode;

    toolbarRow.insertBefore(infoNavItem, toolbarRow.firstChild);
    toolbarRow.appendChild(filterTodoNavItem);
    toolbarRow.appendChild(todoNavItem);
    toolbarRow.appendChild(allNavItem);
    toolbarRow.appendChild(saveNavItem);
  }
}

function toggleSelectMode() {
  var list = document.getElementById('questions-list1');
  if (!list) return;
  ibSelectModeActive = !ibSelectModeActive;
  
  var toolbarRow = document.querySelector('ul.sortable-header');
  var filterBtn = document.querySelector('button.filterBtn');
  
  if (ibSelectModeActive) {
    list.classList.add('ib-select-mode');
    if (filterBtn) filterBtn.disabled = true;
    
    if (toolbarRow) {
      Array.from(toolbarRow.children).forEach(function(li) {
        if (li.id === 'ib-all-nav-item' || li.id === 'ib-save-nav-item' || li.id === 'ib-todo-info-nav-item') {
          li.style.display = 'block';
        } else {
          li.style.display = 'none';
        }
      });
    }
    
    chrome.storage.local.get(['ib_question_cache'], function(res) {
      var entries = res.ib_question_cache || [];
      var today = new Date().toISOString().split('T')[0];
      ibInitialTodoSet = new Set();
      ibCurrentTodoSet = new Set();
      
      entries.forEach(function(e) {
        if (e.todo_date === today) {
          ibInitialTodoSet.add(e.question_name);
          ibCurrentTodoSet.add(e.question_name);
        }
      });
      
      list.querySelectorAll('.ib-todo-checkbox').forEach(function(cb) {
        var name = cb.getAttribute('data-qname');
        cb.checked = ibCurrentTodoSet.has(name);
      });
      
      if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
    });
    
  } else {
    list.classList.remove('ib-select-mode');
    if (filterBtn) filterBtn.disabled = false;
    
    if (toolbarRow) {
      Array.from(toolbarRow.children).forEach(function(li) {
        if (li.id === 'ib-all-nav-item' || li.id === 'ib-save-nav-item' || li.id === 'ib-todo-info-nav-item' || !li.classList.contains('nav-item')) {
          li.style.display = 'none';
        } else {
          li.style.display = 'block';
        }
      });
    }
    
    var count = ibCurrentTodoSet.size;
    showTodoToast(count);
  }
}

function showTodoToast(count) {
  var existing = document.getElementById('ib-todo-toast');
  if (existing) existing.remove();
  
  var toast = document.createElement('div');
  toast.id = 'ib-todo-toast';
  toast.innerHTML = count + " questions in today's queue." +
    '<button id="ib-toast-view-btn">View queue &rarr;</button>' +
    '<button id="ib-toast-dismiss-btn">&#10005;</button>';
    
  document.body.appendChild(toast);
  
  var viewBtn = document.getElementById('ib-toast-view-btn');
  if(viewBtn) {
     viewBtn.onclick = function() {
       chrome.runtime.sendMessage({ action: 'openTodayPanel' });
       toast.remove();
     };
  }
  var dismissBtn = document.getElementById('ib-toast-dismiss-btn');
  if(dismissBtn) {
    dismissBtn.onclick = function() { toast.remove(); };
  }
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 5000);
}


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

function injectCheckboxIntoLi(li) {
  if (li.querySelector('.ib-done-btn')) return;

  var nameSpan = li.querySelector('span'); // Get the first span
  if (!nameSpan) return;
  
  var question_name;
  if (nameSpan.classList.contains('ib-qname-wrapper')) {
    var textSpan = nameSpan.querySelector('.ib-qname-text');
    question_name = textSpan ? textSpan.textContent.trim() : nameSpan.textContent.trim();
  } else {
    question_name = nameSpan.textContent.trim();
    // Wrap the name with our new generic DOM element block
    var statusRect = document.createElement('div');
    statusRect.className = 'ib-status-rect';
    statusRect.title = 'To-Do Indicator: Identifies whether this question is queued, completed, or active';
    var textSpan = document.createElement('span');
    textSpan.className = 'ib-qname-text';
    textSpan.textContent = question_name;
    
    nameSpan.textContent = '';
    nameSpan.classList.add('ib-qname-wrapper');
    nameSpan.appendChild(statusRect); // Changed from rectDiv to statusRect
    nameSpan.appendChild(textSpan);
  }
  
  if (!question_name) return;

  var spans = li.querySelectorAll(':scope > span');
  var targetSpan = spans[spans.length - 1];
  if (!targetSpan) return;

  // ── Our favourite button ──
  var favBtn = document.createElement('button');
  favBtn.className = 'ib-fav-btn';
  favBtn.innerHTML = '&#9825;'; // ♡ outline heart
  favBtn.title = 'Add to favourites';
  favBtn.setAttribute('data-qname', question_name);
  favBtn.onclick = function (e) {
    e.stopPropagation();
    toggleFavouriteFromButton(favBtn, li, question_name);
  };

  // ── Our done button ──
  var doneBtn = document.createElement('button');
  doneBtn.className = 'ib-done-btn';
  doneBtn.innerHTML = '&#10003;'; // ✓
  doneBtn.title = 'Mark as done';
  doneBtn.setAttribute('data-qname', question_name);
  doneBtn.onclick = function (e) {
    e.stopPropagation();
    toggleDoneFromButton(doneBtn, li, question_name);
  };

  // ── Our checkbox ──
  var checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'ib-todo-checkbox';
  checkbox.setAttribute('data-qname', question_name);
  checkbox.onclick = function (e) { 
    e.stopPropagation(); 
    var isChecked = this.checked;
    if (isChecked) ibCurrentTodoSet.add(question_name);
    else ibCurrentTodoSet.delete(question_name);
    
    if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
    
    // Instantly sync the individual click
    chrome.storage.local.get(['ib_question_cache'], function(res) {
      var entries = res.ib_question_cache || [];
      var cacheSet = new Set(entries.map(function(e) { return e.question_name; }));
      
      if (isChecked) {
        if (cacheSet.has(question_name)) {
          chrome.runtime.sendMessage({ action: 'updateTodoQueue', add: [question_name], remove: [], addWithData: [] });
        } else {
          var parsed = parseOnclickData(li);
          var entryData = {
            question_name: question_name,
            subject: inferSubject(question_name),
            question_imgs: parsed ? (parsed.question_images || []) : [],
            answer_imgs: parsed ? (parsed.answer_images || []) : [],
            old_topics: parsed ? (parsed.topics || '') : '',
            new_chapters: [],
            is_favourite: false,
            logged_at: null,
            todo_date: new Date().toISOString().split('T')[0],
            source_url: window.location.href,
            page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1)
          };
          chrome.runtime.sendMessage({ action: 'updateTodoQueue', add: [], remove: [], addWithData: [entryData] });
        }
      } else {
        chrome.runtime.sendMessage({ action: 'updateTodoQueue', add: [], remove: [question_name], addWithData: [] });
      }
    });
  };
  if (ibSelectModeActive && ibCurrentTodoSet.has(question_name)) {
    checkbox.checked = true;
  }

  targetSpan.appendChild(favBtn);
  targetSpan.appendChild(doneBtn);
  targetSpan.appendChild(checkbox);
}

function toggleDoneFromButton(btn, li, question_name) {
  var isDone = li.classList.contains('done');
  // Send message to background to toggle
  chrome.runtime.sendMessage({
    action: 'toggleDoneFromPage',
    question_name: question_name,
    subject: inferSubject(question_name),
    isDone: isDone,
    // Full data — parse from onclick for a complete entry
    entryData: (function () {
      var parsed = parseOnclickData(li);
      return {
        question_name: question_name,
        subject: inferSubject(question_name),
        question_imgs: parsed ? (parsed.question_images || []) : [],
        answer_imgs: parsed ? (parsed.answer_images || []) : [],
        old_topics: parsed ? (parsed.topics || '') : '',
        new_chapters: [],
        logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        source_url: window.location.href,
        page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1),
      };
    })()
  });
  // Optimistic UI update immediately
  if (isDone) {
    li.classList.remove('done');
    btn.classList.remove('is-done');
    btn.title = 'Mark as done';
  } else {
    li.classList.add('done');
    btn.classList.add('is-done');
    btn.title = 'Mark as not done';
  }
}

function toggleFavouriteFromButton(btn, li, question_name) {
  var isFav = btn.classList.contains('is-fav');
  chrome.runtime.sendMessage({
    action: 'toggleFavouriteFromPage',
    question_name: question_name,
    subject: inferSubject(question_name),
    isFav: isFav,
    entryData: (function () {
      var parsed = parseOnclickData(li);
      return {
        question_name: question_name,
        subject: inferSubject(question_name),
        question_imgs: parsed ? (parsed.question_images || []) : [],
        answer_imgs: parsed ? (parsed.answer_images || []) : [],
        old_topics: parsed ? (parsed.topics || '') : '',
        new_chapters: [],
        logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
        source_url: window.location.href,
        page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1),
        is_favourite: !isFav // optimistic
      };
    })()
  });
  // Optimistic UI update immediately
  if (isFav) {
    btn.classList.remove('is-fav');
    btn.innerHTML = '&#9825;';
    btn.title = 'Add to favourites';
  } else {
    btn.classList.add('is-fav');
    btn.innerHTML = '&#9829;'; // Solid heart ♥
    btn.title = 'Remove from favourites';
  }
}

function updateTodoSelectionUI() {
  if (!ibSelectModeActive) return;
  var list = document.getElementById('questions-list1');
  if (!list) return;
  var checkboxes = Array.from(list.querySelectorAll('.ib-todo-checkbox'));
  
  if (checkboxes.length > 0) {
    var anyUnchecked = checkboxes.some(function(cb) { return !cb.checked; });
    var textEl = document.getElementById('ib-all-text');
    var iconEl = document.getElementById('ib-all-nav-item') ? document.getElementById('ib-all-nav-item').querySelector('i') : null;
    if (anyUnchecked) {
      if (textEl) textEl.textContent = ' All ';
      if (iconEl) iconEl.className = 'fi fi-br-check-double d-block text-center';
    } else {
      if (textEl) textEl.textContent = ' None ';
      if (iconEl) iconEl.className = 'fi fi-br-cross d-block text-center';
    }
  }
  
  var pageCountEl = document.getElementById('ib-info-page-count');
  var totalCountEl = document.getElementById('ib-info-total-count');
  if (pageCountEl) {
    var pageSelected = checkboxes.filter(function(cb) { return cb.checked; }).length;
    pageCountEl.textContent = pageSelected + '/' + checkboxes.length;
  }
  if (totalCountEl) {
    totalCountEl.textContent = ibCurrentTodoSet ? ibCurrentTodoSet.size : 0;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferSubject(name) {
  var upper = (name || '').toUpperCase();
  if (upper.includes('CHEMI')) return 'chemistry';
  if (upper.includes('PHYSI') || upper.includes('PHYS')) return 'physics';
  if (upper.includes('MATH') || upper.includes('MATHS')) return 'mathematics';
  if (upper.includes('BIOL') || upper.includes('BIO')) return 'biology';
  return 'other';
}

function parseOnclickData(li) {
  var attr = li.getAttribute('onclick') || '';
  var s = attr.indexOf('{'), e = attr.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try {
    var raw = attr.slice(s, e + 1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\\\\\//g, '/');
    return JSON.parse(raw);
  } catch (ex) { return null; }
}

function checkEmptyFocusState() {
  var existingMsg = document.getElementById('ib-empty-focus-msg');
  if (existingMsg) existingMsg.remove();

  if (!document.body.classList.contains('ib-focus-mode')) return;

  var list = document.getElementById('questions-list1');
  if (!list) return;

  var visibleTodos = list.querySelectorAll('li.ib-todo').length;
  // If there are exactly 0 to-do items rendered on this page:
  if (visibleTodos === 0) {
    var msgLi = document.createElement('li');
    msgLi.id = 'ib-empty-focus-msg';
    msgLi.className = 'list-group-item'; 
    msgLi.style.textAlign = 'center';
    msgLi.style.padding = '40px 20px';
    msgLi.style.color = '#555';
    msgLi.style.border = 'none';
    msgLi.style.background = 'transparent';
    msgLi.innerHTML = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions on this page.</h5><p style="font-size:13px;">Scanning your active to-do list pages...</p>';
    list.appendChild(msgLi);

    chrome.runtime.sendMessage({ action: 'getTodoPages' }, function(response) {
      console.log("--- EXAM-MATE HELPER: EMPTY FOCUS STATE ---");
      console.log("Response Stats from Background:", response ? response.stats : 'null');
      
      if (!response || !response.stats || Object.keys(response.stats).length === 0) {
        msgLi.innerHTML = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions remaining!</h5><p style="font-size:13px;">You have cleared your queues.</p>';
        return;
      }
      
      var html = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions on this page.</h5>' +
                 '<p style="font-size:13px; margin-bottom:15px;">Try these pages instead:</p>';
                 
      var subjects = Object.keys(response.stats).sort();
      subjects.forEach(function(subj) {
        var subjTitle = subj.charAt(0).toUpperCase() + subj.slice(1);
        html += '<div style="text-align:left; max-width: 320px; margin: 0 auto 15px auto;">';
        html += '<h6 style="font-weight:bold; margin-bottom:8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">' + subjTitle + '</h6>';
        
        var urls = Object.keys(response.stats[subj]);
        urls.forEach(function(url) {
          var stat = response.stats[subj][url];
          var pageLabel = 'Page ' + (stat.page || 1);
          
          html += '<a href="' + url + '" style="display:block; margin:4px 0; padding:8px 12px; background:#F8F9FA; border:1px solid #E0E0E0; border-radius:6px; text-decoration:none; color:#333; transition: background 0.2s;">' +
                  '<div style="font-weight:600; color:#185FA5;">' + pageLabel + '</div>' +
                  '<div style="font-size:12px; color:#666; margin-top:3px;">' + stat.total + ' questions, ' + stat.solved + ' solved</div>' +
                  '</a>';
        });
        
        html += '</div>';
      });
      
      msgLi.innerHTML = html;
    });
  }
}

function updateButtonStates(doneNames, favNames) {
  var doneSet = new Set(doneNames || []);
  var favSet = new Set(favNames || []);
  document.querySelectorAll('.ib-done-btn').forEach(function (btn) {
    var name = btn.getAttribute('data-qname');
    btn.classList.toggle('is-done', doneSet.has(name));
    btn.title = doneSet.has(name) ? 'Mark as not done' : 'Mark as done';
  });
  document.querySelectorAll('.ib-fav-btn').forEach(function (btn) {
    var name = btn.getAttribute('data-qname');
    var isFav = favSet.has(name);
    btn.classList.toggle('is-fav', isFav);
    btn.innerHTML = isFav ? '&#9829;' : '&#9825;';
    btn.title = isFav ? 'Remove from favourites' : 'Add to favourites';
  });
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
})();

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  if (request.action === 'scrape') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse({ error: 'Question list not found.' }); return true; }
    var activeLi = list.querySelector('li.active');
    if (!activeLi) { sendResponse({ error: 'No active question selected in the sidebar.' }); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    if (!parsed) { sendResponse({ error: 'Could not parse onclick data.' }); return true; }
    var liId = activeLi.id || '';
    var qidMatch = liId.match(/qid-(\d+)/);
    sendResponse({
      question_name: question_name, qid: qidMatch ? qidMatch[1] : null,
      subject: inferSubject(question_name || ''),
      question_imgs: parsed.question_images || [], answer_imgs: parsed.answer_images || [],
      old_topics: parsed.topics || '', new_chapters: [],
      logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href, page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1)
    });
    return true;
  }

  if (request.action === 'scrapeAll') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse({ error: 'Question list not found.' }); return true; }
    var items = list.querySelectorAll('li[id^="qid-"]');
    var results = [];
    items.forEach(function (li) {
      var nameSpan = li.querySelector('span');
      var question_name = nameSpan ? nameSpan.textContent.trim() : null;
      var parsed = parseOnclickData(li);
      if (!parsed) return;
      var liId = li.id || '';
      var qidMatch = liId.match(/qid-(\d+)/);
      results.push({
        question_name: question_name, qid: qidMatch ? qidMatch[1] : null,
        subject: inferSubject(question_name || ''),
        question_imgs: parsed.question_images || [], answer_imgs: parsed.answer_images || [],
        old_topics: parsed.topics || '', new_chapters: [],
        logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href, page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1),
        is_active: li.classList.contains('active'),
      });
    });
    sendResponse({ questions: results, total: results.length });
    return true;
  }

  if (request.action === 'markDone') {
    // Called by background after sync — updates colours + checkboxes + hides overlay
    injectAllCSS();
    injectDoneCheckboxes();
    var list = document.getElementById('questions-list1');
    if (list) {
      var loggedNames = new Set(request.questionNames || []);
      var todoSet = new Set(request.todoNames || []);
      list.querySelectorAll('li[id^="qid-"]').forEach(function (li) {
        var nameSpan = li.querySelector('span');
        var name = nameSpan ? nameSpan.textContent.trim() : null;
        if (name && loggedNames.has(name)) li.classList.add('done');
        else li.classList.remove('done');
        
        if (name) li.classList.toggle('ib-todo', todoSet.has(name));
      });
      updateButtonStates(request.questionNames || [], request.favouriteNames || []);
    }
    completeLoadingOverlay(); // ← hides overlay once sync is done
    sendResponse({ marked: true });
    return true;
  }

  if (request.action === 'getActiveName') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse(null); return true; }
    var activeLi = list.querySelector('li.active');
    if (!activeLi) { sendResponse(null); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    sendResponse({
      question_name: question_name, subject: inferSubject(question_name || ''),
      question_imgs: parsed ? (parsed.question_images || []) : [],
      answer_imgs: parsed ? (parsed.answer_images || []) : [],
      old_topics: parsed ? (parsed.topics || '') : '',
    });
    return true;
  }

  if (request.action === 'clickNext') {
    var list = document.getElementById('questions-list1');
    if (list) {
      var activeLi = list.querySelector('li.active');
      if (activeLi && activeLi.nextElementSibling) {
        activeLi.nextElementSibling.click();
        sendResponse({ clicked: true }); return true;
      }
    }
    var nextBtn = Array.from(document.querySelectorAll('button, a'))
      .find(function (el) { return el.textContent.trim().toLowerCase() === 'next'; });
    if (nextBtn) nextBtn.click();
    sendResponse({ clicked: !!nextBtn });
    return true;
  }

  if (request.action === 'showToast') {
    var existingToast = document.getElementById('ib-status-toast');
    if (existingToast) existingToast.remove();

    var toast = document.createElement('div');
    toast.id = 'ib-status-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '20px';
    toast.style.padding = '8px 16px';
    toast.style.borderRadius = '8px';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    toast.style.zIndex = '999999';
    toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.pointerEvents = 'none';

    if (request.mode === 'firebase') {
      toast.textContent = '☁ Firebase connected';
      toast.style.background = '#E1F5EE';
      toast.style.color = '#0F6E56';
      toast.style.border = '1px solid #9FE1CB';
    } else {
      toast.textContent = '📁 Local mode';
      toast.style.background = '#fff';
      toast.style.color = '#185FA5';
      toast.style.border = '1px solid #ddd';
    }

    document.body.appendChild(toast);

    setTimeout(function () {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(function () {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(function () { if (toast.parentNode) toast.remove(); }, 300);
    }, 2500);

    sendResponse({ shown: true });
    return true;
  }

});
