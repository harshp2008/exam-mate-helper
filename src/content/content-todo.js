// content-todo.js — To-Do queue toolbar, select mode, and focus mode

export var ibSelectModeActive = false;
export var ibCurrentTodoSet = new Set();
export var ibInitialTodoSet = new Set();

export function injectToolbarButtons(list) {
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
}

export function toggleSelectMode() {
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

export function updateTodoSelectionUI() {
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

export function resetTodoState() {
  ibCurrentTodoSet = new Set();
  ibInitialTodoSet = new Set();
}
