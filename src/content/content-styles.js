// content-styles.js — Injects CSS for IB Exam Logger
window.IB = window.IB || {};

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
    'div.col-xl-9.col-lg-8.ps-lg-1 { width: calc(100% - 325px) !important; padding-right: 0px; transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1); }',
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

    // ── Duplicate right sidebar ──
    // Make the row a non-wrapping flex row so sidebar sits beside the columns
    '#app > div.row { flex-wrap: nowrap !important; align-items: stretch !important; }',
    '#ib-dup-sidebar {',
    '  display: flex; position: relative;',
    '  width: 0px; min-width: 0px; max-width: 0px; overflow: hidden; flex-shrink: 0; flex-grow: 0;',
    '  opacity: 0; visibility: hidden; border: 0 !important; margin: 0 !important;',
    '  transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.2s cubic-bezier(0.4, 0, 0.2, 1), max-width 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.15s ease-out, visibility 0.2s, margin 0.2s;',
    '  background: #fff;',
    '  flex-direction: column;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  height: 80vh; box-sizing: border-box;',
    '}',
    '#ib-dup-sidebar.open { width: 340px; min-width: 340px; max-width: 340px; opacity: 1; visibility: visible; overflow-y: auto; border: 2px solid #9cb6d8 !important; margin-left: 7px !important; border-radius: 15px; }',
    '/* Two-column widths with sidebar closed (default — already set elsewhere) */',
    '/* Shrink question-view panel when sidebar is open */',
    '#app > div.row.ib-dup-open div.col-xl-9.col-lg-8.ps-lg-1 {',
    '  width: calc(100% - 325px - 340px) !important;',
    '}',
    '#ib-dup-sidebar .ibo-inner { padding: 16px 14px; display: flex; flex-direction: column; gap: 0; min-width: 340px; position: relative; box-sizing: border-box; }',
    '#ib-dup-sidebar .ibo-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }',
    '#ib-dup-sidebar .ibo-title { font-size: 15px; font-weight: 700; color: #185FA5; display: flex; align-items: center; gap: 8px; }',
    '#ib-dup-sidebar .ibo-close { background: none; border: 1px solid #ddd; border-radius: 6px; padding: 3px 9px; cursor: pointer; font-size: 13px; color: #555; }',
    '#ib-dup-sidebar .ibo-close:hover { background: #f5f5f5; }',
    '#ib-dup-sidebar .ibo-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #888; letter-spacing: 0.05em; margin: 10px 0 5px; }',
    '#ib-dup-sidebar .ibo-chips { display: flex; flex-wrap: wrap; gap: 5px; min-height: 28px; padding: 6px; background: #f5f8fc; border: 1px dashed #c5d8ef; border-radius: 8px; }',
    '#ib-dup-sidebar .ibo-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; padding: 3px 9px; border-radius: 10px; background: #E6F1FB; color: #185FA5; font-weight: 500; }',
    '#ib-dup-sidebar .ibo-chip.primary { background: #185FA5; color: #fff; }',
    '#ib-dup-sidebar .ibo-chip-rm { background: none; border: none; color: inherit; cursor: pointer; font-size: 10px; opacity: 0.65; line-height: 1; padding: 0; }',
    '#ib-dup-sidebar .ibo-chip-rm:hover { opacity: 1; }',
    '#ib-dup-sidebar .ibo-search { width: 100%; padding: 7px 10px; border: 1px solid #ddd; border-radius: 7px; font-size: 12px; background: #fafafa; color: #1a1a1a; box-sizing: border-box; }',
    '#ib-dup-sidebar .ibo-search:focus { outline: none; border-color: #185FA5; }',
    '#ib-dup-sidebar .ibo-results { margin-top: 5px; border: 1px solid #eee; border-radius: 7px; overflow: hidden; max-height: 140px; overflow-y: auto; }',
    '#ib-dup-sidebar .ibo-result { padding: 7px 10px; cursor: pointer; font-size: 12px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #f5f5f5; transition: background 0.12s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '#ib-dup-sidebar .ibo-result:last-child { border-bottom: none; }',
    '#ib-dup-sidebar .ibo-result:hover { background: #E6F1FB; }',
    '#ib-dup-sidebar .ibo-no-results { padding: 8px 10px; font-size: 11px; color: #aaa; text-align: center; }',
    '#ib-dup-sidebar .ibo-manual-row { display: flex; gap: 6px; margin-top: 5px; }',
    '#ib-dup-sidebar .ibo-manual-input { flex: 1; padding: 7px 10px; border: 1px solid #ddd; border-radius: 7px; font-size: 11px; background: #fafafa; min-width: 0; }',
    '#ib-dup-sidebar .ibo-manual-input:focus { outline: none; border-color: #185FA5; }',
    '#ib-dup-sidebar .ibo-add-btn { padding: 7px 11px; background: #185FA5; color: #fff; border: none; border-radius: 7px; font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap; }',
    '#ib-dup-sidebar .ibo-add-btn:hover { background: #0C447C; }',
    '#ib-dup-sidebar .ibo-primary-select { width: 100%; padding: 7px 10px; border: 1px solid #ddd; border-radius: 7px; font-size: 12px; background: #fafafa; color: #1a1a1a; box-sizing: border-box; }',
    '#ib-dup-sidebar .ibo-primary-select:focus { outline: none; border-color: #185FA5; }',
    '#ib-dup-sidebar .ibo-footer { display: flex; gap: 6px; justify-content: flex-end; margin-top: 14px; border-top: 1px solid #f0f0f0; padding-top: 10px; flex-wrap: wrap; }',
    '#ib-dup-sidebar .ibo-save { padding: 8px 18px; background: #185FA5; color: #fff; border: none; border-radius: 7px; font-size: 12px; font-weight: 700; cursor: pointer; transition: background 0.15s; }',
    '#ib-dup-sidebar .ibo-save:hover:not(:disabled) { background: #0C447C; }',
    '#ib-dup-sidebar .ibo-save:disabled { background: #aaa; cursor: not-allowed; }',
    '#ib-dup-sidebar .ibo-cancel { padding: 8px 13px; background: #fff; color: #555; border: 1px solid #ddd; border-radius: 7px; font-size: 12px; cursor: pointer; }',
    '#ib-dup-sidebar .ibo-cancel:hover { background: #f5f5f5; }',
    '#ib-dup-sidebar .ibo-remove-group { padding: 8px 13px; background: #fff; color: #A32D2D; border: 1px solid #f5c6c6; border-radius: 7px; font-size: 12px; cursor: pointer; }',
    '#ib-dup-sidebar .ibo-remove-group:hover { background: #FCEBEB; }',
    '#ib-dup-sidebar .ibo-msg { font-size: 11px; padding: 6px 10px; border-radius: 6px; display: none; margin-bottom: 7px; }',
    '#ib-dup-sidebar .ibo-msg.error { background: #FCEBEB; color: #A32D2D; display: block; }',
    '#ib-dup-sidebar .ibo-msg.success { background: #E1F5EE; color: #0F6E56; display: block; }',
    '#ib-dup-sidebar .ibo-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-left: 5px; }',
    '#ib-dup-sidebar .ibo-badge.done { background: #E1F5EE; color: #0F6E56; }',
    '#ib-dup-sidebar .ibo-badge.pending { background: #FFF3E0; color: #854F0B; }',
    '#ib-dup-sidebar .ibo-existing-note { font-size: 10px; color: #888; font-style: italic; margin-bottom: 6px; padding: 4px 7px; background: #f8f9fa; border-radius: 5px; }',

    // ── Duplicate (non-primary) sidebar items ──
    '#questions-list1 li.ib-dup-secondary .ib-qname-text { color: #aaa !important; font-style: italic; }',
    '#questions-list1 li.ib-dup-secondary .ib-dup-label { font-size: 10px; font-weight: 700; color: #bbb; letter-spacing: 0.03em; margin-left: 4px; }',
    '#questions-list1 li.ib-dup-secondary .ib-fav-btn, #questions-list1 li.ib-dup-secondary .ib-done-btn, #questions-list1 li.ib-dup-secondary .ib-todo-checkbox { display: none !important; }',

    // ── Duplicate hover tooltip ──
    '.ib-dup-tooltip {',
    '  position: fixed; z-index: 99997; background: #fff; border: 1px solid #dce8f5;',
    '  border-radius: 10px; box-shadow: 0 6px 24px rgba(24,95,165,0.18);',
    '  padding: 12px 14px; min-width: 200px; max-width: 280px;',
    '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;',
    '  font-size: 12px; pointer-events: none; opacity: 0; transition: opacity 0.2s;',
    '}',
    '.ib-dup-tooltip.visible { opacity: 1; }',
    '.ib-dup-tooltip-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #185FA5; letter-spacing: 0.05em; margin-bottom: 8px; }',
    '.ib-dup-tooltip-row { font-size: 11px; color: #555; margin-bottom: 4px; }',
    '.ib-dup-tooltip-row strong { color: #185FA5; display: block; font-size: 11px; margin-bottom: 2px; }',
    '.ib-dup-tooltip-name { font-size: 11px; color: #333; padding: 1px 0; display: flex; align-items: center; gap: 4px; }',
    '.ib-dup-tooltip-name::before { content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #185FA5; flex-shrink: 0; }',
    '.ib-dup-tooltip-name.other::before { background: #bbb; }',

    // new styles to fix layout issues in repsonse to the duplicate sidebar breaking everything (made by human)

    'div.p-0.card.card-body, div.ibo-inner {max-height: 600px; overflow: hidden;}',
    '#app > div.row > div.col-xl-3.col-lg-4.pe-lg-0 > div > div.question-list  {display: flex; flex-direction: column; overflow: hidden;}',
    '#app > div.row {padding: 0; margin: 0; display: flex; flex-direction: row; height: 600px;}',
    '#ib-dup-sidebar { padding: 0px; }',
    'div.open {height: 100% !important;}',
    'div.row.ib-dup-open {display: flex; flex-direction: row; width: 100%;}',
    '#app > div.row.ib-dup-open > div.col-xl-9.col-lg-8.ps-lg-1 {flex-grow: 1;}',
    'div.content-page {padding-bottom: 4px; padding-top: 5px;}',
    '#ib-dup-sidebar {height: 100% !important;}',
    '#app > div.row > div.col-xl-9.col-lg-8.ps-lg-1 {flex-grow: 1;}',
    '#ib-dup-nav-item a.nav-link:focus, #ib-dup-nav-item a.nav-link:active { background-color: transparent !important; outline: none !important; box-shadow: none !important; }',
    '#ib-copy-nav-item a.nav-link:focus, #ib-copy-nav-item a.nav-link:active { background-color: transparent !important; outline: none !important; box-shadow: none !important; }',
    
    // ── Quick Copy Sidebar Styles ──
    '.ibo-copy-container { display: flex; flex-direction: column; gap: 12px; padding: 10px; overflow-y: auto; flex: 1; width: 100%; box-sizing: border-box; }',
    '.ibo-copy-row { display: flex; align-items: stretch; gap: 0; padding: 0; background: #f9fbff; border: 1px solid #e0e8f5; border-radius: 10px; transition: background 0.15s; position: relative; width: 100%; box-sizing: border-box; overflow: hidden; }',
    '.ibo-copy-row:hover { background: #f0f5ff; }',
    '.ibo-copy-content { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; border-right: 1px dashed #cedbed; padding: 10px; }',
    '.ibo-copy-content img { width: 100%; max-width: 100%; height: auto; border-radius: 4px; cursor: zoom-in; display: block; }',
    '.ibo-copy-content .ibo-copy-text { font-size: 12px; color: #333; line-height: 1.4; word-break: break-word; font-family: monospace; }',
    '.ibo-copy-action { width: 45px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: rgba(24, 95, 165, 0.03); }',
    '.ibo-copy-btn { background: none; border: none; color: #185FA5; cursor: pointer; padding: 0; width: 100%; height: 100%; transition: background 0.15s; display: flex; align-items: center; justify-content: center; }',
    '.ibo-copy-btn:hover { background: rgba(24, 95, 165, 0.08); }',
    '.ibo-copy-btn:active { background: rgba(24, 95, 165, 0.15); }',
    '.ibo-copy-label { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #9cb6d8; letter-spacing: 0.05em; margin-bottom: 2px; }'

  ].join('\n');
  document.head.appendChild(style);
}

function injectHighPriorityCSS() {
  const ID = 'ib-high-priority-styles';
  const existing = document.getElementById(ID);
  if (existing) existing.remove();

  var style = document.createElement('style');
  style.id = ID;
  style.textContent = '#question-image-box-1 > div > img { padding-bottom: 100px !important; }';
  document.head.appendChild(style);
}
