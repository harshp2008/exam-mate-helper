// content-helpers.js — Utility functions for IB Exam Logger content scripts

export function inferSubject(name) {
  var upper = (name || '').toUpperCase();
  if (upper.includes('CHEMI')) return 'chemistry';
  if (upper.includes('PHYSI') || upper.includes('PHYS')) return 'physics';
  if (upper.includes('MATH') || upper.includes('MATHS')) return 'mathematics';
  if (upper.includes('BIOL') || upper.includes('BIO')) return 'biology';
  return 'other';
}

export function parseOnclickData(li) {
  var elements = [li].concat(Array.from(li.querySelectorAll('*')));
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i];
    var attr = el.getAttribute('onclick') || el.getAttribute('wire:click') || 
               el.getAttribute('data-onclick') || el.getAttribute('x-on:click') || '';
               
    if (!attr && el.tagName === 'A' && el.href && el.href.includes('{')) {
       attr = el.href;
    }
    
    var s = attr.indexOf('{'), e = attr.lastIndexOf('}');
    if (s !== -1 && e !== -1) {
      try {
        var raw = attr.slice(s, e + 1).replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\\\\\\\\\\//g, '/');
        var parsed = JSON.parse(raw);
        if (parsed && (parsed.question_images || parsed.answer_images || parsed.question_id || parsed.id)) {
           return parsed;
        }
      } catch (ex) {}
    }
  }
  return null;
}

export function getMcqAnswer(parsed) {
  var answerImgs = parsed ? (parsed.answer_images || []) : [];
  if (answerImgs.length > 0) return null;
  var el = document.getElementById('answer-text-1');
  return el ? el.textContent.trim() : null;
}

export function updateButtonStates(doneNames, favNames) {
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

export function checkEmptyFocusState() {
  var existingMsg = document.getElementById('ib-empty-focus-msg');
  if (existingMsg) existingMsg.remove();

  if (!document.body.classList.contains('ib-focus-mode')) return;

  var list = document.getElementById('questions-list1');
  if (!list) return;

  var visibleTodos = list.querySelectorAll('li.ib-todo').length;
  // If there are exactly 0 to-do items rendered on this page:
  if (visibleTodos === 0) {
    var msgLi = document.createElement('li');
    msgLi.id = 'ib-empty-focus-msg';
    msgLi.className = 'list-group-item'; 
    msgLi.style.textAlign = 'center';
    msgLi.style.padding = '40px 20px';
    msgLi.style.color = '#555';
    msgLi.style.border = 'none';
    msgLi.style.background = 'transparent';
    msgLi.innerHTML = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions on this page.</h5><p style="font-size:13px;">Scanning your active to-do list pages...</p>';
    list.appendChild(msgLi);

    chrome.runtime.sendMessage({ action: 'getTodoPages' }, function(response) {
      console.log("--- EXAM-MATE HELPER: EMPTY FOCUS STATE ---");
      console.log("Response Stats from Background:", response ? response.stats : 'null');
      
      if (!response || !response.stats || Object.keys(response.stats).length === 0) {
        msgLi.innerHTML = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions remaining!</h5><p style="font-size:13px;">You have cleared your queues.</p>';
        return;
      }
      
      var html = '<h5 style="margin-bottom:15px;color:#185FA5;">No to-do questions on this page.</h5>' +
                 '<p style="font-size:13px; margin-bottom:15px;">Try these pages instead:</p>';
                 
      var subjects = Object.keys(response.stats).sort();
      subjects.forEach(function(subj) {
        var subjTitle = subj.charAt(0).toUpperCase() + subj.slice(1);
        html += '<div style="text-align:left; max-width: 320px; margin: 0 auto 15px auto;">';
        html += '<h6 style="font-weight:bold; margin-bottom:8px; border-bottom: 1px solid #ddd; padding-bottom: 4px;">' + subjTitle + '</h6>';
        
        var urls = Object.keys(response.stats[subj]);
        urls.forEach(function(url) {
          var stat = response.stats[subj][url];
          var pageLabel = 'Page ' + (stat.page || 1);
          
          html += '<a href="' + url + '" style="display:block; margin:4px 0; padding:8px 12px; background:#F8F9FA; border:1px solid #E0E0E0; border-radius:6px; text-decoration:none; color:#333; transition: background 0.2s;">' +
                  '<div style="font-weight:600; color:#185FA5;">' + pageLabel + '</div>' +
                  '<div style="font-size:12px; color:#666; margin-top:3px;">' + stat.total + ' questions, ' + stat.solved + ' solved</div>' +
                  '</a>';
        });
        
        html += '</div>';
      });
      
      msgLi.innerHTML = html;
    });
  }
}
