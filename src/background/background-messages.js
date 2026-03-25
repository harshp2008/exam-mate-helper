// background-messages.js — Message listener for service worker

// ── Message listener: toggleDoneFromPage + toggleFavouriteFromPage ────────────

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {

  if (request.action === 'getTodoPages') {
    (async function() {
      var entries = await loadCache();
      var today = new Date().toISOString().split('T')[0];
      
      var stats = {}; 
      
      entries.forEach(function(e) {
        if (e.todo_date === today && e.source_url) {
          var subj = e.subject || 'other';
          var isSolved = e.logged_at !== null;
          
          // Trust the raw URL first using exact string splitting
          var pageNum = 1;
          if (e.source_url && e.source_url.indexOf('page=') !== -1) {
            var parts = e.source_url.split('page=');
            var parsedNum = parseInt(parts[1], 10);
            if (!isNaN(parsedNum)) pageNum = parsedNum;
          } else if (e.page_num) {
            pageNum = e.page_num;
          }
          
          // Establish a clean base URL without 'page=' or hash
          var cleanUrl = '';
          if (e.source_url) {
            cleanUrl = e.source_url.split('#')[0].split('page=')[0];
            if (cleanUrl.endsWith('?') || cleanUrl.endsWith('&')) {
              cleanUrl = cleanUrl.slice(0, -1);
            }
          }
          var urlKey = cleanUrl + (cleanUrl.includes('?') ? '&' : '?') + 'page=' + pageNum;
          
          if (!stats[subj]) stats[subj] = {};
          if (!stats[subj][urlKey]) stats[subj][urlKey] = { total: 0, solved: 0, page: pageNum };
          
          stats[subj][urlKey].total++;
          if (isSolved) stats[subj][urlKey].solved++;
        }
      });
      sendResponse({ stats: stats });
    })();
    return true;
  }

  if (request.action === 'requestSyncState') {
    (async function() {
      var entries = await loadCache();
      var groups = await loadDuplicates();
      var today = new Date().toISOString().split('T')[0];
      var doneNames = entries.filter(function(e) { return e.logged_at !== null; }).map(function(e) { return e.question_name; });
      var favNames = entries.filter(function(e) { return e.is_favourite; }).map(function(e) { return e.question_name; });
      var todoNames = entries.filter(function(e) { return e.todo_date === today; }).map(function(e) { return e.question_name; });
      var dupInfo = {};
      groups.forEach(function(g) {
        var qList = g.questions || [];
        var markedByUser = g.marked_by_user !== false;
        qList.forEach(function(name) {
          dupInfo[name] = {
            is_primary: name === g.primary,
            linked_questions: qList.filter(function(n) { return n !== name; }),
            primary_name: g.primary || qList[0] || '',
            marked_by_user: markedByUser
          };
        });
      });
      var rejectedGroups = await loadRejectedGroups();
      sendResponse({ questionNames: doneNames, favouriteNames: favNames, todoNames: todoNames, dupInfo: dupInfo, rejectedGroups: rejectedGroups });
    })();
    return true;
  }

  if (request.action === 'openTodayPanel') {
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().then(function() {
        setTimeout(function() {
          chrome.runtime.sendMessage({ action: 'switchToToday' });
        }, 150);
      }).catch(function() {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'openDuplicateModal') {
    var qname = request.questionName || '';
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().then(function() {
        setTimeout(function() {
          chrome.runtime.sendMessage({ action: 'openDuplicateModalInPopup', questionName: qname });
        }, 200);
      }).catch(function() {});
    }
    sendResponse({ ok: true });
    return true;
  }

  if (request.action === 'getDupData') {
    (async function() {
      var entries = await loadCache();
      var groups = await loadDuplicates();
      var rejectedGroups = await loadRejectedGroups();
      sendResponse({ entries: entries, groups: groups, rejectedGroups: rejectedGroups });
    })();
    return true;
  }

  if (request.action === 'updateTodoQueue') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var today = new Date().toISOString().split('T')[0];

      var addSet = new Set(request.add || []);
      var removeSet = new Set(request.remove || []);

      entries.forEach(function(entry) {
        if (addSet.has(entry.question_name)) {
          entry.todo_date = today;
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            fsWrite(settings, entry).catch(function() {});
          }
        }
        if (removeSet.has(entry.question_name)) {
          entry.todo_date = null;
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            fsWrite(settings, entry).catch(function() {});
          }
        }
      });

      var unlogged = request.addWithData || [];
      unlogged.forEach(function(entryData) {
        var exists = entries.some(function(e) { return e.question_name === entryData.question_name; });
        if (!exists) {
          entryData.todo_date = today;
          entryData.is_favourite = false;
          entries.unshift(entryData);
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            fsWrite(settings, entryData).catch(function() {});
          }
        }
      });

      await saveCache(entries);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'toggleDoneFromPage') {
    (async function () {
      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      if (request.isDone) {
        // Un-done: remove entry entirely (keep fav state if it was fav)
        var entry = entries.find(function (e) { return e.question_name === name; });
        if (entry && entry.is_favourite) {
          // Keep it but mark not done somehow — actually done = "in DB", so we just leave it
          // but user clicked done btn to un-done → remove from DB
        }
        entries = entries.filter(function (e) { return e.question_name !== name; });
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsDelete(settings, request.subject, name); } catch (e) { }
        }
      } else {
        var entry = request.entryData;
        entry.is_favourite = false;
        var ex = entries.find(function (e) { return e.question_name === name; });
        if (ex) {

          if (ex.is_favourite) entry.is_favourite = ex.is_favourite; // preserve fav state
          if (ex.todo_date) entry.todo_date = ex.todo_date; // preserve to-do state
        }
        entries = entries.filter(function (e) { return e.question_name !== name; });
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch (e) { }
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'toggleFavouriteFromPage') {
    (async function () {
      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      var ex = entries.find(function (e) { return e.question_name === name; });

      if (request.isFav) {
        // Remove favourite — if also done, keep in DB with is_favourite=false; else remove
        if (ex) {
          ex.is_favourite = false;
          await saveCache(entries);
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            try { await fsWrite(settings, ex); } catch (e) { }
          }
        }
      } else {
        // Add favourite — upsert entry with is_favourite=true
        var entry = request.entryData;
        entry.is_favourite = true;
        if (ex) {

          if (ex.todo_date) entry.todo_date = ex.todo_date; // preserve to-do state
          if (ex.logged_at) entry.logged_at = ex.logged_at; // preserve done state
          entries = entries.filter(function (e) { return e.question_name !== name; });
        }
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch (e) { }
        }
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'saveDuplicateGroup') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var group = request.group; // { id, questions: [], primary: "...", marked_by_user: bool }
      var allNames = group.questions || [];
      var primary = group.primary || allNames[0] || '';
      var markedByUser = (group.marked_by_user !== false); // default true

      allNames.forEach(function(name) {
        var isPrimary = (name === primary);
        var others = allNames.filter(function(n) { return n !== name; });
        var rq = { is_primary: isPrimary, linked_questions: others, marked_by_user: markedByUser };
        var ex = entries.find(function(e) { return e.question_name === name; });
        
        if (ex) {
          ex.repeated_question = rq;
          // RESET DATA FOR NON-PRIMARIES
          if (!isPrimary) {
            ex.logged_at = null;
            ex.is_favourite = false;
            ex.todo_date = null;
          }
        } else {
          var u = name.toUpperCase();
          var subj = u.includes('CHEMI') ? 'chemistry' : u.includes('PHYSI') || u.includes('PHYS') ? 'physics' : u.includes('MATH') ? 'mathematics' : u.includes('BIOL') || u.includes('BIO') ? 'biology' : 'other';
          entries.unshift({ 
            question_name: name, 
            subject: subj, 
            question_imgs: [], 
            answer_imgs: [], 
            old_topics: '', 
            is_favourite: false, 
            logged_at: null, 
            todo_date: null, 
            repeated_question: rq 
          });
        }
      });

      await saveCache(entries);

      var groups = await loadDuplicates();
      var idx = groups.findIndex(function(g) { return g.id === group.id; });
      if (idx !== -1) groups[idx] = group; else groups.push(group);
      await saveDuplicates(groups);

      if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
        try { await fsWriteDupGroup(settings, group); } catch(e) {}
        allNames.forEach(function(name) {
          var ex = entries.find(function(e) { return e.question_name === name; });
          if (ex) fsWrite(settings, ex).catch(function() {});
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'removeDuplicateGroup') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var groups = await loadDuplicates();
      var groupId = request.groupId;

      // Find the group
      var group = groups.find(function(g) { return g.id === groupId; });
      if (!group) { sendResponse({ ok: true }); return; }

      var affectedNames = group.questions || [];

      // Strip repeated_question from all affected entries
      affectedNames.forEach(function(name) {
        var ex = entries.find(function(e) { return e.question_name === name; });
        if (ex) {
          delete ex.repeated_question;
          // If the entry has no other state (not logged, not fav, no todo), remove it entirely
          if (!ex.logged_at && !ex.is_favourite && !ex.todo_date) {
            entries = entries.filter(function(e) { return e.question_name !== name; });
          }
        }
      });

      await saveCache(entries);

      // Remove group from DB
      groups = groups.filter(function(g) { return g.id !== groupId; });
      await saveDuplicates(groups);

      // Add to rejected groups list to prevent AI re-detection
      if (group.questions && group.questions.length > 0) {
        var rejected = await loadRejectedGroups();
        // Store as a sorted string for easy comparison
        var rejKey = group.questions.slice().sort().join('|');
        if (rejected.indexOf(rejKey) === -1) {
          rejected.push(rejKey);
          await saveRejectedGroups(rejected);
        }
      }

      if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
        // Delete dup group doc from Firestore if supported
        try { await fsDeleteDupGroup(settings, groupId); } catch(e) {}
        // Re-write affected entries to remove repeated_question
        affectedNames.forEach(function(name) {
          var ex = entries.find(function(e) { return e.question_name === name; });
          if (ex) fsWrite(settings, ex).catch(function() {});
        });
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

});

