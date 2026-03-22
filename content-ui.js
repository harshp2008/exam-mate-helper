// content-ui.js — UI Overlay and Toast Handlers for IB Exam Logger

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

// ── Toast Notifications ───────────────────────────────────────────────────────

function showTodoToast(count) {
  var existing = document.getElementById('ib-todo-toast');
  if (existing) existing.remove();
  
  var toast = document.createElement('div');
  toast.id = 'ib-todo-toast';
  toast.innerHTML = count + " questions in today's queue." +
    '<button id="ib-toast-view-btn">View queue &rarr;</button>' +
    '<button id="ib-toast-dismiss-btn">&#10005;</button>';
    
  document.body.appendChild(toast);
  
  var viewBtn = document.getElementById('ib-toast-view-btn');
  if(viewBtn) {
     viewBtn.onclick = function() {
       chrome.runtime.sendMessage({ action: 'openTodayPanel' });
       toast.remove();
     };
  }
  var dismissBtn = document.getElementById('ib-toast-dismiss-btn');
  if(dismissBtn) {
    dismissBtn.onclick = function() { toast.remove(); };
  }
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 5000);
}

function showStatusToast(mode) {
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

  if (mode === 'firebase') {
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
}
