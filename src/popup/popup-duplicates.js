// popup-duplicates.js — Duplicate Question Modal for IB Exam Logger

window.IB = window.IB || {};

// Current pending group being edited
window.IB._dupGroup = { id: null, questions: [], primary: '' };

// ── Open / Close modal ────────────────────────────────────────────────────────

window.IB.openDuplicateModal = function(target) {
  var modal = document.getElementById('dup-modal-overlay');
  if (!modal) return;

  var existing = null;
  if (typeof target === 'string' && target.indexOf('dup_') === 0) {
    // Target is a groupId
    existing = (window.IB.duplicatesDB || []).find(function(g) { return g.id === target; });
  } else if (target) {
    // Target is a question name
    existing = (window.IB.duplicatesDB || []).find(function(g) {
      return g.questions && g.questions.indexOf(target) !== -1;
    });
  }

  if (existing) {
    window.IB._dupGroup = { 
      id: existing.id, 
      questions: (existing.questions || []).slice(), 
      primary: existing.primary || existing.questions[0] || '',
      marked_by_user: existing.marked_by_user
    };
  } else {
    // Start fresh with the current question (if provided) or empty
    var newId = 'dup_' + Date.now();
    window.IB._dupGroup = { 
      id: newId, 
      questions: target ? [target] : [], 
      primary: target || '',
      marked_by_user: true // Manual groups are marked by user
    };
  }

  // Reset UI
  document.getElementById('dup-search-input').value = '';
  document.getElementById('dup-search-results').innerHTML = '';
  document.getElementById('dup-manual-input').value = '';
  document.getElementById('dup-modal-msg').style.display = 'none';
  renderDupChips();
  renderPrimaryDropdown();

  modal.classList.add('open');
  document.body.classList.add('ib-modal-open');
  document.getElementById('dup-search-input').focus();
};

window.IB.closeDuplicateModal = function() {
  var modal = document.getElementById('dup-modal-overlay');
  if (modal) {
    modal.classList.remove('open');
    document.body.classList.remove('ib-modal-open');
  }
};

// ── Render chips (current group members) ──────────────────────────────────────

function renderDupChips() {
  var container = document.getElementById('dup-chips');
  if (!container) return;
  var group = window.IB._dupGroup;
  if (group.questions.length === 0) {
    container.innerHTML = '<span style="color:#aaa;font-size:11px;">No questions added yet.</span>';
    return;
  }
  container.innerHTML = group.questions.map(function(name) {
    var isPrimary = name === group.primary;
    return '<span class="dup-chip' + (isPrimary ? ' dup-chip-primary' : '') + '" data-name="' + name + '">' +
      (isPrimary ? '★ ' : '') + name +
      '<button class="dup-chip-remove" data-name="' + name + '" title="Remove">✕</button>' +
      '</span>';
  }).join('');

  container.querySelectorAll('.dup-chip-remove').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var name = this.getAttribute('data-name');
      window.IB._dupGroup.questions = window.IB._dupGroup.questions.filter(function(n) { return n !== name; });
      if (window.IB._dupGroup.primary === name) {
        window.IB._dupGroup.primary = window.IB._dupGroup.questions[0] || '';
      }
      renderDupChips();
      renderPrimaryDropdown();
      // Re-run search so removed question reappears in results
      runDupSearch(document.getElementById('dup-search-input').value);
    });
  });
}

// ── Primary dropdown ──────────────────────────────────────────────────────────

function renderPrimaryDropdown() {
  var sel = document.getElementById('dup-primary-select');
  if (!sel) return;
  var group = window.IB._dupGroup;
  sel.innerHTML = group.questions.map(function(name) {
    var selected = name === group.primary ? ' selected' : '';
    return '<option value="' + name + '"' + selected + '>' + name + '</option>';
  }).join('');
  sel.disabled = group.questions.length < 2;
}

// ── Search ────────────────────────────────────────────────────────────────────

function runDupSearch(query) {
  var resultsEl = document.getElementById('dup-search-results');
  if (!resultsEl) return;
  query = (query || '').toLowerCase().trim();
  if (!query) { resultsEl.innerHTML = ''; return; }

  var inGroup = new Set(window.IB._dupGroup.questions);
  var matches = (window.IB.allEntries || [])
    .filter(function(e) {
      return !inGroup.has(e.question_name) &&
        (e.question_name || '').toLowerCase().includes(query);
    })
    .slice(0, 8);

  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="dup-no-results">No results. Use "Add manually" below.</div>';
    return;
  }

  resultsEl.innerHTML = matches.map(function(e) {
    var isDone = !!e.logged_at;
    return '<div class="dup-result-item" data-name="' + e.question_name + '">' +
      '<span class="dup-result-name">' + e.question_name + '</span>' +
      (isDone ? '<span class="dup-result-badge done">✓</span>' : '<span class="dup-result-badge pending">pending</span>') +
      '</div>';
  }).join('');

  resultsEl.querySelectorAll('.dup-result-item').forEach(function(item) {
    item.addEventListener('click', function() {
      var name = this.getAttribute('data-name');
      addToDupGroup(name);
    });
  });
}

function addToDupGroup(name) {
  if (!name || window.IB._dupGroup.questions.indexOf(name) !== -1) return;
  window.IB._dupGroup.questions.push(name);
  if (!window.IB._dupGroup.primary) window.IB._dupGroup.primary = name;
  renderDupChips();
  renderPrimaryDropdown();
  // Clear search UI
  document.getElementById('dup-search-input').value = '';
  document.getElementById('dup-search-results').innerHTML = '';
}

// ── Save ──────────────────────────────────────────────────────────────────────

window.IB.saveDuplicateGroup = async function() {
  var group = window.IB._dupGroup;
  var msgEl = document.getElementById('dup-modal-msg');

  // Promote to user-verified if manually saved
  group.marked_by_user = true;

  function showDupMsg(type, text) {
    msgEl.textContent = text;
    msgEl.className = 'inline-msg ' + type;
    msgEl.style.display = 'block';
    if (type === 'success') setTimeout(function() { msgEl.style.display = 'none'; }, 3000);
  }

  if (group.questions.length < 2) {
    showDupMsg('error', 'Add at least 2 questions to form a duplicate pair.');
    return;
  }
  if (!group.primary || group.questions.indexOf(group.primary) === -1) {
    group.primary = group.questions[0];
  }

  var saveBtn = document.getElementById('dup-save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Update local duplicatesDB
    var db = window.IB.duplicatesDB || [];
    var idx = db.findIndex(function(g) { return g.id === group.id; });
    if (idx !== -1) db[idx] = group; else db.push(group);
    window.IB.duplicatesDB = db;

    // Send to background for cascading + DB persistence
    await new Promise(function(resolve, reject) {
      chrome.runtime.sendMessage({ action: 'saveDuplicateGroup', group: group }, function(res) {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(res);
      });
    });

    // Reload local cache so repeated_question shows in panels
    window.IB.allEntries = await window.IB.loadCache();
    window.IB.duplicatesDB = await window.IB.loadDuplicates();

    showDupMsg('success', '✓ Saved! ' + group.questions.length + ' questions linked.');
    renderDupChips();
    renderPrimaryDropdown();

    // Refresh open panels
    if (document.getElementById('panel-db') && document.getElementById('panel-db').classList.contains('active')) renderDBPanel();
    if (document.getElementById('panel-dups') && document.getElementById('panel-dups').classList.contains('active')) renderDupsPanel();

    setTimeout(window.IB.closeDuplicateModal, 1500);
  } catch(e) {
    showDupMsg('error', 'Error: ' + e.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
};

// ── Wire up events (called after DOM ready) ───────────────────────────────────

window.IB.initDuplicateModal = function() {
  var searchInput = document.getElementById('dup-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() { runDupSearch(this.value); });
  }

  var primarySel = document.getElementById('dup-primary-select');
  if (primarySel) {
    primarySel.addEventListener('change', function() {
      window.IB._dupGroup.primary = this.value;
      renderDupChips();
    });
  }

  var manualAdd = document.getElementById('dup-manual-add-btn');
  if (manualAdd) {
    manualAdd.addEventListener('click', function() {
      var val = (document.getElementById('dup-manual-input').value || '').trim();
      if (!val) return;
      addToDupGroup(val);
      document.getElementById('dup-manual-input').value = '';
    });
  }

  var manualInput = document.getElementById('dup-manual-input');
  if (manualInput) {
    manualInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { document.getElementById('dup-manual-add-btn').click(); }
    });
  }

  var saveBtn = document.getElementById('dup-save-btn');
  if (saveBtn) saveBtn.addEventListener('click', window.IB.saveDuplicateGroup);

  var cancelBtn = document.getElementById('dup-cancel-btn');
  if (cancelBtn) cancelBtn.addEventListener('click', window.IB.closeDuplicateModal);

  var overlay = document.getElementById('dup-modal-overlay');
  if (overlay) {
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) window.IB.closeDuplicateModal();
    });
  }
};
