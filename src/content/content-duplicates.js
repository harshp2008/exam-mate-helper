// content-duplicates.js — Auto-detect duplicates, duplicate sidebar, image comparison

// ── Configuration ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('[IB] Content Script Received Action:', request.action);
  if (request.action === 'ping') {
    sendResponse({ pong: true });
    return;
  }
  if (request.action === 'rescanDuplicates') {
    if (typeof window.IB !== 'undefined' && typeof window.IB.rescanPage === 'function') {
      console.log('[IB] Forwarding to IB.rescanPage()...');
      window.IB.rescanPage();
    } else {
      console.log('[IB] window.IB.rescanPage not found, falling back to autoFindDuplicates(true)...');
      autoFindDuplicates(true);
    }
    sendResponse({ ok: true });
  }
});

var IB_DUP_TOLERANCE = 0.96; // Similarity threshold (0-1) for auto-detection
var IB_COMPARE_RES    = 800;  // Balanced high resolution (reduced from 1200 to prevent freezing)

// ── IB Name parser ────────────────────────────────────────────────────────────

/**
 * Parses an IB question name into its components.
 * Format: SUBJECT/PaperTz_Level_Season_Year_Qnum
 * e.g.  PHYSI/22_HL_Winter_2023_Q1  →  { subject:'PHYSI', paper:'2', tz:'2', rest:'HL_Winter_2023_Q1' }
 * Returns null if name doesn't match the expected pattern.
 */
function parseIBName(name) {
  // Format: SUBJECT/PaperTz_Level_Season_Year_Qnum
  // e.g. PHYSI/22_HL_Summer_2021_Q1
  // Regex Breakdown:
  // 1: Subject (PHYSI)
  // 2: Paper (2)
  // 3: Timezone (2)
  // 4: Level (SL or HL or MATSD etc)
  // 5: Season (Summer or Winter)
  // 6: Year (2021)
  // 7: QNum (1)
  var m = (name || '').match(/^([A-Z]+)[\/\-]?(\d)(\d)[_ ]?([A-Z0-9]+)_([A-Za-z]+)_(\d{4})_Q?(\d+)$/i);
  if (m) {
    return {
      subject: m[1].toUpperCase(),
      paper: m[2],
      tz: parseInt(m[3], 10),
      level: m[4].toUpperCase(),
      season: m[5].toLowerCase(),
      year: m[6],
      qNum: m[7],
      isDetailed: true
    };
  }
  
  // Relaxed fallback
  var fallback = (name || '').match(/^([A-Z]+)[\/\-]?(\d)(\d)[_ ]?(.+)$/i);
  if (!fallback) return null;
  return { 
    subject: fallback[1].toUpperCase(), 
    paper: fallback[2], 
    tz: parseInt(fallback[3], 10), 
    rest: fallback[4],
    isDetailed: false
  };
}

/**
 * Trims white borders from an ImageData object.
 * Returns a new canvas with the trimmed content.
 */
function trimImage(img, W, H) {
  var data = img.data;
  var top = 0, bottom = H - 1, left = 0, right = W - 1;

  var isRowWhite = function(y) {
    for (var x = 0; x < W; x++) {
      var i = (y * W + x) * 4;
      if (data[i] < 240 || data[i+1] < 240 || data[i+2] < 240) return false;
    }
    return true;
  };
  var isColWhite = function(x) {
    for (var y = 0; y < H; y++) {
      var i = (y * W + x) * 4;
      if (data[i] < 240 || data[i+1] < 240 || data[i+2] < 240) return false;
    }
    return true;
  };

  while (top < H && isRowWhite(top)) top++;
  while (bottom > top && isRowWhite(bottom)) bottom--;
  while (left < W && isColWhite(left)) left++;
  while (right > left && isColWhite(right)) right--;

  var newW = right - left + 1;
  var newH = bottom - top + 1;
  if (newW <= 5 || newH <= 5) return null; // Too small to be a question content

  var canvas = document.createElement('canvas');
  canvas.width = newW; canvas.height = newH;
  var ctx = canvas.getContext('2d');
  ctx.putImageData(img, -left, -top, left, top, newW, newH);
  return canvas;
}

/**
 * Computes a Difference Hash (dHash) for an image.
 * Resizes to 17x16 to produce a 256-bit (16x16) hash.
 */
function computeDHash(imageSource) {
  var size = 32; // Upgrade to 32x32 (1024-bit) for superior precision
  var canvas = document.createElement('canvas');
  canvas.width = size + 1; canvas.height = size;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(imageSource, 0, 0, size + 1, size);
  var imgData = ctx.getImageData(0, 0, size + 1, size).data;

  var hash = "";
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var i1 = (y * (size + 1) + x) * 4;
      var i2 = (y * (size + 1) + (x + 1)) * 4;
      // Simple grayscale: (r+g+b)/3
      var g1 = (imgData[i1] + imgData[i1+1] + imgData[i1+2]) / 3;
      var g2 = (imgData[i2] + imgData[i2+1] + imgData[i2+2]) / 3;
      hash += (g1 > g2 ? "1" : "0");
    }
  }
  return hash;
}

function getHammingDistance(h1, h2) {
  var dist = 0;
  for (var i = 0; i < h1.length; i++) {
    if (h1[i] !== h2[i]) dist++;
  }
  return dist;
}


/**
 * Computes average pixel-level similarity (0–1) across ALL image pairs.
 * Loads images at native resolution. Does NOT set crossOrigin (same-origin CDN).
 * Uses willReadFrequently:true to suppress the console warning.
 */
  function loadImg(url) {
    if (!url) return Promise.reject(new Error('null_url'));
    return new Promise(function(res, rej) {
      var img = new Image();
      img.onload = function() { res(img); };
      img.onerror = function() { rej(new Error('load_failed')); };
      img.src = url; 
    });
  }

function compareAllImages(imgs1, imgs2) {
  if (!imgs1 || !imgs2 || imgs1.length !== imgs2.length || imgs1.length === 0) return Promise.resolve(0);

  function comparePair(url1, url2) {
    return Promise.all([loadImg(url1), loadImg(url2)]).then(function(imgs) {
      var img1 = imgs[0], img2 = imgs[1];
      
      // 1. Pre-process: Trim edges to align core content
      var W1 = img1.naturalWidth || img1.width || 1, H1 = img1.naturalHeight || img1.height || 1;
      var cTmp1 = document.createElement('canvas'); cTmp1.width = W1; cTmp1.height = H1;
      var ctx1 = cTmp1.getContext('2d', { willReadFrequently: true }); ctx1.drawImage(img1, 0, 0);
      var trimmed1 = trimImage(ctx1.getImageData(0, 0, W1, H1), W1, H1) || img1;

      var W2 = img2.naturalWidth || img2.width || 1, H2 = img2.naturalHeight || img2.height || 1;
      var cTmp2 = document.createElement('canvas'); cTmp2.width = W2; cTmp2.height = H2;
      var ctx2 = cTmp2.getContext('2d', { willReadFrequently: true }); ctx2.drawImage(img2, 0, 0);
      var trimmed2 = trimImage(ctx2.getImageData(0, 0, W2, H2), W2, H2) || img2;

      // 2. Perform Perceptual Hash comparison (on trimmed content)
      var hash1 = computeDHash(trimmed1);
      var hash2 = computeDHash(trimmed2);
      var hDist = getHammingDistance(hash1, hash2);
      var hashSim = 1 - (hDist / hash1.length);

      // Early exit for near-identical hashes
      if (hashSim > 0.98) return hashSim;

      // 3. Fallback: Structural Pixelmatch with Micro-Alignment Shift
      var TW1 = trimmed1.width, TH1 = trimmed1.height;
      var TW2 = trimmed2.width, TH2 = trimmed2.height;
      var W = Math.min(TW1, TW2), H = Math.min(TH1, TH2);
      if (W > IB_COMPARE_RES) { H = Math.round(H * IB_COMPARE_RES / W); W = IB_COMPARE_RES; }
      if (H > IB_COMPARE_RES) { W = Math.round(W * IB_COMPARE_RES / H); H = IB_COMPARE_RES; }

      function getMatchScore(dy) {
        var c1 = document.createElement('canvas'); c1.width = W; c1.height = H;
        var cx1 = c1.getContext('2d', { willReadFrequently: true });
        cx1.drawImage(trimmed1, 0, Math.max(0, dy), TW1, TH1 - Math.abs(dy), 0, 0, W, H);
        
        var c2 = document.createElement('canvas'); c2.width = W; c2.height = H;
        var cx2 = c2.getContext('2d', { willReadFrequently: true });
        cx2.drawImage(trimmed2, 0, Math.max(0, -dy), TW2, TH2 - Math.abs(dy), 0, 0, W, H);
        
        var d1 = cx1.getImageData(0, 0, W, H), d2 = cx2.getImageData(0, 0, W, H);
        var mismatch = pixelmatch(d1.data, d2.data, null, W, H, { threshold: 0.1 });
        return 1 - (mismatch / (W * H));
      }

      var baseScore = getMatchScore(0);
      if (baseScore > 0.97 || baseScore < 0.75) return Math.max(baseScore, hashSim);

      // Alignment Shift: Try sliding images vertically to find better overlap (+/- 5px)
      var bestScore = baseScore;
      var searchPoints = [-5, -3, -1, 1, 3, 5];
      for (var s = 0; s < searchPoints.length; s++) {
        var shifted = getMatchScore(searchPoints[s]);
        if (shifted > bestScore) {
          bestScore = shifted;
          if (bestScore > 0.97) break;
        }
      }
      return Math.max(bestScore, hashSim);
    }).catch(function(err) {
      console.error('[IB Auto-Dup] Pair error:', err);
      return 0;
    });
  }

  var pairs = [];
  for (var i = 0; i < imgs1.length; i++) {
    pairs.push(comparePair(imgs1[i], imgs2[i]));
  }

  return Promise.all(pairs).then(function(scores) {
    if (scores.length === 0) return 0;
    var minScore = Math.min.apply(null, scores);
    return minScore < 0 ? 0 : minScore;
  });
}

// ── Auto-detect duplicate questions ───────────────────────────────────────────

var _autoDupRunning = false;

function showToast(msg, type) {
  var id = 'ib-dup-toast';
  var el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    el.style = 'position:fixed;bottom:20px;right:20px;z-index:99999;padding:12px 20px;border-radius:8px;background:#333;color:#fff;font-size:13px;box-shadow:0 4px 12px rgba(0,0,0,0.2);transition:opacity 0.3s;display:flex;align-items:center;gap:10px;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.innerHTML = (type === 'loading' ? '<span class="ib-spin">⌛</span> ' : (type === 'success' ? '✨ ' : '🔍 ')) + msg;
  el.style.opacity = '1';
  if (type !== 'loading') {
    setTimeout(function() { if (el) el.style.opacity = '0'; }, 4000);
  }
}

// Export for cross-script access
window.IB = window.IB || {};
window.IB.showToast = showToast;

function autoFindDuplicates(isManual) {
  if (_autoDupRunning && !isManual) return;
  _autoDupRunning = true;
  window.IB.autoFindDuplicates = autoFindDuplicates;
  
  // V2 FAIL-SAFE: If scan hangs, force reset
  var safetyTimer = setTimeout(function() { _autoDupRunning = false; }, 15000);
  
  startScanInternal(isManual);
}

// V2 REFIX: Unified rescan chain for manual overrides
window.IB.rescanWithReset = function() {
  _autoDupRunning = false; // Force unlock
  if (typeof showToast === 'function') showToast('🔍 Preparing rescan (clearing previous rejections)...', 'loading');

  var list = document.getElementById('questions-list1');
  var visibleNames = [];
  if (list) {
    visibleNames = Array.from(list.querySelectorAll('li[id^="qid-"]')).map(function(li) {
      var sp = li.querySelector('.ib-qname-text') || li.querySelector('span');
      return sp ? (sp.getAttribute('data-realname') || sp.textContent.trim()) : '';
    }).filter(Boolean);
  }

  chrome.runtime.sendMessage({ action: 'clearRejectionsForPage', questionNames: visibleNames }, function(res) {
    console.log('[IB] Rejections cleared for rescan:', res);
    // V2 REFIX: Must pass true here to ensure completion toast clears the loading toast
    setTimeout(function() { autoFindDuplicates(true); }, 500);
  });
};

function startScanInternal(isManual) {
    console.log('[IB Auto-Dup] Starting Pixel Scan...');
    
    // V2 REFIX: Load settings for primary-selection preferences
    chrome.storage.local.get(['ib_settings', 'ib_duplicates_cache'], async function(res) {
      if (chrome.runtime.lastError || !res) { 
        _autoDupRunning = false; return; 
      }
      var settings = res.ib_settings || {};
      var dupPrefs = settings.dupPrefs || {};

      chrome.runtime.sendMessage({ action: 'getDupData' }, async function(res2) {
        if (!res2) { _autoDupRunning = false; return; }
        var entries = res2.entries || [];
        var existingGroups = res2.groups || [];

        // Build a set of question names already in any group
        var alreadyGrouped = new Set();
        existingGroups.forEach(function(g) {
          (g.questions || []).forEach(function(n) { alreadyGrouped.add(n); });
        });

        var pageImgMap = {};  // name → [imgUrls]
        var pageItems = document.querySelectorAll('#questions-list1 li[id^="qid-"], .ib-question-item');
        
        pageItems.forEach(function(li) {
          var data = (typeof parseOnclickData === 'function') ? parseOnclickData(li) : null;
          var textEl = li.querySelector('.ib-qname-text') || li.querySelector('span');
          var realName = textEl ? (textEl.getAttribute('data-realname') || textEl.textContent.trim()) : '';
          
          if (realName && data && data.question_images && data.question_images.length > 0) {
            pageImgMap[realName] = data.question_images;
          }
        });

        // 3. Build the pool: entries from background + harvested from current page
        var pool = [].concat(entries);
        Object.keys(pageImgMap).forEach(function(pName) {
          var existingIdx = pool.findIndex(function(e) { return e.question_name === pName; });
          if (existingIdx !== -1) {
            if ((!pool[existingIdx].question_imgs || pool[existingIdx].question_imgs.length === 0) && pageImgMap[pName].length > 0) {
              pool[existingIdx].question_imgs = pageImgMap[pName];
            }
          } else {
            pool.push({
              question_name: pName,
              question_imgs: pageImgMap[pName],
              subject: (typeof inferSubject === 'function') ? inferSubject(pName) : 'other'
            });
          }
        });

        // 1. DUAL-QUEUE PREP
        var pageQueue = []; // Questions currently on page
        var dbQueue   = []; // Questions in historical cache
        var pageYears = new Set();

        // Populate pageQueue
        Object.keys(pageImgMap).forEach(function(pName) {
          var meta = (typeof parseIBName === 'function') ? parseIBName(pName) : null;
          if (meta) {
            pageQueue.push({ entry: { question_name: pName, question_imgs: pageImgMap[pName] }, meta: meta });
            if (meta.year) pageYears.add(parseInt(meta.year));
          }
        });

        // Determine relevant year range (+/- 1 year buffer)
        var minYear = pageYears.size > 0 ? Math.min.apply(null, Array.from(pageYears)) - 1 : 0;
        var maxYear = pageYears.size > 0 ? Math.max.apply(null, Array.from(pageYears)) + 1 : 3000;

        // Populate dbQueue (Pruned by year)
        entries.forEach(function(e) {
          if (pageImgMap[e.question_name]) return; // Skip if already in pageQueue

          var meta = (typeof parseIBName === 'function') ? parseIBName(e.question_name) : null;
          if (meta && meta.isDetailed) {
            var y = parseInt(meta.year);
            if (y >= minYear && y <= maxYear) {
              dbQueue.push({ entry: e, meta: meta });
            }
          }
        });

        console.log('[IB Auto-Dup] Dual-Queue: Page(' + pageQueue.length + '), Relevant-DB(' + dbQueue.length + ')');

        var foundAny = false;
        var hashCache = {};
        var sessionProcessed = new Set(); // Global processed for this session

        async function getEntryHashes(entry) {
          if (hashCache[entry.question_name]) return hashCache[entry.question_name];
          var urls = entry.question_imgs || [];
          var hashes = [];
          for (var k = 0; k < Math.min(urls.length, 2); k++) {
            try { 
              var img = await loadImg(urls[k]);
              hashes.push(computeDHash(img));
            } catch(e) { hashes.push(null); }
          }
          hashCache[entry.question_name] = hashes;
          return hashes;
        }

        async function processMatch(itemA, itemB, similarity) {
          var e1 = itemA.entry, e2 = itemB.entry;
          var p1 = itemA.meta,  p2 = itemB.meta;
          
          console.log('[IB Auto-Dup] MATCH FOUND: ' + e1.question_name + ' vs ' + e2.question_name + ' (' + Math.round(similarity*100) + '%)');
          foundAny = true;
          sessionProcessed.add(e2.question_name);

          // Identify Primary (Priority Level HL > Preference Level > Newer TZ)
          var subjKey = (itemA.entry.subject || 'other').toLowerCase();
          var prefLevel = (res.ib_settings.dupPrefs?.[subjKey] || 'HL').toUpperCase();
          var primary = e1.question_name, duplicate = e2.question_name;
          
          if ((p2.level || '').toUpperCase() === prefLevel && (p1.level || '').toUpperCase() !== prefLevel) {
            primary = e2.question_name; duplicate = e1.question_name;
          } else if (p2.tz > p1.tz) {
            primary = e2.question_name; duplicate = e1.question_name;
          }

          var dupGroup = {
            id: 'dup_auto_' + Math.random().toString(36).substr(2,9),
            questions: [primary, duplicate], primary: primary, status: 'ai', urls: {}
          };
          dupGroup.urls[primary] = window.location.href;
          dupGroup.urls[duplicate] = window.location.href;

          return new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'saveDuplicateGroup', group: dupGroup }, function(saveRes) {
              if (saveRes && saveRes.ok) console.log('[IB] Auto-duplicate saved.');
              else if (saveRes && saveRes.error === 'conflict') console.log('[IB Auto-Dup] Group merge rejected due to QNum conflict (Same paper sanity check).');
              resolve();
            });
          });
        }

        // --- STAGE 1: INTERNAL PAGE SWEEP ---
        console.log('[IB Auto-Dup] Stage 1: Internal Page Sweep...');
        for (var i = 0; i < pageQueue.length; i++) {
          var itemA = pageQueue[i];
          if (sessionProcessed.has(itemA.entry.question_name)) continue;

          for (var j = i + 1; j < pageQueue.length; j++) {
            var itemB = pageQueue[j];
            if (sessionProcessed.has(itemB.entry.question_name)) continue;

            // Priority: Match only if same Subject/Year/Season/Paper
            if (itemA.meta.subject !== itemB.meta.subject || itemA.meta.year !== itemB.meta.year || itemA.meta.season !== itemB.meta.season) continue;
            
            // Hard Stop: Same Paper conflict (Q1 vs Q2)
            if (itemA.meta.paper === itemB.meta.paper && itemA.meta.tz === itemB.meta.tz && itemA.meta.qNum !== itemB.meta.qNum) continue;

            // 2. Already matched check
            var alreadyMatch = existingGroups.find(function(g) {
              return (g.questions || []).includes(itemA.entry.question_name) && (g.questions || []).includes(itemB.entry.question_name);
            });
            if (alreadyMatch) continue;

            var h1 = await getEntryHashes(itemA.entry), h2 = await getEntryHashes(itemB.entry);
            var bestHashSim = (h1[0] && h2[0]) ? (1 - (getHammingDistance(h1[0], h2[0]) / h1[0].length)) : 0;
            if (bestHashSim < 0.90) continue;

            var similarity = await compareAllImages(itemA.entry.question_imgs, itemB.entry.question_imgs);
            if (similarity >= IB_DUP_TOLERANCE) {
              await processMatch(itemA, itemB, similarity);
            }
          }
        }

        // --- STAGE 2: TARGETED DB SWEEP ---
        console.log('[IB Auto-Dup] Stage 2: Targeted DB Sweep...');
        for (var i = 0; i < pageQueue.length; i++) {
          var itemA = pageQueue[i];
          if (sessionProcessed.has(itemA.entry.question_name)) continue;

          for (var j = 0; j < dbQueue.length; j++) {
            var itemB = dbQueue[j];
            if (sessionProcessed.has(itemB.entry.question_name)) continue;

            // 1. Same-Paper Identity Check (Instruction: Prune duplicates in same paper)
            // If they share everything but have different QNums, they CANNOT be dups.
            if (itemA.meta.subject === itemB.meta.subject && itemA.meta.year === itemB.meta.year && 
                itemA.meta.season === itemB.meta.season && itemA.meta.paper === itemB.meta.paper && 
                itemA.meta.tz === itemB.meta.tz && itemA.meta.level === itemB.meta.level && 
                itemA.meta.qNum !== itemB.meta.qNum) {
              continue;
            }

            // 2. Already matched check
            var alreadyMatch = existingGroups.find(function(g) {
              return (g.questions || []).includes(itemA.entry.question_name) && (g.questions || []).includes(itemB.entry.question_name);
            });
            if (alreadyMatch) continue;

            // 3. Heuristic match (Same QNum is far more likely)
            var h1 = await getEntryHashes(itemA.entry), h2 = await getEntryHashes(itemB.entry);
            var bestHashSim = (h1[0] && h2[0]) ? (1 - (getHammingDistance(h1[0], h2[0]) / h1[0].length)) : 0;
            
            // If QNum is different, hash similarity must be extremely high to consider
            var reqHash = (itemA.meta.qNum === itemB.meta.qNum) ? 0.90 : 0.98;
            if (bestHashSim < reqHash) continue;

            var similarity = await compareAllImages(itemA.entry.question_imgs, itemB.entry.question_imgs);
            if (similarity >= IB_DUP_TOLERANCE) {
              await processMatch(itemA, itemB, similarity);
            }
          }
        }
        
        _autoDupRunning = false;
        if (isManual) {
          if (foundAny) showToast('✅ Rescan complete!', 'success');
          else showToast('No new duplicates found on this page.', 'success');
        }
    });
  });
}

// ── Duplicate button (question panel navbar) ──────────────────────────────────

function injectDupButton() {
  var navUl = document.querySelector('#question > div > div.row > div > ul');
  if (!navUl) return;
  
  if (!document.getElementById('ib-dup-nav-item')) {
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
      if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      var sidebar = document.getElementById('ib-dup-sidebar');
      if (sidebar && sidebar.classList.contains('open') && sidebar.getAttribute('data-mode') === 'dup') {
        closeDupSidebar();
        return;
      }
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

  if (!document.getElementById('ib-copy-nav-item')) {
    var copyNavItem = document.createElement('li');
    copyNavItem.className = 'nav-item';
    copyNavItem.id = 'ib-copy-nav-item';
    copyNavItem.title = 'Quickly copy question/answer images or text';
    copyNavItem.innerHTML = '<a href="javascript:void(0);" class="nav-link">' +
      '<span style="font-size:14px;display:block;text-align:center;line-height:1;">\uD83D\uDCCB</span>' +
      '<span style="font-size:0.6rem;font-weight:700"> Copy </span>' +
      '</a>';
    copyNavItem.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget && e.currentTarget.blur) e.currentTarget.blur();
      var sidebar = document.getElementById('ib-dup-sidebar');
      if (sidebar && sidebar.classList.contains('open') && sidebar.getAttribute('data-mode') === 'copy') {
        closeDupSidebar();
        return;
      }
      openCopySidebar();
    });
    navUl.appendChild(copyNavItem);
  }
}

function setupDupButtonObserver() {
  if (window._ibDupObserver) return;
  var observer = new MutationObserver(function() {
    injectDupButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window._ibDupObserver = observer;
}

// ── Duplicate right sidebar ───────────────────────────────────────────────────

// In-memory state for the current sidebar session
var _iboGroup = { id: null, questions: [], primary: '', status: 'user' };
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
        status:         existingGroup.status || 'user'
      };
    } else {
      _iboGroup = {
        id:             'dup_' + Date.now(),
        questions:      currentQName ? [currentQName] : [],
        primary:        currentQName || '',
        status:         'user'
      };
    }

    buildDupSidebarContent();
    
    // Open the sidebar with a short delay/retry if the element isn't in DOM yet (due to ensureDupSidebar timeout)
    function tryShow() {
      var sidebar = document.getElementById('ib-dup-sidebar');
      var row = document.querySelector('#app > div.row');
      if (sidebar && row) {
        sidebar.setAttribute('data-mode', 'dup');
        sidebar.classList.add('open');
        row.classList.add('ib-dup-open');
      } else {
        setTimeout(tryShow, 100);
      }
    }
    tryShow();
  });
}

function openCopySidebar() {
  ensureDupSidebar();

  var list = document.getElementById('questions-list1');
  var activeLi = list ? list.querySelector('li.active[id^="qid-"]') : null;
  var data = activeLi ? (typeof parseOnclickData === 'function' ? parseOnclickData(activeLi) : null) : null;

  var items = [];
  if (data) {
    // Add Question Images
    (data.question_images || []).forEach(url => items.push({ type: 'image', value: url, label: 'Question Image' }));
    // Add Answer Images
    (data.answer_images || []).forEach(url => items.push({ type: 'image', value: url, label: 'Answer Image' }));
    // Add MCQ Answer Text if applicable
    var mcq = (typeof getMcqAnswer === 'function') ? getMcqAnswer(data) : null;
    if (mcq) items.push({ type: 'text', value: mcq, label: 'MCQ Answer' });
  }

  // Fallback: If no data from onclick, try parsing from DOM
  if (items.length === 0) {
    document.querySelectorAll('#question-image-box-1 img.img-fluid').forEach(img => {
      if (img.src) items.push({ type: 'image', value: img.src, label: 'Question Image (Parsed)' });
    });
    var ansBox = document.getElementById('answer-text-1');
    if (ansBox) {
      ansBox.querySelectorAll('img').forEach(img => {
        if (img.src) items.push({ type: 'image', value: img.src, label: 'Answer Image (Parsed)' });
      });
      var txt = ansBox.textContent.trim();
      if (txt) items.push({ type: 'text', value: txt, label: 'Answer Text' });
    }
  }

  buildCopySidebarContent(items);

  function tryShow() {
    var sidebar = document.getElementById('ib-dup-sidebar');
    var row = document.querySelector('#app > div.row');
    if (sidebar && row) {
      sidebar.setAttribute('data-mode', 'copy');
      sidebar.classList.add('open');
      row.classList.add('ib-dup-open');
    } else {
      setTimeout(tryShow, 100);
    }
  }
  tryShow();
}

function buildCopySidebarContent(items) {
  var inner = document.getElementById('ibo-inner');
  if (!inner) return;

  inner.innerHTML =
    '<div class="ibo-header">' +
      '<div class="ibo-title">\uD83D\uDCCB Quick Copy</div>' +
      '<button class="ibo-close" id="ibo-close-btn">\u2715</button>' +
    '</div>' +
    '<div class="ibo-copy-container" id="ibo-copy-container" style="flex: 1; padding-bottom: 20px;">' +
      (items.length === 0 ? '<div class="ibo-no-results">No images or text found for this question.</div>' : '') +
      items.map((item, idx) => `
        <div class="ibo-copy-row">
          <div class="ibo-copy-content">
            <div class="ibo-copy-label">${item.label}</div>
            ${item.type === 'image' 
              ? `<img src="${item.value}" title="Click to enlarge" onclick="window.open(this.src, '_blank')">`
              : `<div class="ibo-copy-text">${item.value}</div>`
            }
          </div>
          <div class="ibo-copy-action">
            <button class="ibo-copy-btn" data-idx="${idx}" title="Copy to clipboard">
              <span style="font-size:18px;">\ud83d\udccb</span>
            </button>
          </div>
        </div>
      `).join('') +
    '</div>';

  inner.querySelector('#ibo-close-btn').onclick = closeDupSidebar;

  inner.querySelectorAll('.ibo-copy-btn').forEach(btn => {
    btn.onclick = function() {
      var idx = parseInt(this.getAttribute('data-idx'));
      var item = items[idx];
      var self = this;
      
      this.style.opacity = '0.5';
      this.innerHTML = '<span style="font-size:18px;">⌛</span>';

      copyItemToClipboard(item.type, item.value).then(() => {
        self.innerHTML = '<span style="font-size:18px;">✅</span>';
        if (typeof showToast === 'function') showToast('Copied to clipboard!', 'success');
      }).catch(err => {
        console.error('Copy failed:', err);
        self.innerHTML = '<span style="font-size:18px;">❌</span>';
        if (typeof showToast === 'function') showToast('Failed to copy', 'error');
      }).finally(() => {
        setTimeout(() => {
          self.style.opacity = '1';
          self.innerHTML = '<span style="font-size:18px;">\ud83d\udccb</span>';
        }, 1500);
      });
    };
  });
}

function copyItemToClipboard(type, value) {
  if (type === 'text') {
    return navigator.clipboard.writeText(value);
  } else {
    // 🎨 Standard Active-Clipboard (Ctrl+V) Implementation
    // This uses the modern Web API to fetch the image and write it as a PNG blob.
    // Extremely reliable for manual pasting, though often ignored by Win+V History.
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = function() {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          canvas.toBlob(blob => {
            if (!blob) {
              reject(new Error('Failed to create canvas blob'));
              return;
            }
            try {
              const item = new ClipboardItem({ 'image/png': blob });
              navigator.clipboard.write([item]).then(resolve).catch(reject);
            } catch (e) {
              reject(e);
            }
          }, 'image/png');
        } catch (e) {
          reject(e);
        }
      };
      
      img.onerror = function() {
        reject(new Error('Failed to load image from ' + value));
      };

      // Ensure absolute URL
      img.src = value.startsWith('/') ? window.location.origin + value : value;
    });
  }
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
  var autoNote = (_iboGroup.status === 'ai' && isExisting)
    ? '<div class="ibo-existing-note">\uD83E\uDD16 Auto-detected by AI system</div>' : '';
  var existingNote = (_iboGroup.status !== 'ai' && isExisting)
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
    '</div>' +
    
    // Reset Warning Overlay
    '<div id="ibo-reset-warning" class="ibo-reset-warning" style="display:none;position:absolute;inset:0;background:#fff;z-index:9999;flex-direction:column;padding:20px;align-items:center;justify-content:center;text-align:center;">' +
      '<div style="font-size:32px;margin-bottom:10px;">\u26A0\uFE0F</div>' +
      '<div style="font-size:15px;font-weight:700;color:#d32f2f;margin-bottom:8px;">Data Reset Required</div>' +
      '<div style="font-size:12px;color:#555;line-height:1.4;margin-bottom:12px;">Only the primary question can have status data. Saving will reset Logged, Favourite, and Todo status for:</div>' +
      '<div id="ibo-reset-list" style="margin:8px 0;padding:8px;background:#fff5f5;border:1px solid #ffcdd2;border-radius:6px;width:100%;max-height:100px;overflow-y:auto;text-align:left;font-family:monospace;font-size:11px;"></div>' +
      '<div style="display:flex;gap:8px;width:100%;margin-top:10px;">' +
        '<button id="ibo-reset-cancel-btn" style="flex:1;padding:8px;border-radius:4px;border:none;background:#f0f0f0;color:#444;font-weight:600;cursor:pointer;">Cancel</button>' +
        '<button id="ibo-reset-confirm-btn" style="flex:1;padding:8px;border-radius:4px;border:none;background:#d32f2f;color:#fff;font-weight:600;cursor:pointer;">Confirm & Save</button>' +
      '</div>' +
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
      var isAi = (_iboGroup.status === 'ai');
      var msg = isAi ? 'Permanently REJECT this AI-detected duplicate?' : 'Remove this duplicate group?';
      if (!confirm(msg)) return;
      chrome.runtime.sendMessage({ action: 'removeDuplicateGroup', groupId: _iboGroup.id, reject: isAi }, function() {
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
  
  // Harvest any question names currently visible in the main left sidebar
  var pageNames = new Set();
  document.querySelectorAll('#questions-list1 li[id^="qid-"]').forEach(function(li) {
    var ns = li.querySelector('.ib-qname-text') || li.querySelector('span');
    var name = ns ? (ns.getAttribute('data-realname') || ns.textContent.trim()) : '';
    if (name) pageNames.add(name);
  });

  // Combine unique names from both sources
  var combined = _iboAllEntries.map(function(e) { return { name: e.question_name, logged: true }; });
  pageNames.forEach(function(pName) {
    if (!combined.some(function(c) { return c.name === pName; })) {
      combined.push({ name: pName, logged: false });
    }
  });

  var matches = combined.filter(function(c) {
    return !inGroup.has(c.name) && (c.name || '').toLowerCase().includes(query);
  }).slice(0, 15);

  resultsEl.style.display = 'block';
  if (matches.length === 0) {
    resultsEl.innerHTML = '<div class="ibo-no-results">No results — use "Add manually" below.</div>';
    return;
  }
  resultsEl.innerHTML = matches.map(function(m) {
    var entry = _iboAllEntries.find(function(e) { return e.question_name === m.name; });
    var isDone = entry ? !!entry.logged_at : false;
    // Check if already in another group
    var inOtherGroup = _iboAllGroups.some(function(g) {
      return g.id !== _iboGroup.id && g.questions && g.questions.indexOf(m.name) !== -1;
    });
    var badge = inOtherGroup
      ? '<span class="ibo-badge pending">in other group</span>'
      : (isDone ? '<span class="ibo-badge done">\u2713 done</span>' : '<span class="ibo-badge pending">' + (m.logged ? 'logged' : 'on page') + '</span>');
    return '<div class="ibo-result' + (inOtherGroup ? ' ibo-result-conflict' : '') + '" data-name="' + m.name + '" data-conflict="' + (inOtherGroup ? '1' : '0') + '">' +
      '<span style="overflow:hidden;text-overflow:ellipsis;">' + m.name + '</span>' + badge +
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

    _iboGroup.status = 'user';
  g.status = 'user'; // V2 PURGE: Promote to user-verified on manual save

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

  // Violation Check: Non-primary questions with data
  var violations = g.questions.filter(function(name) {
    if (name === g.primary) return false;
    var ex = _iboAllEntries.find(function(e) { return e.question_name === name; });
    return ex && (ex.logged_at || ex.is_favourite || ex.todo_date);
  });

  if (violations.length > 0 && !window._iboResetConfirmed) {
    var warningEl = document.getElementById('ibo-reset-warning');
    var listEl    = document.getElementById('ibo-reset-list');
    if (warningEl && listEl) {
      listEl.innerHTML = violations.map(function(v) { return '\u2022 ' + v; }).join('<br>');
      warningEl.style.display = 'flex';
      
      document.getElementById('ibo-reset-cancel-btn').onclick = function() {
        warningEl.style.display = 'none';
      };
      document.getElementById('ibo-reset-confirm-btn').onclick = function() {
        warningEl.style.display = 'none';
        window._iboResetConfirmed = true;
        iboSave(); // Retry
      };
      return;
    }
  }
  window._iboResetConfirmed = false;

  var saveBtn = document.getElementById('ibo-save-btn');
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Saving\u2026'; }

  var groupToSave = {
    id:             g.id,
    questions:      g.questions,
    primary:        g.primary,
    status:         'user',
    urls:           g.urls || {}
  };

  // Capture current URL and map it to the current question name if possible
  var currentUrl = window.location.href;
  var nameMap = {};
  var activeLi = document.querySelector('#questions-list1 li.active[id^="qid-"]');
  if (activeLi) {
    var ns = activeLi.querySelector('.ib-qname-text') || activeLi.querySelector('span');
    var activeName = ns ? (ns.getAttribute('data-realname') || ns.textContent.trim()) : '';
    if (activeName) nameMap[activeName] = currentUrl;
  }

  chrome.runtime.sendMessage({ action: 'saveDuplicateGroup', group: groupToSave, nameUrls: nameMap }, function(res) {
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
