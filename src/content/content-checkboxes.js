// content-checkboxes.js — Checkbox injection, done/fav toggling, duplicate marking

var IB_CHECKBOXES_INJECTED = false;

var ibInjectionTimeout = null;
var ibStateSyncInProgress = false;

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
  injectToolbarButtons(list);

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
    nameSpan.appendChild(statusRect);
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
