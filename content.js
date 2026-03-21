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
    'div.col-xl-3.col-lg-4.pe-lg-0 { width:270px; padding-left: 0px; padding-right: 0px }',
    'div.col-xl-9.col-lg-8.ps-lg-1 { width: calc(100% - 300px); padding-right: 0px;}',
    '#body-vertical-page { padding-bottom: 0px;}',
    'div.d-block.q-topics {text-align: left;}',
    'img.img-fluid {text-align: center;}',
    '#app>div.row:nth-child(2) { justify-content: center;}',
    'ul.list-unstyled.topnav-menu.topnav-menu-left.m-0.d-flex {display: none !important;}',
    'div.navbar-custom {height: 0px !important;}',
    'img.rounded-circle{ width: 250%; margin-left: -8px; margin-top: -10px;}',


    // ── Done question colours ──
    '#questions-list1 li.done {',
    '  background-color: #E8F5E9 !important;',
    '  border-left: 3px solid #4CAF50 !important;',
    '}',
    '#questions-list1 li.active.done {',
    '  background-color: #FFF176 !important;',
    '  border-left: 3px solid #F9A825 !important;',
    '}',

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

// ── Done checkboxes ───────────────────────────────────────────────────────────

function injectDoneCheckboxes() {
  if (IB_CHECKBOXES_INJECTED) return;
  var list = document.getElementById('questions-list1');
  if (!list) return;
  IB_CHECKBOXES_INJECTED = true;

  list.querySelectorAll('li[id^="qid-"]').forEach(function (li) {
    injectCheckboxIntoLi(li);
  });

  // Watch for dynamically added li items (pagination / lazy load)
  var observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType === 1 && node.tagName === 'LI' && node.id && node.id.startsWith('qid-')) {
          injectCheckboxIntoLi(node);
        }
      });
    });
  });
  observer.observe(list, { childList: true });
}

function injectCheckboxIntoLi(li) {
  if (li.querySelector('.ib-done-btn')) return;

  var nameSpan = li.querySelector('span');
  var question_name = nameSpan ? nameSpan.textContent.trim() : null;
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

  targetSpan.appendChild(favBtn);
  targetSpan.appendChild(doneBtn);
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
    var raw = attr.slice(s, e + 1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\\//g, '/');
    return JSON.parse(raw);
  } catch (ex) { return null; }
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

  // Wait for question list to appear then inject checkboxes
  function tryInject() {
    if (document.getElementById('questions-list1')) {
      injectDoneCheckboxes();
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
      logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href,
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
        logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href,
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
      list.querySelectorAll('li[id^="qid-"]').forEach(function (li) {
        var nameSpan = li.querySelector('span');
        var name = nameSpan ? nameSpan.textContent.trim() : null;
        if (name && loggedNames.has(name)) li.classList.add('done');
        else li.classList.remove('done');
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
