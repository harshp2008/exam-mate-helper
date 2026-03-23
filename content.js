// content.js — IB Exam Logger Main Script
// Injects: done CSS, done checkboxes in sidebar, loading overlay, page clean CSS

var IB_CHECKBOXES_INJECTED = false;

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
        if (response.dupInfo) markDupItems(currentList, response.dupInfo);

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

        // Auto-detect duplicates (delayed slightly so page images have time to register in cache)
        setTimeout(autoFindDuplicates, 2000);
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
      // Bug fix 2: auto-select first undone to-do when entering focus mode
      if (isActive) {
        setTimeout(function() {
          var list = document.getElementById('questions-list1');
          if (!list) return;
          // Find first visible (not done) to-do item
          var firstUndone = list.querySelector('li.ib-todo:not(.done)');
          if (firstUndone) {
            firstUndone.click();
            firstUndone.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
      }
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

  // Ensure navbar layout persists after AJAX re-injections if edit mode is active
  if (ibSelectModeActive) {
    var tr = document.querySelector('ul.sortable-header');
    var fb = document.querySelector('button.filterBtn');
    if (tr) {
      if (fb) fb.disabled = true;
      Array.from(tr.children).forEach(function(li) {
        if (li.id === 'ib-all-nav-item' || li.id === 'ib-save-nav-item' || li.id === 'ib-todo-info-nav-item') {
          li.style.display = 'block';
        } else {
          li.style.display = 'none';
        }
      });
      if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
    }
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

function getMcqAnswer(parsed) {
  var answerImgs = parsed ? (parsed.answer_images || []) : [];
  if (answerImgs.length > 0) return null;
  var el = document.getElementById('answer-text-1');
  return el ? el.textContent.trim() : null;
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
        mcq_answer: getMcqAnswer(parsed),
        old_topics: parsed ? (parsed.topics || '') : '',
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
        mcq_answer: getMcqAnswer(parsed),
        old_topics: parsed ? (parsed.topics || '') : '',
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
  var elements = [li].concat(Array.from(li.querySelectorAll('*')));
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var attr = el.getAttribute('onclick') || el.getAttribute('wire:click') || 
               el.getAttribute('data-onclick') || el.getAttribute('x-on:click') || '';
               
    if (!attr && el.tagName === 'A' && el.href && el.href.includes('{')) {
       attr = el.href;
    }
    
    var s = attr.indexOf('{'), e = attr.lastIndexOf('}');
    if (s !== -1 && e !== -1) {
      try {
        var raw = attr.slice(s, e + 1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\\\\\//g, '/');
        var parsed = JSON.parse(raw);
        if (parsed && (parsed.question_images || parsed.answer_images || parsed.question_id || parsed.id)) {
           return parsed;
        }
      } catch (ex) {}
    }
  }
  return null;
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

// ── Duplicate sidebar marking ─────────────────────────────────────────────────

function markDupItems(list, dupInfo) {
  if (!list || !dupInfo) return;

  // Ensure singleton tooltip element exists
  var tooltip = document.getElementById('ib-dup-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'ib-dup-tooltip';
    tooltip.className = 'ib-dup-tooltip';
    document.body.appendChild(tooltip);
  }

  var showTimer = null;

  list.querySelectorAll('li[id^="qid-"]').forEach(function(li) {
    var textEl = li.querySelector('.ib-qname-text') || li.querySelector('span');
    if (!textEl) return;

    // Read the real question name from data attribute or text content
    var realName = li.getAttribute('data-ibqname') || (li.querySelector('.ib-qname-text') ? li.querySelector('.ib-qname-text').getAttribute('data-realname') || '' : '');
    if (!realName) {
      // Derive from the wrapper span's text or id — use the li id's encoded info is unreliable,
      // so read the text from .ib-qname-text before we might have overwritten it
      var nameNode = li.querySelector('.ib-qname-text');
      realName = nameNode ? (nameNode.getAttribute('data-realname') || nameNode.textContent.trim()) : '';
    }

    var info = dupInfo[realName];
    var isDupSecondary = info && !info.is_primary;

    if (isDupSecondary) {
      li.classList.add('ib-dup-secondary');

      // Replace visible text with "DUPLICATE" (store real name in data attr for recovery)
      var nameNode = li.querySelector('.ib-qname-text');
      if (nameNode) {
        if (!nameNode.getAttribute('data-realname')) {
          nameNode.setAttribute('data-realname', nameNode.textContent.trim());
        }
        // Show "DUPLICATE" label + small badge
        var realNameStored = nameNode.getAttribute('data-realname');
        nameNode.innerHTML = 'DUPLICATE<span class="ib-dup-label"> [' + realNameStored + ']</span>';
      }

      // Attach hover tooltip (only once per li)
      if (!li._ibDupTooltipAttached) {
        li._ibDupTooltipAttached = true;
        var dupData = info;
        var qRealName = realName;

        li.addEventListener('mouseenter', function(e) {
          clearTimeout(showTimer);
          showTimer = setTimeout(function() {
            var primary = dupData.primary_name || '—';
            var others = dupData.linked_questions || [];
            tooltip.innerHTML =
              '<div class="ib-dup-tooltip-title">\uD83D\uDD17 Duplicate' +
              (dupData.marked_by_user === false
                ? ' <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#EDE7F6;color:#512DA8;font-weight:600;">\uD83E\uDD16 AI</span>'
                : ' <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:#E1F5EE;color:#0F6E56;font-weight:600;">\u270F\uFE0F User</span>') +
              '</div>' +
              '<div class="ib-dup-tooltip-row"><strong>Primary question</strong>' +
                '<div class="ib-dup-tooltip-name">' + primary + '</div>' +
              '</div>' +
              (others.length > 0 ?
                '<div class="ib-dup-tooltip-row" style="margin-top:8px;"><strong>Other duplicates</strong>' +
                  others.map(function(n) {
                    return '<div class="ib-dup-tooltip-name other">' + n + '</div>';
                  }).join('') +
                '</div>' : '');

            // Position near the li
            var rect = li.getBoundingClientRect();
            tooltip.style.left = (rect.right + 8) + 'px';
            tooltip.style.top = rect.top + 'px';
            // If overflows right edge, flip to left
            if (rect.right + 8 + 280 > window.innerWidth) {
              tooltip.style.left = (rect.left - 292) + 'px';
            }
            tooltip.classList.add('visible');
          }, 600); // 600ms delay = "long hover"
        });

        li.addEventListener('mouseleave', function() {
          clearTimeout(showTimer);
          tooltip.classList.remove('visible');
        });
      }
    } else {
      // Not a non-primary duplicate — restore if it was previously marked
      li.classList.remove('ib-dup-secondary');
      var nameNode = li.querySelector('.ib-qname-text');
      if (nameNode && nameNode.getAttribute('data-realname')) {
        nameNode.textContent = nameNode.getAttribute('data-realname');
        nameNode.removeAttribute('data-realname');
      }
      li._ibDupTooltipAttached = false;
    }
  });
}

// ── Auto-detect duplicate questions ───────────────────────────────────────────

/**
 * Parses an IB question name into its components.
 * Format: SUBJECT/PaperTz_Level_Season_Year_Qnum
 * e.g.  PHYSI/22_HL_Winter_2023_Q1  →  { subject:'PHYSI', paper:'2', tz:'2', rest:'HL_Winter_2023_Q1' }
 * Returns null if name doesn't match the expected pattern.
 */
function parseIBName(name) {
  var m = (name || '').match(/^([A-Z]+)\/(\d)(\d)_(.+)$/);
  if (!m) return null;
  return { subject: m[1], paper: m[2], tz: parseInt(m[3], 10), rest: m[4] };
}

/**
 * Computes average pixel-level similarity (0–1) across ALL image pairs.
 * Loads images at native resolution. Does NOT set crossOrigin (same-origin CDN).
 * Uses willReadFrequently:true to suppress the console warning.
 */
function compareAllImages(imgs1, imgs2) {
  // Pair up images by index (up to min length)
  var pairCount = Math.min(imgs1.length, imgs2.length);
  if (pairCount === 0) return Promise.resolve(0);

  function loadImg(url) {
    return new Promise(function(res, rej) {
      var img = new Image();
      // No crossOrigin — same-origin images don't need it and it avoids CORS rejection
      img.onload = function() { res(img); };
      img.onerror = function() { rej(new Error('load')); };
      img.src = url + (url.includes('?') ? '&' : '?') + '_nc=' + Date.now();
    });
  }

  function comparePair(url1, url2) {
    return Promise.all([loadImg(url1), loadImg(url2)]).then(function(imgs) {
      var img1 = imgs[0], img2 = imgs[1];
      var W = Math.max(img1.naturalWidth  || img1.width,  1);
      var H = Math.max(img1.naturalHeight || img1.height, 1);
      // Cap to 600px to avoid massive memory usage on huge images
      if (W > 600) { H = Math.round(H * 600 / W); W = 600; }
      if (H > 600) { W = Math.round(W * 600 / H); H = 600; }

      var canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      var ctx = canvas.getContext('2d', { willReadFrequently: true });

      ctx.drawImage(img1, 0, 0, W, H);
      var d1 = ctx.getImageData(0, 0, W, H).data;

      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(img2, 0, 0, W, H);
      var d2 = ctx.getImageData(0, 0, W, H).data;

      var match = 0, total = W * H;
      for (var i = 0; i < d1.length; i += 4) {
        var diff = (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i+1] - d2[i+1]) + Math.abs(d1[i+2] - d2[i+2])) / 3;
        if (diff < 20) match++;
      }
      return match / total;
    }).catch(function() { return -1; }); // -1 = couldn't compare, ignore this pair
  }

  var pairs = [];
  for (var i = 0; i < pairCount; i++) {
    pairs.push(comparePair(imgs1[i], imgs2[i]));
  }

  return Promise.all(pairs).then(function(scores) {
    var valid = scores.filter(function(s) { return s >= 0; });
    if (valid.length === 0) return 0;
    return valid.reduce(function(a, b) { return a + b; }, 0) / valid.length;
  });
}

var _autoDupRunning = false;

function autoFindDuplicates() {
  if (_autoDupRunning) return;
  _autoDupRunning = true;

  chrome.runtime.sendMessage({ action: 'getDupData' }, function(res) {
    if (chrome.runtime.lastError || !res) { _autoDupRunning = false; return; }

    var entries = res.entries || [];
    var existingGroups = res.groups || [];

    // Build a set of question names already in any group
    var alreadyGrouped = new Set();
    existingGroups.forEach(function(g) {
      (g.questions || []).forEach(function(n) { alreadyGrouped.add(n); });
    });

    // Also read question names + image URLs from the current page DOM as a supplement
    var pageImgMap = {};  // name → [imgUrls]
    var pageItems = document.querySelectorAll('#questions-list1 li[id^="qid-"][onclick]');
    pageItems.forEach(function(li) {
      try {
        var onc = li.getAttribute('onclick') || '';
        var jsonMatch = onc.match(/selectQuestion\(\d+,\d+,'(.+)'\)(?:\s*)$/);
        if (!jsonMatch) return;
        var data = JSON.parse(jsonMatch[1]);
        var realName = (li.querySelector('.ib-qname-text') || {}).getAttribute('data-realname') ||
                       (li.querySelector('.ib-qname-text') || {}).textContent || '';
        realName = realName.trim();
        if (realName && data.question_images && data.question_images.length > 0) {
          pageImgMap[realName] = data.question_images;
        }
      } catch(e) {}
    });

    // Augment entries: if entry lacks images but page has them, fill in
    var entryMap = {};
    entries.forEach(function(e) {
      entryMap[e.question_name] = e;
      if ((!e.question_imgs || e.question_imgs.length === 0) && pageImgMap[e.question_name]) {
        e.question_imgs = pageImgMap[e.question_name];
      }
    });

    // Parse every entry and group candidates by (subject, paper, rest) — differ only in tz
    var buckets = {};  // key → list of entries
    entries.forEach(function(e) {
      var p = parseIBName(e.question_name);
      if (!p) return;
      var key = p.subject + '/' + p.paper + '_' + p.rest;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ entry: e, tz: p.tz });
    });

    // Collect candidate groups: ≥2 members, at least pair not already grouped together
    var pendingPairs = [];
    Object.keys(buckets).forEach(function(key) {
      var bucket = buckets[key];
      if (bucket.length < 2) return;
      // Check if ALL are already in the same existing group
      var names = bucket.map(function(b) { return b.entry.question_name; });
      var allGroupedTogether = existingGroups.some(function(g) {
        return names.every(function(n) { return g.questions && g.questions.indexOf(n) !== -1; });
      });
      if (allGroupedTogether) return;
      pendingPairs.push(bucket);
    });

    if (pendingPairs.length === 0) { _autoDupRunning = false; return; }

    console.log('[IB Auto-Dup] Checking', pendingPairs.length, 'candidate group(s)...');

    var idx = 0;
    function processNext() {
      if (idx >= pendingPairs.length) { _autoDupRunning = false; return; }
      var bucket = pendingPairs[idx++];

      // Pick first two that have images to compare
      var e1 = null, e2 = null;
      for (var i = 0; i < bucket.length && (!e1 || !e2); i++) {
        var imgs = bucket[i].entry.question_imgs || [];
        if (imgs.length > 0) {
          if (!e1) e1 = bucket[i];
          else if (!e2) e2 = bucket[i];
        }
      }

      if (!e1 || !e2) {
        console.log('[IB Auto-Dup] Skipping - no images for:', bucket.map(function(b){return b.entry.question_name;}).join(', '));
        processNext(); return;
      }

      compareAllImages(e1.entry.question_imgs, e2.entry.question_imgs).then(function(similarity) {
        console.log('[IB Auto-Dup]', e1.entry.question_name, 'vs', e2.entry.question_name, '→', Math.round(similarity * 100) + '%');
        if (similarity >= 0.85) {
          var allNames = bucket.map(function(b) { return b.entry.question_name; });
          // Primary = highest timezone number
          var primary = bucket.reduce(function(best, b) {
            return b.tz > best.tz ? b : best;
          }, bucket[0]).entry.question_name;

          var dupGroup = {
            id: 'dup_auto_' + allNames.sort().join('|'),
            questions: allNames,
            primary:   primary,
            marked_by_user: false
          };
          chrome.runtime.sendMessage({ action: 'saveDuplicateGroup', group: dupGroup }, function() {
            console.log('[IB] Auto-duplicate saved:', allNames.join(', '), '(' + Math.round(similarity * 100) + '% match, primary=' + primary + ')');
            processNext();
          });
        } else {
          processNext();
        }
      });
    }
    processNext();
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

// ── Duplicate button (question panel navbar) ──────────────────────────────────

function injectDupButton() {
  var navUl = document.querySelector('#question > div > div.row > div > ul');
  if (!navUl || document.getElementById('ib-dup-nav-item')) return;

  var dupNavItem = document.createElement('li');
  dupNavItem.className = 'nav-item';
  dupNavItem.id = 'ib-dup-nav-item';
  dupNavItem.title = 'Mark this question as a duplicate of another question';
  dupNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link">' +
    '<span style="font-size:14px;display:block;text-align:center;line-height:1;">\uD83D\uDD17</span>' +
    '<span style="font-size:0.6rem;font-weight:700"> Dup </span>' +
    '</a>';
  dupNavItem.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    var list = document.getElementById('questions-list1');
    var currentQ = '';
    if (list) {
      var activeLi = list.querySelector('li.active[id^="qid-"]');
      if (activeLi) {
        var ns = activeLi.querySelector('.ib-qname-text') || activeLi.querySelector('span');
        currentQ = ns ? (ns.getAttribute('data-realname') || ns.textContent.trim()) : '';
      }
    }
    openDupSidebar(currentQ);
  });
  navUl.appendChild(dupNavItem);
}

function setupDupButtonObserver() {
  if (window._ibDupObserver) return;
  var observer = new MutationObserver(function() {
    if (!document.getElementById('ib-dup-nav-item')) injectDupButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window._ibDupObserver = observer;
}

// ── Duplicate right sidebar ───────────────────────────────────────────────────

// In-memory state for the current sidebar session
var _iboGroup = { id: null, questions: [], primary: '', marked_by_user: true };
var _iboAllEntries = [];  // filled once from background cache
var _iboAllGroups  = [];  // filled once from background

function ensureDupSidebar() {
  if (document.getElementById('ib-dup-sidebar')) return;
  // Wait for #app > div.row
  function tryInsert() {
    var row = document.querySelector('#app > div.row');
    if (!row) { setTimeout(tryInsert, 400); return; }
    if (document.getElementById('ib-dup-sidebar')) return;
    var sidebar = document.createElement('div');
    sidebar.id = 'ib-dup-sidebar';
    sidebar.innerHTML = '<div class="ibo-inner" id="ibo-inner"></div>';
    row.appendChild(sidebar);
  }
  tryInsert();
}

function openDupSidebar(currentQName) {
  ensureDupSidebar();

  chrome.runtime.sendMessage({ action: 'getDupData' }, function(res) {
    var groups = (res && res.groups) || [];
    var entries = (res && res.entries) || [];
    _iboAllEntries = entries;
    _iboAllGroups  = groups;

    var existingGroup = groups.find(function(g) {
      return g.questions && g.questions.indexOf(currentQName) !== -1;
    });

    if (existingGroup) {
      _iboGroup = {
        id:             existingGroup.id,
        questions:      existingGroup.questions.slice(),
        primary:        existingGroup.primary || existingGroup.questions[0] || '',
        marked_by_user: existingGroup.marked_by_user !== false  // default true for existing user groups
      };
    } else {
      _iboGroup = {
        id:             'dup_' + Date.now(),
        questions:      currentQName ? [currentQName] : [],
        primary:        currentQName || '',
        marked_by_user: true
      };
    }

    buildDupSidebarContent();

    // Open the sidebar
    var sidebar = document.getElementById('ib-dup-sidebar');
    var row = document.querySelector('#app > div.row');
    if (sidebar) sidebar.classList.add('open');
    if (row) row.classList.add('ib-dup-open');
  });
}

function closeDupSidebar() {
  var sidebar = document.getElementById('ib-dup-sidebar');
  var row = document.querySelector('#app > div.row');
  if (sidebar) sidebar.classList.remove('open');
  if (row) row.classList.remove('ib-dup-open');
}

function buildDupSidebarContent() {
  var inner = document.getElementById('ibo-inner');
  if (!inner) return;

  var isExisting = _iboAllGroups.some(function(g) { return g.id === _iboGroup.id; });
  var autoNote = (!_iboGroup.marked_by_user && isExisting)
    ? '<div class="ibo-existing-note">\uD83E\uDD16 Auto-detected by AI system</div>' : '';
  var existingNote = (_iboGroup.marked_by_user && isExisting)
    ? '<div class="ibo-existing-note">\u270F\uFE0F Marked by user</div>' : '';

  inner.innerHTML =
    '<div class="ibo-header">' +
      '<div class="ibo-title">\uD83D\uDD17 Mark as Duplicate</div>' +
      '<button class="ibo-close" id="ibo-close-btn">\u2715</button>' +
    '</div>' +
    (autoNote || existingNote) +
    '<div class="ibo-msg" id="ibo-msg"></div>' +

    '<div class="ibo-label">Group members</div>' +
    '<div class="ibo-chips" id="ibo-chips"></div>' +

    '<div class="ibo-label" style="margin-top:12px;">Search logged questions</div>' +
    '<input class="ibo-search" id="ibo-search" type="text" placeholder="Type to search\u2026" autocomplete="off" />' +
    '<div class="ibo-results" id="ibo-results" style="display:none;"></div>' +

    '<div class="ibo-label" style="margin-top:12px;">Add manually (name not in DB)</div>' +
    '<div class="ibo-manual-row">' +
      '<input class="ibo-manual-input" id="ibo-manual-input" type="text" placeholder="e.g. PHYSI/22_HL_Winter_2023_Q8" autocomplete="off" />' +
      '<button class="ibo-add-btn" id="ibo-add-btn">+ Add</button>' +
    '</div>' +

    '<div class="ibo-label" style="margin-top:12px;">Primary question <span style="font-weight:400;text-transform:none;font-size:11px;color:#aaa;">(canonical version)</span></div>' +
    '<select class="ibo-primary-select" id="ibo-primary-select"><option>\u2014</option></select>' +

    '<div class="ibo-footer">' +
      (isExisting ? '<button class="ibo-remove-group" id="ibo-remove-btn">\uD83D\uDDD1 Remove group</button>' : '') +
      '<button class="ibo-cancel" id="ibo-cancel-btn">Cancel</button>' +
      '<button class="ibo-save" id="ibo-save-btn">Save</button>' +
    '</div>';

  // Render initial chips + dropdown
  iboRenderChips();
  iboRenderDropdown();

  // Wire events
  inner.querySelector('#ibo-close-btn').addEventListener('click', closeDupSidebar);
  inner.querySelector('#ibo-cancel-btn').addEventListener('click', closeDupSidebar);

  var searchInput = inner.querySelector('#ibo-search');
  var resultsEl   = inner.querySelector('#ibo-results');
  var searchTimer = null;
  searchInput.addEventListener('input', function() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function() { iboRunSearch(searchInput.value, resultsEl); }, 220);
  });

  inner.querySelector('#ibo-add-btn').addEventListener('click', function() {
    var val = (inner.querySelector('#ibo-manual-input').value || '').trim();
    if (!val) return;
    iboAddToGroup(val);
    inner.querySelector('#ibo-manual-input').value = '';
  });
  inner.querySelector('#ibo-manual-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') inner.querySelector('#ibo-add-btn').click();
  });

  inner.querySelector('#ibo-primary-select').addEventListener('change', function() {
    _iboGroup.primary = this.value;
    iboRenderChips();
  });

  inner.querySelector('#ibo-save-btn').addEventListener('click', iboSave);

  var removeBtn = inner.querySelector('#ibo-remove-btn');
  if (removeBtn) {
    removeBtn.addEventListener('click', function() {
      if (!confirm('Remove this duplicate group? All questions will lose their duplicate status.')) return;
      chrome.runtime.sendMessage({ action: 'removeDuplicateGroup', groupId: _iboGroup.id }, function() {
        iboShowMsg('success', 'Group removed.');
        setTimeout(function() {
          closeDupSidebar();
          // Trigger sidebar re-render
          chrome.runtime.sendMessage({ action: 'requestSyncState' });
        }, 1000);
      });
    });
  }
}

function iboRenderChips() {
  var container = document.getElementById('ibo-chips');
  if (!container) return;
  var g = _iboGroup;
  if (g.questions.length === 0) {
    container.innerHTML = '<span style="color:#aaa;font-size:11px;">No questions added yet.</span>';
    return;
  }
  container.innerHTML = g.questions.map(function(name) {
    var isPrimary = name === g.primary;
    return '<span class="ibo-chip' + (isPrimary ? ' primary' : '') + '">' +
      (isPrimary ? '\u2605 ' : '') + name +
      '<button class="ibo-chip-rm" data-name="' + name + '">\u2715</button>' +
      '</span>';
  }).join('');
  container.querySelectorAll('.ibo-chip-rm').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var n = this.getAttribute('data-name');
      _iboGroup.questions = _iboGroup.questions.filter(function(q) { return q !== n; });
      if (_iboGroup.primary === n) _iboGroup.primary = _iboGroup.questions[0] || '';
      iboRenderChips();
      iboRenderDropdown();
    });
  });
}

function iboRenderDropdown() {
  var sel = document.getElementById('ibo-primary-select');
  if (!sel) return;
  var g = _iboGroup;
  sel.innerHTML = g.questions.map(function(name) {
    return '<option value="' + name + '"' + (name === g.primary ? ' selected' : '') + '>' + name + '</option>';
  }).join('');
  sel.disabled = g.questions.length < 2;
}

function iboRunSearch(query, resultsEl) {
  if (!resultsEl) return;
  query = (query || '').toLowerCase().trim();
  if (!query) { resultsEl.style.display = 'none'; resultsEl.innerHTML = ''; return; }

  var inGroup = new Set(_iboGroup.questions);
  var matches = _iboAllEntries.filter(function(e) {
    return !inGroup.has(e.question_name) && (e.question_name || '').toLowerCase().includes(query);
  }).slice(0, 10);

  resultsEl.style.display = 'block';
  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="ibo-no-results">No results — use "Add manually" below.</div>';
    return;
  }
  resultsEl.innerHTML = matches.map(function(e) {
    var isDone = !!e.logged_at;
    // Check if already in another group
    var inOtherGroup = _iboAllGroups.some(function(g) {
      return g.id !== _iboGroup.id && g.questions && g.questions.indexOf(e.question_name) !== -1;
    });
    var badge = inOtherGroup
      ? '<span class="ibo-badge pending">in other group</span>'
      : (isDone ? '<span class="ibo-badge done">\u2713 done</span>' : '<span class="ibo-badge pending">pending</span>');
    return '<div class="ibo-result' + (inOtherGroup ? ' ibo-result-conflict' : '') + '" data-name="' + e.question_name + '" data-conflict="' + (inOtherGroup ? '1' : '0') + '">' +
      '<span style="overflow:hidden;text-overflow:ellipsis;">' + e.question_name + '</span>' + badge +
      '</div>';
  }).join('');
  resultsEl.querySelectorAll('.ibo-result').forEach(function(item) {
    item.addEventListener('click', function() {
      var name = this.getAttribute('data-name');
      var conflict = this.getAttribute('data-conflict') === '1';
      if (conflict) {
        iboShowMsg('error', '\u26A0\uFE0F "' + name + '" is already in another duplicate group.');
        return;
      }
      iboAddToGroup(name);
      document.getElementById('ibo-search').value = '';
      resultsEl.style.display = 'none';
    });
  });
}

function iboAddToGroup(name) {
  if (!name || _iboGroup.questions.indexOf(name) !== -1) return;
  // Exclusivity check: is this name in another group?
  var conflict = _iboAllGroups.find(function(g) {
    return g.id !== _iboGroup.id && g.questions && g.questions.indexOf(name) !== -1;
  });
  if (conflict) {
    iboShowMsg('error', '\u26A0\uFE0F "' + name + '" is already in another duplicate group.');
    return;
  }
  _iboGroup.questions.push(name);
  if (!_iboGroup.primary) _iboGroup.primary = name;
  iboRenderChips();
  iboRenderDropdown();
  var r = document.getElementById('ibo-results');
  if (r) { r.style.display = 'none'; r.innerHTML = ''; }
}

function iboShowMsg(type, text) {
  var el = document.getElementById('ibo-msg');
  if (!el) return;
  el.textContent = text;
  el.className = 'ibo-msg ' + type;
  if (type === 'success') setTimeout(function() { if (el) el.className = 'ibo-msg'; }, 3000);
}

function iboSave() {
  var g = _iboGroup;
  if (g.questions.length < 2) {
    iboShowMsg('error', 'Add at least 2 questions to form a duplicate pair.');
    return;
  }
  if (!g.primary || g.questions.indexOf(g.primary) === -1) g.primary = g.questions[0];

  // Exclusivity: check none of the questions are in other groups
  var conflicts = g.questions.filter(function(name) {
    return _iboAllGroups.some(function(eg) {
      return eg.id !== g.id && eg.questions && eg.questions.indexOf(name) !== -1;
    });
  });
  if (conflicts.length > 0) {
    iboShowMsg('error', '\u26A0\uFE0F These questions are in other groups: ' + conflicts.join(', '));
    return;
  }

  var saveBtn = document.getElementById('ibo-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

  // Always mark as user-saved
  var groupToSave = {
    id:             g.id,
    questions:      g.questions,
    primary:        g.primary,
    marked_by_user: true
  };

  chrome.runtime.sendMessage({ action: 'saveDuplicateGroup', group: groupToSave }, function(res) {
    if (chrome.runtime.lastError) {
      iboShowMsg('error', 'Error: ' + chrome.runtime.lastError.message);
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Save'; }
      return;
    }
    iboShowMsg('success', '\u2713 Saved! ' + g.questions.length + ' questions linked.');
    // Rebuild sidebar to show "marked by user" note
    _iboGroup.marked_by_user = true;
    // Reload groups in memory
    setTimeout(function() {
      chrome.runtime.sendMessage({ action: 'getDupData' }, function(r2) {
        if (r2) {
          _iboAllGroups  = r2.groups  || [];
          _iboAllEntries = r2.entries || [];
        }
        buildDupSidebarContent();
        chrome.runtime.sendMessage({ action: 'requestSyncState' });
      });
    }, 600);
  });
}









// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  // Popup Edit button: open sidebar for a specific group
  if (request.action === 'openDupSidebarForGroup') {
    var gid = request.groupId;
    chrome.runtime.sendMessage({ action: 'getDupData' }, function(res) {
      var groups = (res && res.groups) || [];
      var g = groups.find(function(x) { return x.id === gid; });
      if (g && g.questions && g.questions.length > 0) {
        openDupSidebar(g.questions[0]);
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'scrape') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse({ error: 'Question list not found.' }); return true; }
    var activeLi = list.querySelector('li.active[id^="qid-"]');
    if (!activeLi) { sendResponse({ error: 'No active question selected in the sidebar.' }); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    if (!parsed) { sendResponse({ error: 'Could not parse onclick data.' }); return true; }
    var liId = activeLi.id || '';
    var qidMatch = liId.match(/qid-(\d+)/);
    var answerImgs = parsed.answer_images || [];
    var mcqAnswer = null;
    if (answerImgs.length === 0) {
      var mcqEl = document.getElementById('answer-text-1');
      if (mcqEl) mcqAnswer = mcqEl.textContent.trim();
    }
    if (answerImgs.length === 0 && !mcqAnswer) {
      console.warn('[EXAM-MATE HELPER] IBDP board, question ' + question_name + ', 0 Answers are found. File a Github Issue for the github repo: https://github.com/harshp2008/exam-mate-helper');
    }
    sendResponse({
      question_name: question_name, qid: qidMatch ? qidMatch[1] : null,
      subject: inferSubject(question_name || ''),
      question_imgs: parsed.question_images || [], answer_imgs: answerImgs,
      mcq_answer: mcqAnswer,
      old_topics: parsed.topics || '',
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
        mcq_answer: li.classList.contains('active') ? getMcqAnswer(parsed) : undefined,
        old_topics: parsed.topics || '',
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
      if (request.dupInfo) markDupItems(list, request.dupInfo);
    }
    completeLoadingOverlay(); // ← hides overlay once sync is done
    sendResponse({ marked: true });
    return true;
  }

  if (request.action === 'getActiveName') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse(null); return true; }
    var activeLi = list.querySelector('li.active[id^="qid-"]');
    if (!activeLi) { sendResponse(null); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    var answerImgsGA = parsed ? (parsed.answer_images || []) : [];
    var mcqAnswerGA = null;
    if (answerImgsGA.length === 0) {
      var mcqElGA = document.getElementById('answer-text-1');
      if (mcqElGA) mcqAnswerGA = mcqElGA.textContent.trim();
    }
    if (answerImgsGA.length === 0 && !mcqAnswerGA) {
      console.warn('[EXAM-MATE HELPER] IBDP board, question ' + question_name + ', 0 Answers are found. File a Github Issue for the github repo: https://github.com/harshp2008/exam-mate-helper');
    }
    sendResponse({
      question_name: question_name, subject: inferSubject(question_name || ''),
      question_imgs: parsed ? (parsed.question_images || []) : [],
      answer_imgs: answerImgsGA,
      mcq_answer: mcqAnswerGA,
      old_topics: parsed ? (parsed.topics || '') : '',
    });
    return true;
  }

  if (request.action === 'clickNext') {
    var list = document.getElementById('questions-list1');
    if (list) {
      var activeLi = list.querySelector('li.active[id^="qid-"]');
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
    showStatusToast(request.mode);
    sendResponse({ shown: true });
    return true;
  }

  if (request.action === 'resetTodoCheckboxes') {
    // Called when Today page clears the queue — reset all sidebar checkboxes + in-memory sets
    ibCurrentTodoSet = new Set();
    ibInitialTodoSet = new Set();
    var list = document.getElementById('questions-list1');
    if (list) {
      list.querySelectorAll('.ib-todo-checkbox').forEach(function(cb) { cb.checked = false; });
      list.querySelectorAll('li.ib-todo').forEach(function(li) { li.classList.remove('ib-todo'); });
    }
    if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
    sendResponse({ done: true });
    return true;
  }

});
