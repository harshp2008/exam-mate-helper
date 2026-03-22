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
})();

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

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
    sendResponse({
      question_name: question_name, qid: qidMatch ? qidMatch[1] : null,
      subject: inferSubject(question_name || ''),
      question_imgs: parsed.question_images || [], answer_imgs: parsed.answer_images || [],
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

});
