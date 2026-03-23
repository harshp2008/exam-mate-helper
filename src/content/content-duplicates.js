// content-duplicates.js — Auto-detect duplicates, duplicate sidebar, image comparison

// ── IB Name parser ────────────────────────────────────────────────────────────

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

// ── Image comparison ──────────────────────────────────────────────────────────

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

// ── Auto-detect duplicate questions ───────────────────────────────────────────

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
