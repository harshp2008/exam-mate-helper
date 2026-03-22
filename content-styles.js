// content-styles.js — Injects CSS for IB Exam Logger

var IB_STYLE_ID = 'ib-tagger-styles';

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
    'div.col-xl-3.col-lg-4.pe-lg-0 { width:300px !important; padding-left: 0px; padding-right: 0px }',
    'div.col-xl-9.col-lg-8.ps-lg-1 { width: calc(100% - 325px) !important; padding-right: 0px;}',
    '#body-vertical-page { padding-bottom: 0px;}',
    'div.d-block.q-topics {text-align: left;}',
    'img.img-fluid {text-align: center;}',
    '#app>div.row:nth-child(2) { justify-content: center;}',
    'ul.list-unstyled.topnav-menu.topnav-menu-left.m-0.d-flex {display: none !important;}',
    'div.navbar-custom {height: 0px !important;}',
    'img.rounded-circle{ width: 250%; margin-left: -8px; margin-top: -10px;}',


    // ── Done question colours & Name Wrapper ──
    ':root { --ib-border: 10px; /* Change this to edit border-left width globally */ }',
    '.ib-qname-wrapper { display: flex; align-items: center; gap: 8px; }',
    '.ib-status-rect { width: var(--ib-border); height: 18px; border-radius: 3px; background-color: transparent; }',
    '#questions-list1 li.done {',
    '  background-color: #E8F5E9 !important;',
    '  border-left: none !important;',
    '}',
    '#questions-list1 li.done .ib-status-rect { background-color: #E8F5E9 !important; }',
    '#questions-list1 li.active.done {',
    '  background-color: #FFF176 !important;',
    '  border-left: none !important;',
    '}',
    '#questions-list1 li.active.done .ib-status-rect { background-color: #FFF176 !important; }',

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

    // ── Permanently hide ExamMate\'s heart button (CSS survives Livewire re-renders) ──
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

    // ── To-Do Queue CSS ──
    '#questions-list1.ib-select-mode .ib-fav-btn, #questions-list1.ib-select-mode .ib-done-btn { display: none !important; }',
    '#questions-list1.ib-select-mode .ib-todo-checkbox { display: inline-block !important; margin-left: 6px; vertical-align: middle; }',
    '.ib-todo-checkbox { display: none; width: 16px; height: 16px; cursor: pointer; }',
    'body.ib-focus-mode #questions-list1 li[id^="qid-"]:not(.ib-todo) { display: none !important; }',
    'body.ib-focus-mode .randomdropdown, body.ib-focus-mode #ib-todo-nav-item { pointer-events: none !important; opacity: 0.4 !important; }',
    '#ib-todo-toast { position: fixed; bottom: 20px; left: 20px; background: #1a1a1a; color: white; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; z-index: 99998; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); animation: ib-slidein 0.2s ease; }',
    '#ib-todo-toast button { background: none; border: 1px solid rgba(255,255,255,0.3); color: white; padding: 3px 10px; border-radius: 5px; cursor: pointer; font-size: 12px; }',
    '#ib-todo-toast button:hover { background: rgba(255,255,255,0.1); }',
    '@keyframes ib-slidein { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }',
    
    // Priority order: done > todo > favourite
    '#questions-list1 li.ib-todo { background-color: #FFFFFF !important; border-left: none !important; }',
    '#questions-list1 li.ib-todo .ib-status-rect { background-color: #2196F3 !important; }',
    '#questions-list1 li.active.ib-todo { background-color: #E3F2FD !important; border-left: none !important; }',
    '#questions-list1 li.active.ib-todo .ib-status-rect { background-color: #1565C0 !important; }',
    '#questions-list1 li.done.ib-todo { background-color: #E8F5E9 !important; border-left: none !important; }',
    '#questions-list1 li.done.ib-todo .ib-status-rect { background-color: #4CAF50 !important; }',
    '#questions-list1 li.active.done.ib-todo { background-color: #FFF176 !important; border-left: none !important; }',
    '#questions-list1 li.active.done.ib-todo .ib-status-rect { background-color: #F9A825 !important; }',
    '#questions-list1 li.ib-todo.ib-fav:not(.done) { background-color: #FFFFFF !important; border-left: none !important; }',
    '#questions-list1 li.ib-todo.ib-fav:not(.done) .ib-status-rect { background-color: #2196F3 !important; }',
    '#questions-list1 li.done.ib-todo.ib-fav { background-color: #E8F5E9 !important; border-left: none !important; }',
    '#questions-list1 li.done.ib-todo.ib-fav .ib-status-rect { background-color: #4CAF50 !important; }',

    // improved styling for do-to-list
    'li.question-item-1.list-group-item.d-flex.justify-content-between.align-items-center {',
    '  padding-left: 0px;',
    '  padding-top: 0px !important;',
    '  padding-bottom: 0px !important;',
    '}',
    '',
    'div.ib-status-rect {',
    '  height: 36px;',
    '  border-radius: 0px;',
    '  width: 8px;',
    '}',
    '',
    'span.ib-qname-wrapper {',
    '  padding-top: 0px !important;',
    '  padding-bottom: 0px !important;',
    '  height: 100% !important;',
    '}',
    '',
    '#questions-list1 li.done.ib-todo .ib-qname-text {',
    '  text-decoration: line-through;',
    '  opacity: 0.65;',
    '}',
    '',
    'li.question-item-1.list-group-item.d-flex.justify-content-between.align-items-center {',
    '  border-bottom: 1px solid grey;',
    '}',

  ].join('\n');
  document.head.appendChild(style);
}
