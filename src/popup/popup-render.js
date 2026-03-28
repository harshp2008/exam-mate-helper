// popup-render.js — UI render functions for IB Exam Logger

// ── View switching ────────────────────────────────────────────────────────────

function switchView(view) {
  if (window.IB.previousView === 'settings' && view !== 'settings') {
    showStatusToast();
  }

  ['log', 'today', 'favourites', 'db', 'dups', 'settings'].forEach(function (v) {
    var p = document.getElementById('panel-' + v);
    if (p) p.classList.toggle('active', v === view);
    var btn = document.getElementById('btn-' + v + '-view');
    if (btn) btn.classList.toggle('active-tab', v === view);
  });
  if (view === 'today') renderTodayPanel();
  if (view === 'db') renderDBPanel();
  if (view === 'favourites') renderFavouritesPanel();
  if (view === 'dups') renderDupsPanel();
  if (view === 'settings') populateSettingsUI();
  if (view === 'log' && window.IB.currentData) renderCurrentQuestion(window.IB.currentData);

  window.IB.previousView = view;
}

function showStatusToast() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url.includes('exam-mate.com/topicalpastpapers')) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'showToast',
        mode: useFirebase() ? 'firebase' : 'local'
      });
    }
  });
}

// ── Log panel ─────────────────────────────────────────────────────────────────

function showPageError(msg) {
  document.getElementById('no-page-msg').style.display = 'block';
  document.getElementById('no-page-msg').textContent = msg;
  document.getElementById('page-content').style.display = 'none';
}

function renderCurrentQuestion(data) {
  document.getElementById('no-page-msg').style.display = 'none';
  document.getElementById('page-content').style.display = 'block';
  document.getElementById('q-name').textContent = data.question_name || 'Unknown';
  document.getElementById('subject-badge').textContent = data.subject || 'unknown';
  document.getElementById('q-img-count').textContent = data.question_imgs.length + ' Q';

  var aEl = document.getElementById('a-img-count');
  var hasImgAnswers = data.answer_imgs && data.answer_imgs.length > 0;
  var mcq = data.mcq_answer || null;
  if (hasImgAnswers) {
    aEl.textContent = data.answer_imgs.length + ' A';
    aEl.className = 'img-count-badge a';
  } else if (mcq) {
    aEl.textContent = '1 A (MCQ)';
    aEl.className = 'img-count-badge a';
  } else {
    aEl.textContent = '0 A';
    aEl.className = 'img-count-badge zero';
    showZeroAnswerToast(data.question_name);
  }
  
  var topicsEl = document.getElementById('old-topics-val');
  if (data.old_topics) {
    topicsEl.innerHTML = data.old_topics.split(',').map(function (t) { return '<span class="tag-pill">' + t.trim() + '</span>'; }).join('');
  } else { topicsEl.textContent = 'None found'; }

  var logged = window.IB.allEntries.some(function (e) { return e.question_name === data.question_name; });
  document.getElementById('already-logged-row').style.display = logged ? 'flex' : 'none';
  
  var logBtn = document.getElementById('log-btn');
  var primaryName = window.IB.isNonPrimaryDuplicate(data.question_name);
  if (primaryName) {
    logBtn.disabled = true;
    logBtn.title = 'This is a duplicate of [' + primaryName + ']. Please log the primary question instead.';
    document.getElementById('log-btn-text').textContent = 'Duplicate (See Primary)';
  } else {
    logBtn.disabled = false;
    logBtn.title = '';
    logBtn.classList.remove('success');
    document.getElementById('log-btn-text').textContent = logged ? 'Mark as done again (Update record)' : 'Mark as done';
  }
}

// ── Questions panel ───────────────────────────────────────────────────────────

async function loadQuestionsPanel() {
  var listEl = document.getElementById('qp-list');
  listEl.innerHTML = '<div class="qp-loading">Loading...</div>';
  document.getElementById('qp-count').textContent = '—';
  try {
    var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    var tab = tabs[0];
    if (!tab || !tab.url || !tab.url.includes('exam-mate.com')) { listEl.innerHTML = '<div class="qp-loading">Open an ExamMate page first.</div>'; return; }
    var response = await chrome.tabs.sendMessage(tab.id, { action: 'scrapeAll' });
    if (response && response.error) { listEl.innerHTML = '<div class="qp-loading">' + response.error + '</div>'; return; }
    window.IB.sidebarQuestions = response.questions || [];
    renderQuestionsPanel();
  } catch (e) { listEl.innerHTML = '<div class="qp-loading">Error: ' + e.message + '</div>'; }
}

function renderQuestionsPanel() {
  var listEl = document.getElementById('qp-list');
  var countEl = document.getElementById('qp-count');
  if (window.IB.sidebarQuestions.length === 0) { countEl.textContent = '0 questions'; listEl.innerHTML = '<div class="qp-loading">No questions found.</div>'; return; }
  var loggedNames = new Set(window.IB.allEntries.map(function (e) { return e.question_name; }));
  var doneCount = window.IB.sidebarQuestions.filter(function (q) { return loggedNames.has(q.question_name); }).length;
  countEl.textContent = window.IB.sidebarQuestions.length + ' questions · ' + doneCount + ' done';
  listEl.innerHTML = window.IB.sidebarQuestions.map(function (q) {
    var isDone = loggedNames.has(q.question_name);
    var isActive = q.is_active;
    var cls = (isDone && isActive) ? 'state-active-done' : isDone ? 'state-done' : isActive ? 'state-active' : '';
    var meta = isDone ? (isActive ? '★ active · done' : '✓ done') : (isActive ? '▶ active' : '');
    var redoBtn = isDone ? '<button class="redo-btn" data-name="' + q.question_name + '" data-subject="' + q.subject + '">Redo</button>' : '';
    return '<div class="qp-item ' + cls + '"><div style="flex:1;min-width:0;"><div class="qp-item-name" title="' + q.question_name + '">' + q.question_name + '</div>' + (meta ? '<div class="qp-item-meta">' + meta + '</div>' : '') + '</div>' + redoBtn + '</div>';
  }).join('');
  listEl.querySelectorAll('.redo-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name'), subj = this.getAttribute('data-subject');
      this.textContent = '...'; this.disabled = true;
      try {
        if (useFirebase()) await window.IB.fsDelete(subj, name);
        window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== name; });
        await window.IB.saveCache(window.IB.allEntries); await markDoneOnPage();
        if (window.IB.currentData) renderCurrentQuestion(window.IB.currentData);
        renderQuestionsPanel();
        showQpMsg('success', '"' + name + '" removed — ready to redo.');
      } catch (e) { showQpMsg('error', 'Error: ' + e.message); this.textContent = 'Redo'; this.disabled = false; }
    });
  });
}

function showQpMsg(type, text) {
  var el = document.getElementById('qp-msg');
  el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3000);
}

// ── Today panel ───────────────────────────────────────────────────────────────

function renderTodayPanel() {
  var today = new Date().toISOString().split('T')[0];
  var todayItems = window.IB.allEntries.filter(function(e) { 
    return e.todo_date === today; 
  });
  var doneItems   = todayItems.filter(function(e) { return !!e.logged_at; });
  var undoneItems = todayItems.filter(function(e) { return !e.logged_at; });
  var doneCount = doneItems.length;

  var panel = document.getElementById('panel-today');
  if (!panel) return;
  
  if (todayItems.length === 0) {
    panel.innerHTML = '<div class="empty-today">No questions queued for today.<br>' +
      'Use the To-Do button in the<br>ExamMate sidebar to build your queue.</div>';
    return;
  }

  var pct = Math.round((doneCount / todayItems.length) * 100);
  
  panel.innerHTML =
    '<div class="today-progress">' +
      '<span>' + doneCount + ' / ' + todayItems.length + ' done</span>' +
      '<div class="today-progress-bar"><div class="today-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="today-btn-group">' +
        '<button class="today-clear-btn" id="today-clear-completed-btn" title="Remove completed questions from your queue (keeps unfinished ones)">Clear done</button>' +
        '<div class="today-more-wrap">' +
          '<button class="today-more-btn" id="today-more-btn" title="More options">⋮</button>' +
          '<div class="today-more-dropdown" id="today-more-dropdown">' +
            '<div class="today-more-info">⚠ <b>Clear All</b> removes the to-do status from finished questions AND <b>permanently deletes</b> unfinished to-do questions from the database.</div>' +
            '<button class="today-more-item danger" id="today-clear-all-btn">Clear all</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div id="today-list">' +
    todayItems.map(function(e) {
      var isDone = !!e.logged_at; 
      var subjectNames = e.subject || 'other';
      var topics = e.old_topics || '';
      return '<div class="today-item' + (isDone ? ' is-done' : '') + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="today-name ib-nav-link" title="' + (e.question_name || '') + '" data-url="' + (e.source_url || '') + '" data-qname="' + (e.question_name || '') + '" style="cursor:pointer; color:#185FA5;">' + 
             (e.question_name || '—') + '</div>' +
          '<div class="today-meta">' + subjectNames + 
            (topics ? ' · ' + topics.split(',').slice(0,2).map(function(t) { return t.trim(); }).join(', ') : '') + '</div>' +
        '</div>' +
        '<button class="today-remove-btn" data-name="' + (e.question_name || '') + 
          '" data-subject="' + subjectNames + '">Remove</button>' +
      '</div>';
    }).join('') +
    '</div>';

  // Remove individual item
  panel.querySelectorAll('.today-remove-btn').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      var name = this.getAttribute('data-name');
      var entry = window.IB.allEntries.find(function(e) { return e.question_name === name; });
      if (entry) {
        btn.textContent = '...'; btn.disabled = true;
        entry.todo_date = null;
        await window.IB.saveCache(window.IB.allEntries);
        if (useFirebase()) await window.IB.fsWrite(entry);
        await markDoneOnPage();
        renderTodayPanel();
      }
    });
  });

  // Toggle more-options dropdown
  document.getElementById('today-more-btn').addEventListener('click', function(ev) {
    ev.stopPropagation();
    document.getElementById('today-more-dropdown').classList.toggle('open');
  });
  document.addEventListener('click', function todayClose() {
    var d = document.getElementById('today-more-dropdown');
    if (d) d.classList.remove('open');
    document.removeEventListener('click', todayClose);
  });

  // Clear Completed: only remove to-do status for done items
  document.getElementById('today-clear-completed-btn').addEventListener('click', async function() {
    if (doneItems.length === 0) { return; }
    if (!confirm('Remove ' + doneItems.length + ' completed question(s) from your queue?')) return;
    var btn = this; btn.textContent = '...'; btn.disabled = true;
    doneItems.forEach(function(e) { e.todo_date = null; });
    await window.IB.saveCache(window.IB.allEntries);
    if (useFirebase()) {
      for (var i = 0; i < doneItems.length; i++) {
        try { await window.IB.fsWrite(doneItems[i]); } catch(_) {}
      }
    }
    await markDoneOnPage();
    notifyContentScriptTodoReset();
    renderTodayPanel();
  });

  // Clear All: remove done todo status AND delete undone entries from DB
  document.getElementById('today-clear-all-btn').addEventListener('click', async function() {
    var msg = 'This will:\n\u2022 Remove ' + doneItems.length + ' completed question(s) from your queue\n\u2022 PERMANENTLY DELETE ' + undoneItems.length + ' unfinished question(s) from the database\n\nAre you sure?';
    if (!confirm(msg)) return;
    var btn = this; btn.textContent = '...'; btn.disabled = true;
    doneItems.forEach(function(e) { e.todo_date = null; });
    var undoneNames = undoneItems.map(function(e) { return e.question_name; });
    window.IB.allEntries = window.IB.allEntries.filter(function(e) { return !undoneNames.includes(e.question_name); });
    await window.IB.saveCache(window.IB.allEntries);
    if (useFirebase()) {
      for (var i = 0; i < doneItems.length; i++) {
        try { await window.IB.fsWrite(doneItems[i]); } catch(_) {}
      }
      for (var j = 0; j < undoneItems.length; j++) {
        try { await window.IB.fsDelete(undoneItems[j].subject || 'other', undoneItems[j].question_name); } catch(_) {}
      }
    }
    await markDoneOnPage();
    notifyContentScriptTodoReset();
    renderTodayPanel();
  });
}

// ── Favourites panel ──────────────────────────────────────────────────────────

function notifyContentScriptTodoReset() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'resetTodoCheckboxes' });
  });
}

function renderFavouritesPanel() {
  var filter = (document.getElementById('fav-filter').value || '').toLowerCase();
  var favs = window.IB.allEntries.filter(function (e) { return e.is_favourite === true; });
  var filtered = filter ? favs.filter(function (e) {
    return (e.question_name || '').toLowerCase().includes(filter) ||
      (e.subject || '').toLowerCase().includes(filter) ||
      (e.old_topics || '').toLowerCase().includes(filter);
  }) : favs;

  document.getElementById('fav-count').textContent = favs.length + ' favourite' + (favs.length !== 1 ? 's' : '') + (filter ? ' · ' + filtered.length + ' shown' : '');

  var listEl = document.getElementById('fav-list');
  if (favs.length === 0) {
    listEl.innerHTML = '<div class="empty-fav"><div class="fav-icon">♥</div>No favourites yet.<br>Click the ♥ button next to any question<br>in the ExamMate sidebar to add it here.</div>';
    return;
  }
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-fav">No favourites match "' + filter + '"</div>';
    return;
  }

  listEl.innerHTML = filtered.map(function (e) {
    var isDone = true; // if it's in allEntries it's done (logged)
    var doneBadge = isDone ? '<span class="fav-done-badge">✓ done</span>' : '';
    var qCount = (e.question_imgs || []).length;
    var aCount = (e.answer_imgs || []).length;
    var aLabel, aStyle;
    if (aCount > 0) {
      aLabel = aCount + 'A';
    } else if (e.mcq_answer) {
      aLabel = '1A';
    } else if (e.mcq_answer === null) {
      // Explicitly checked and found nothing — show red warning
      aLabel = '<span style="color:#D32F2F;font-weight:700;">0A</span>';
    } else {
      // Legacy entry (mcq_answer undefined) — neutral display, no false alarm
      aLabel = '0A';
    }
    return '<div class="fav-item">' +
      '<div class="fav-heart">♥</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div class="fav-name ib-nav-link" data-url="' + (e.source_url || '') + '" data-qname="' + (e.question_name || '') + '" style="cursor:pointer; color:#185FA5;">' + (e.question_name || '—') + doneBadge + '</div>' +
      '<div class="fav-meta">' + (e.subject || '') + ' · ' + qCount + 'Q ' + aLabel + ' · ' + (e.logged_at || '') + '</div>' +

      '</div>' +
      '<div class="fav-actions">' +
      '<button class="fav-unfav-btn" data-name="' + (e.question_name || '') + '" data-subject="' + (e.subject || 'other') + '">♡ Unfav</button>' +
      '</div>' +
      '</div>';
  }).join('');

  listEl.querySelectorAll('.fav-unfav-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name');
      var subj = this.getAttribute('data-subject');
      this.textContent = '...'; this.disabled = true;
      try {
        // Set is_favourite = false on the entry (keep it as done)
        var entry = window.IB.allEntries.find(function (e) { return e.question_name === name; });
        if (entry) {
          entry.is_favourite = false;
          await window.IB.saveCache(window.IB.allEntries);
          if (useFirebase()) await window.IB.fsWrite(entry);
          await markDoneOnPage();
          renderFavouritesPanel();
          showFavMsg('success', '"' + name + '" removed from favourites.');
        }
      } catch (e) { showFavMsg('error', 'Error: ' + e.message); this.textContent = '♡ Unfav'; this.disabled = false; }
    });
  });
}

function showFavMsg(type, text) {
  var el = document.getElementById('fav-msg');
  el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block';
  setTimeout(function () { el.style.display = 'none'; }, 3000);
}

// ── Dups panel ────────────────────────────────────────────────────────────────

function renderDupsPanel() {
  var allGroups = window.IB.duplicatesDB || [];
  var groups = allGroups.filter(function(g) { return g.status !== 'ai-rejected'; });
  var countEl = document.getElementById('dups-count');
  var listEl = document.getElementById('dup-group-list');
  if (!listEl) return;

  if (countEl) countEl.textContent = groups.length + ' group' + (groups.length !== 1 ? 's' : '');

  if (groups.length === 0) {
    listEl.innerHTML = '<div class="empty-dups">\uD83D\uDD17 No duplicate groups yet.<br>Click "+ New Group" to mark questions as duplicates.</div>';
    return;
  }

  listEl.innerHTML = groups.map(function(g) {
    var gi = allGroups.indexOf(g);
    var qList = g.questions || [];
    var primary = g.primary || qList[0] || '—';
    var others = qList.filter(function(n) { return n !== primary; });
    
    var status = g.status || 'user';
    var isAi = status === 'ai';
    var srcBadge = !isAi
      ? '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#E1F5EE;color:#0F6E56;margin-left:6px;font-weight:600;">\u270F\uFE0F User</span>'
      : '<span style="font-size:9px;padding:2px 6px;border-radius:4px;background:#EDE7F6;color:#512DA8;margin-left:6px;font-weight:600;">\uD83E\uDD16 AI</span>';

    var findUrl = function(name, groupQuestions) {
      // 1. New V2 Source of Truth: Group URL map
      if (g.urls && g.urls[name]) return g.urls[name];
      
      // 2. Fallback: Direct match in cache
      var ex = window.IB.allEntries.find(function(e) { return e.question_name === name; });
      if (ex && ex.source_url && ex.source_url !== 'undefined') return ex.source_url;
      
      // 3. Fallback: Any question in the same group that has a URL
      if (groupQuestions) {
        for (var i = 0; i < groupQuestions.length; i++) {
          var otherName = groupQuestions[i];
          if (g.urls && g.urls[otherName]) return g.urls[otherName];
          var otherEntry = window.IB.allEntries.find(function(e) { return e.question_name === otherName; });
          if (otherEntry && otherEntry.source_url && otherEntry.source_url !== 'undefined') return otherEntry.source_url;
        }
      }
      
      // 4. Last resort: Generate a search URL on ExamMate
      var u = name.toUpperCase();
      var sId = u.includes('CHEMI') ? '7' : u.includes('PHYSI') || u.includes('PHYS') ? '92' : u.includes('MATH') ? '102' : u.includes('BIOL') || u.includes('BIO') ? '93' : '';
      if (sId) {
        return 'https://www.exam-mate.com/topicalpastpapers?subject=' + sId + '&search=' + encodeURIComponent(name);
      }
      return '';
    };

    return '<div class="dup-group-card" data-gidx="' + gi + '" data-gid="' + (g.id || '') + '">' +
      '<div class="dup-group-card-header">' +
        '<span class="dup-group-primary-label">\u2605 Primary' + srcBadge + '</span>' +
        '<div style="display:flex;gap:5px;">' +
          '<button class="dup-group-edit-btn" data-gidx="' + gi + '">Edit</button>' +
          '<button class="dup-group-del-btn" data-gid="' + (g.id || '') + '" data-is-ai="' + (isAi?'1':'0') + '" title="Remove duplicate group" style="background:none;border:1px solid #f5c6c6;border-radius:5px;color:#A32D2D;cursor:pointer;padding:2px 7px;font-size:11px;">\uD83D\uDDD1</button>' +
        '</div>' +
      '</div>' +
      '<div class="dup-group-primary-name ib-nav-link" data-qname="' + primary + '" data-url="' + findUrl(primary, qList) + '" data-open-dups="1" style="cursor:pointer; color:#185FA5;">' + primary + '</div>' +
      (others.length > 0 ?
        '<div class="dup-group-others">' +
          '<div class="dup-group-other-label">Other duplicates</div>' +
          others.map(function(n) { 
            return '<div class="dup-group-other-name ib-nav-link" data-qname="' + n + '" data-url="' + findUrl(n, qList) + '" data-open-dups="1" style="cursor:pointer; color:#185FA5;">' + n + '</div>'; 
          }).join('') +
        '</div>' : '') +
    '</div>';
  }).join('');

  listEl.querySelectorAll('.dup-group-edit-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var idx = parseInt(this.getAttribute('data-gidx'), 10);
      var g = (window.IB.duplicatesDB || [])[idx];
      if (!g) return;
      window.IB.openDuplicateModal(g.id);
    });
  });

  listEl.querySelectorAll('.dup-group-del-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var gid = this.getAttribute('data-gid');
      var isAi = this.getAttribute('data-is-ai') === '1';
      if (!gid) return;

      if (isAi) {
        if (!confirm('Permanently REJECT this AI-detected duplicate?')) return;
        chrome.runtime.sendMessage({ action: 'removeDuplicateGroup', groupId: gid, reject: true }, function() {
          chrome.runtime.sendMessage({ action: 'getDupData' }, function(res) {
            if (res && res.groups) { window.IB.duplicatesDB = res.groups; renderDupsPanel(); }
          });
        });
      } else {
        if (!confirm('Remove this duplicate group?')) return;
        chrome.runtime.sendMessage({ action: 'removeDuplicateGroup', groupId: gid, reject: false }, function() {
          chrome.runtime.sendMessage({ action: 'getDupData' }, async function(res) {
            if (res && res.groups) { 
              window.IB.duplicatesDB = res.groups; 
              if (typeof markDoneOnPage === 'function') await markDoneOnPage();
              renderDupsPanel(); 
            }
          });
        });
      }
    });
  });
}


function renderDBPanel() {
  // Non-primary duplicates are excluded from all counts and the list
  function isNonPrimaryDup(e) {
    return !!window.IB.isNonPrimaryDuplicate(e.question_name);
  }
  var visibleEntries = window.IB.allEntries.filter(function(e) { return !isNonPrimaryDup(e); });
  var completedEntries = visibleEntries.filter(function(e) { return e.logged_at; });
  var subjects = new Set(visibleEntries.map(function(e) { return e.subject; }));

  document.getElementById('stat-total').textContent = visibleEntries.length;
  var completedEl = document.getElementById('stat-completed');
  if (completedEl) completedEl.textContent = completedEntries.length;
  document.getElementById('stat-subjects').textContent = subjects.size;
  renderEntryList();
}

function renderEntryList() {
  function isNonPrimaryDup(e) {
    return !!window.IB.isNonPrimaryDuplicate(e.question_name);
  }

  var filter = (document.getElementById('db-filter').value || '').toLowerCase();
  var filtered = window.IB.allEntries.filter(function (e) {
    if (isNonPrimaryDup(e)) return false; // hide non-primary dups
    if (!filter) return true;
    return (e.question_name || '').toLowerCase().includes(filter) ||
           (e.subject || '').toLowerCase().includes(filter) ||
           (e.old_topics || '').toLowerCase().includes(filter);
  });
  var listEl = document.getElementById('entry-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-db">' + (window.IB.allEntries.filter(function(e){return !isNonPrimaryDup(e);}).length === 0 ?
      'No questions marked as done yet.<br>Go to an ExamMate page and use the Log tab.' :
      'No results for "' + filter + '"') + '</div>';
    return;
  }

  // Group by subject
  var today = new Date().toISOString().split('T')[0];
  var groups = {};
  filtered.forEach(function(e) {
    var s = e.subject || 'other';
    if (!groups[s]) groups[s] = [];
    groups[s].push(e);
  });

  var SUBJECT_ORDER = ['biology', 'chemistry', 'physics', 'economics', 'glo_pol', 'philosophy', 'psychology', 'religions', 'mathematics', 'other'];
  var SUBJECT_LABELS = { 
    biology: '🌿 Biology', 
    chemistry: '⚗ Chemistry', 
    physics: '⚛ Physics', 
    economics: '📈 Economics',
    glo_pol: '⚖ Global Politics',
    philosophy: '📜 Philosophy',
    psychology: '🧠 Psychology',
    religions: '🕊 World Religions',
    mathematics: '∑ Mathematics', 
    other: '📚 Other' 
  };
  var SUBJECT_COLORS = { 
    biology: '#2E7D32', 
    chemistry: '#00897B', 
    physics: '#1565C0', 
    economics: '#E65100',
    glo_pol: '#1B5E20',
    philosophy: '#4E342E',
    psychology: '#AD1457',
    religions: '#F9A825',
    mathematics: '#6A1B9A', 
    other: '#555' 
  };

  var allSubjects = Object.keys(groups).sort(function(a, b) {
    var ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  // Helper to extract the code from question_name (handles M21-BIOLO..., MathAA/33..., MAT/20...)
  function extractSubjectCode(name) {
    if (!name) return 'other';
    var parts = name.split(/[-/]/);
    if (parts.length === 0) return 'other';
    
    var first = parts[0].trim();
    // If first part is a year/session prefix (e.g. M21, N19, 2025), the code is the second part
    if (parts.length > 1 && (/^[MN]\d{2}$/i.test(first) || /^\d{4}$/.test(first))) {
      return parts[1].trim();
    }
    return first;
  }

  var html = '';
  allSubjects.forEach(function(subj) {
    var entries = groups[subj];
    // Sort entries within the subject group by their actual course code to keep variations together
    entries.sort(function(a, b) {
      var codeA = extractSubjectCode(a.question_name), codeB = extractSubjectCode(b.question_name);
      if (codeA !== codeB) return codeA.localeCompare(codeB);
      return (b.logged_at || '').localeCompare(a.logged_at || ''); // then by date
    });

    var label = SUBJECT_LABELS[subj] || subj;
    var color = SUBJECT_COLORS[subj] || '#555';
    html += '<div class="db-subject-heading" style="color:' + color + ';">' + label + '<span class="db-subject-count">' + entries.length + '</span></div>';
    
    var lastCode = null;
    entries.forEach(function(e, idx) {
      var currentCode = extractSubjectCode(e.question_name);
      
      // Look ahead to check if the NEXT item will trigger a divider
      var nextEntry = entries[idx + 1];
      var nextCode = nextEntry ? extractSubjectCode(nextEntry.question_name) : null;
      var isFollowedByDivider = nextCode && nextCode !== currentCode;
      
      // Inject the small divider when the syllabus/code changes within the same parent
      var dividerHtml = '';
      if (lastCode && currentCode !== lastCode) {
        dividerHtml = '<div class="db-sub-divider"></div>';
      }
      lastCode = currentCode;

      var favIcon = e.is_favourite ? '<span style="color:#FF8F00;margin-left:4px;font-size:10px;">♥</span>' : '';
      var isTodo = e.todo_date === today;
      var todoBadge = isTodo ? '<span class="db-todo-badge">📋 To‑Do</span>' : '';
      var isPrimaryDup = (window.IB.duplicatesDB || []).some(function(g) { return g.primary === e.question_name && g.status !== 'ai-rejected'; });
      var dupBadge = isPrimaryDup ? '<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:#E6F1FB;color:#185FA5;margin-left:4px;font-weight:600;">🔗 primary</span>' : '';
      var timeStr = e.logged_at || '<span class="db-not-done">NOT DONE YET</span>';
      var qCount = (e.question_imgs || []).length;
      var qLabel = qCount > 0 ? qCount + 'Q' : '<span style="color:#D32F2F;font-weight:700;">0Q</span>';
      var aCount = (e.answer_imgs || []).length;
      var aStr;
      if (aCount > 0) {
        aStr = aCount + 'A';
      } else if (e.mcq_answer) {
        aStr = '1A';
      } else {
        // Red warning if no images OR no MCQ answer
        aStr = '<span style="color:#D32F2F;font-weight:700;">0A</span>';
      }

      html += dividerHtml + 
        '<div class="entry-item' + (isFollowedByDivider ? ' no-border' : '') + '">' +
        '<div style="flex:1;min-width:0;">' +
          '<div class="entry-name ib-nav-link" data-url="' + (e.source_url || '') + '" data-qname="' + (e.question_name || '') + '" style="cursor:pointer; color:' + color + ';">' + (e.question_name || '—') + favIcon + todoBadge + dupBadge + '</div>' +
          '<div class="entry-meta">' + currentCode + ' · ' + qLabel + ' ' + aStr + ' · ' + timeStr + '</div>' +
        '</div>' +
        '<button class="del-btn" data-name="' + (e.question_name || '') + '" data-subject="' + (e.subject || 'other') + '">✕</button>' +
      '</div>';
    });
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll('.del-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      var name = this.getAttribute('data-name'), subj = this.getAttribute('data-subject');
      try {
        if (useFirebase()) await window.IB.fsDelete(subj, name);
        window.IB.allEntries = window.IB.allEntries.filter(function (e) { return e.question_name !== name; });
        await window.IB.saveCache(window.IB.allEntries); await markDoneOnPage(); renderDBPanel();
      } catch (e) { showMsg('error', 'Delete failed: ' + e.message); }
    });
  });
}

document.addEventListener('click', function(e) {
  var navLink = e.target.closest('.ib-nav-link');
  if (navLink) {
    var url = navLink.getAttribute('data-url');
    var qname = navLink.getAttribute('data-qname');
    if (url && qname && url !== 'undefined') {
      try {
        var u = new URL(url);
        u.searchParams.set('ib_focus', qname);
        u.searchParams.set('search', qname); // Force sidebar filter for reliable focus
        if (navLink.getAttribute('data-open-dups') === '1') {
          u.searchParams.set('ib_open_dups', '1');
        }
        var finalUrl = u.toString();
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0] && tabs[0].url && tabs[0].url.indexOf('exam-mate.com') !== -1) {
            chrome.tabs.update(tabs[0].id, {url: finalUrl});
          } else {
            chrome.tabs.create({url: finalUrl});
          }
        });
      } catch(ex) {}
    }
  }
});

// ── UI helpers ────────────────────────────────────────────────────────────────

function showMsg(type, text) { var el = document.getElementById('inline-msg'); if (!el) return; el.textContent = text; el.className = 'inline-msg ' + type; el.style.display = 'block'; }
function clearMsg() { var el = document.getElementById('inline-msg'); if (el) el.style.display = 'none'; }

function showZeroAnswerToast(questionName) {
  var toastEl = document.getElementById('zero-answer-toast');
  if (!toastEl) return;
  toastEl.innerHTML = '⚠ 0 Answers found for <strong>' + (questionName || 'this question') + '</strong>.<br>' +
    'Please <a href="https://github.com/harshp2008/exam-mate-helper/issues" target="_blank">file a GitHub Issue</a>.';
  toastEl.style.display = 'block';
  clearTimeout(toastEl._timeout);
  toastEl._timeout = setTimeout(function() { toastEl.style.display = 'none'; }, 6000);
}
