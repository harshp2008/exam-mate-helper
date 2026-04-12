// content-messages.js — Chrome message listener for IB Exam Logger content scripts

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  // Popup Edit button: open sidebar for a specific group
  if (request.action === 'openDupSidebarForGroup') {
    var gid = request.groupId;
    chrome.runtime.sendMessage({ action: 'getDupData' }, function(res) {
      var groups = (res && res.groups) || [];
      var g = groups.find(function(x) { return x.id === gid; });
      if (g && g.questions && g.questions.length > 0) {
        openDupSidebar(g.questions[0]);
      }
    });
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'scrape') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse({ error: 'Question list not found.' }); return true; }
    var activeLi = list.querySelector('li.active[id^="qid-"]');
    if (!activeLi) { sendResponse({ error: 'No active question selected in the sidebar.' }); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    if (!parsed) { sendResponse({ error: 'Could not parse onclick data.' }); return true; }
    var liId = activeLi.id || '';
    var qidMatch = liId.match(/qid-(\d+)/);
    var answerImgs = parsed.answer_images || [];
    var mcqAnswer = null;
    if (answerImgs.length === 0) {
      var mcqEl = document.getElementById('answer-text-1');
      if (mcqEl) mcqAnswer = mcqEl.textContent.trim();
    }
    if (answerImgs.length === 0 && !mcqAnswer) {
      console.warn('[EXAM-MATE HELPER] IBDP board, question ' + question_name + ', 0 Answers are found. File a Github Issue for the github repo: https://github.com/harshp2008/exam-mate-helper');
    }
    sendResponse({
      question_name: question_name, qid: qidMatch ? qidMatch[1] : null,
      subject: inferSubject(question_name || ''),
      question_imgs: parsed.question_images || [], answer_imgs: answerImgs,
      mcq_answer: mcqAnswer,
      old_topics: parsed.topics || '',
      logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href, page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1)
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
        mcq_answer: li.classList.contains('active') ? getMcqAnswer(parsed) : undefined,
        old_topics: parsed.topics || '',
        logged_at: new Date().toISOString().replace('T', ' ').substring(0, 19), source_url: window.location.href, page_num: (typeof getCurrentPageNumber === 'function' ? getCurrentPageNumber() : 1),
        is_active: li.classList.contains('active'),
      });
    });
    sendResponse({ questions: results, total: results.length });
    return true;
  }

  if (request.action === 'markDone') {
    // Called by background after sync — updates colours + checkboxes + hides overlay
    injectAllCSS();
    injectHighPriorityCSS();
    
    // V4: Use centralized Master Injector and markDone
    if (typeof triggerFullUiInjection === 'function') {
        triggerFullUiInjection(request);
    } else {
        // Fallback if init hasn't run yet
        if (typeof injectDoneCheckboxes === 'function') injectDoneCheckboxes();
        if (typeof markDone === 'function') markDone(request);
    }
    
    completeLoadingOverlay();
    sendResponse({ marked: true });
    return true;
  }

  if (request.action === 'getActiveName') {
    var list = document.getElementById('questions-list1');
    if (!list) { sendResponse(null); return true; }
    var activeLi = list.querySelector('li.active[id^="qid-"]');
    if (!activeLi) { sendResponse(null); return true; }
    var nameSpan = activeLi.querySelector('span');
    var question_name = nameSpan ? nameSpan.textContent.trim() : null;
    var parsed = parseOnclickData(activeLi);
    var answerImgsGA = parsed ? (parsed.answer_images || []) : [];
    var mcqAnswerGA = null;
    if (answerImgsGA.length === 0) {
      var mcqElGA = document.getElementById('answer-text-1');
      if (mcqElGA) mcqAnswerGA = mcqElGA.textContent.trim();
    }
    if (answerImgsGA.length === 0 && !mcqAnswerGA) {
      console.warn('[EXAM-MATE HELPER] IBDP board, question ' + question_name + ', 0 Answers are found. File a Github Issue for the github repo: https://github.com/harshp2008/exam-mate-helper');
    }
    sendResponse({
      question_name: question_name, subject: inferSubject(question_name || ''),
      question_imgs: parsed ? (parsed.question_images || []) : [],
      answer_imgs: answerImgsGA,
      mcq_answer: mcqAnswerGA,
      old_topics: parsed ? (parsed.topics || '') : '',
    });
    return true;
  }

  if (request.action === 'clickNext') {
    var list = document.getElementById('questions-list1');
    if (list) {
      var activeLi = list.querySelector('li.active[id^="qid-"]');
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
    showStatusToast(request.mode);
    sendResponse({ shown: true });
    return true;
  }

  if (request.action === 'rescanDuplicates') {
    if (window.IB && typeof window.IB.rescanWithReset === 'function') {
      window.IB.rescanWithReset();
      sendResponse({ started: true });
    } else if (typeof autoFindDuplicates === 'function') {
      autoFindDuplicates(true);
      sendResponse({ started: true });
    } else {
      sendResponse({ started: false, error: 'rescanWithReset not found' });
    }
    return true;
  }

  if (request.action === 'resetTodoCheckboxes') {
    // Called when Today page clears the queue — reset all sidebar checkboxes + in-memory sets
    ibCurrentTodoSet = new Set();
    ibInitialTodoSet = new Set();
    var list = document.getElementById('questions-list1');
    if (list) {
      list.querySelectorAll('.ib-todo-checkbox').forEach(function(cb) { cb.checked = false; });
      list.querySelectorAll('li.ib-todo').forEach(function(li) { li.classList.remove('ib-todo'); });
    }
    if (typeof updateTodoSelectionUI === 'function') updateTodoSelectionUI();
    sendResponse({ done: true });
    return true;
  }

});
