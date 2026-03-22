// popup-render.js — UI render functions for IB Exam Logger

// ── View switching ────────────────────────────────────────────────────────────

function switchView(view) {
  if (window.IB.previousView === 'settings' && view !== 'settings') {
    showStatusToast();
  }

  ['log', 'today', 'favourites', 'db', 'settings'].forEach(function (v) {
    var p = document.getElementById('panel-' + v);
    if (p) p.classList.toggle('active', v === view);
    var btn = document.getElementById('btn-' + v + '-view');
    if (btn) btn.classList.toggle('active-tab', v === view);
  });
  if (view === 'today') renderTodayPanel();
  if (view === 'db') renderDBPanel();
  if (view === 'favourites') renderFavouritesPanel();
  if (view === 'settings') populateSettingsUI();

  window.IB.previousView = view;
}

function showStatusToast() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0] && tabs[0].url.includes('exam-mate.com')) {
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
  document.getElementById('a-img-count').textContent = data.answer_imgs.length + ' A';
  
  var topicsEl = document.getElementById('old-topics-val');
  if (data.old_topics) {
    topicsEl.innerHTML = data.old_topics.split(',').map(function (t) { return '<span class="tag-pill">' + t.trim() + '</span>'; }).join('');
  } else { topicsEl.textContent = 'None found'; }

  var logged = window.IB.allEntries.some(function (e) { return e.question_name === data.question_name; });
  document.getElementById('already-logged-row').style.display = logged ? 'flex' : 'none';
  var logBtn = document.getElementById('log-btn');
  logBtn.disabled = false; logBtn.classList.remove('success');
  document.getElementById('log-btn-text').textContent = logged ? 'Log again (update)' : 'Log this question';
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
  var doneCount = todayItems.filter(function(e) {
    return !!e.logged_at; 
  }).length;

  var panel = document.getElementById('panel-today');
  if (!panel) return;
  
  if (todayItems.length === 0) {
    panel.innerHTML = '<div class="empty-today">No questions queued for today.<br>' +
      'Use the ☐ Select button in the<br>ExamMate sidebar to build your queue.</div>';
    return;
  }

  var pct = Math.round((doneCount / todayItems.length) * 100);
  
  panel.innerHTML =
    '<div class="today-progress">' +
      '<span>' + doneCount + ' / ' + todayItems.length + ' done</span>' +
      '<div class="today-progress-bar">' +
        '<div class="today-progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<button class="today-clear-btn" id="today-clear-btn">Clear queue</button>' +
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

  document.getElementById('today-clear-btn').addEventListener('click', async function() {
    if (!confirm('Clear all ' + todayItems.length + ' questions from today\'s queue?')) return;
    var btn = this;
    btn.textContent = '...'; btn.disabled = true;
    todayItems.forEach(function(e) { e.todo_date = null; });
    await window.IB.saveCache(window.IB.allEntries);
    if (useFirebase()) {
      for (var i = 0; i < todayItems.length; i++) {
        try { await window.IB.fsWrite(todayItems[i]); } catch(_) {}
      }
    }
    await markDoneOnPage();
    // Also reset checkboxes in the sidebar's todo-edit mode if it's open
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { action: 'resetTodoCheckboxes' });
    });
    renderTodayPanel();
  });
}

// ── Favourites panel ──────────────────────────────────────────────────────────

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
    return '<div class="fav-item">' +
      '<div class="fav-heart">♥</div>' +
      '<div style="flex:1;min-width:0;">' +
      '<div class="fav-name ib-nav-link" data-url="' + (e.source_url || '') + '" data-qname="' + (e.question_name || '') + '" style="cursor:pointer; color:#185FA5;">' + (e.question_name || '—') + doneBadge + '</div>' +
      '<div class="fav-meta">' + (e.subject || '') + ' · ' + qCount + 'Q ' + aCount + 'A · ' + (e.logged_at || '') + '</div>' +

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

// ── DB panel ──────────────────────────────────────────────────────────────────

function renderDBPanel() {
  var subjects = new Set(window.IB.allEntries.map(function (e) { return e.subject; }));
  document.getElementById('stat-total').textContent = window.IB.allEntries.length;

  document.getElementById('stat-subjects').textContent = subjects.size;
  renderEntryList();
}

function renderEntryList() {
  var filter = (document.getElementById('db-filter').value || '').toLowerCase();
  var filtered = window.IB.allEntries.filter(function (e) {
    if (!filter) return true;
    return (e.question_name || '').toLowerCase().includes(filter) || (e.subject || '').toLowerCase().includes(filter) || (e.old_topics || '').toLowerCase().includes(filter);
  });
  var listEl = document.getElementById('entry-list');
  if (filtered.length === 0) {
    listEl.innerHTML = '<div class="empty-db">' + (window.IB.allEntries.length === 0 ? 'No questions logged yet.<br>Go to an ExamMate page and log questions.' : 'No results for "' + filter + '"') + '</div>';
    return;
  }
  listEl.innerHTML = filtered.map(function (e) {
    var favIcon = e.is_favourite ? '<span style="color:#FF8F00;margin-left:4px;font-size:10px;">♥</span>' : '';
    return '<div class="entry-item"><div style="flex:1;min-width:0;"><div class="entry-name ib-nav-link" data-url="' + (e.source_url || '') + '" data-qname="' + (e.question_name || '') + '" style="cursor:pointer; color:#185FA5;">' + (e.question_name || '—') + favIcon + '</div><div class="entry-meta">' + (e.subject || '') + ' · ' + (e.question_imgs || []).length + 'Q ' + (e.answer_imgs || []).length + 'A · ' + (e.logged_at || '') + '</div></div><button class="del-btn" data-name="' + (e.question_name || '') + '" data-subject="' + (e.subject || 'other') + '">✕</button></div>';
  }).join('');
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
        var finalUrl = u.toString();
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0] && tabs[0].url && tabs[0].url.includes('exam-mate.com')) {
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
