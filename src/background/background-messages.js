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
      
      // Perform one-time migration if needed
      var migrationDone = await migrateDataArchitecture(entries, groups);
      if (migrationDone) {
        entries = await loadCache();
        groups = await loadDuplicates();
      }

      var today = new Date().toISOString().split('T')[0];
      var doneNames = entries.filter(function(e) { return e.logged_at !== null; }).map(function(e) { return e.question_name; });
      var favNames = entries.filter(function(e) { return e.is_favourite; }).map(function(e) { return e.question_name; });
      var todoNames = entries.filter(function(e) { return e.todo_date === today; }).map(function(e) { return e.question_name; });
      
      var dupInfo = {};
      var rejectedGroups = [];

      groups.forEach(function(g) {
        if (g.status === 'ai-rejected') {
          rejectedGroups.push(g);
          return;
        }

        var qList = g.questions || [];
        qList.forEach(function(name) {
          dupInfo[name] = {
            is_primary: name === g.primary,
            linked_questions: qList.filter(function(n) { return n !== name; }),
            primary_name: g.primary || qList[0] || '',
            status: g.status || 'user',
            urls: g.urls || {}
          };
        });
      });

      sendResponse({ 
        questionNames: doneNames, 
        favouriteNames: favNames, 
        todoNames: todoNames, 
        dupInfo: dupInfo, 
        rejectedGroups: rejectedGroups 
      });
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
        delete entry.repeated_question; // V2 PURGE: Remove legacy field
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
          delete ex.repeated_question; // V2 PURGE
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
        delete entry.repeated_question; // V2 PURGE
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
      var group = request.group; // { id, questions: [], primary: "...", status: "...", urls: {} }
      var allNames = group.questions || [];
      var primary = group.primary || allNames[0] || '';
      
      // Upgrade logic for V2 structure
      if (!group.urls) group.urls = {};
      if (request.nameUrls) {
        Object.keys(request.nameUrls).forEach(function(n) {
          if (request.nameUrls[n]) group.urls[n] = request.nameUrls[n];
        });
      }
      // Status tagging
      if (!group.status) {
        group.status = (group.marked_by_user === false) ? 'ai' : 'user';
      }

      allNames.forEach(function(name) {
        var isPrimary = (name === primary);
        var ex = entries.find(function(e) { return e.question_name === name; });
        var qUrl = group.urls[name];
        
        if (ex) {
          delete ex.repeated_question; // V2 PURGE: Ensure no legacy fields persist
          if (qUrl && (!ex.source_url || ex.source_url === 'undefined')) ex.source_url = qUrl;
          
          // Data Integrity: Only primary versions hold status data
          if (!isPrimary) {
            ex.logged_at = null;
            ex.is_favourite = false;
            ex.todo_date = null;
          }
        } else {
          // Create skeleton entry for untracked duplicates
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
            source_url: qUrl || ''
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
      }

      // V2: Trigger instantaneous sidebar refresh
      if (sender.tab && sender.tab.id) await markTab(sender.tab.id);

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
      var asRejected = request.reject === true;

      var gIdx = groups.findIndex(function(g) { return g.id === groupId; });
      if (gIdx !== -1) {
        var group = groups[gIdx];
        if (asRejected) {
          group.status = 'ai-rejected';
          if (settings.mode === 'firebase') { try { await fsWriteDupGroup(settings, group); } catch(e) {} }
        } else {
          groups.splice(gIdx, 1);
          if (settings.mode === 'firebase') { try { await fsDeleteDupGroup(settings, groupId); } catch(e) {} }
        }
        
        // Strip repeated_question from all associated entries
        (group.questions || []).forEach(function(name) {
          var ex = entries.find(function(e) { return e.question_name === name; });
          if (ex) delete ex.repeated_question;
        });
      }

      await saveCache(entries);
      await saveDuplicates(groups);

      // V2: Trigger instantaneous sidebar refresh
      if (sender.tab && sender.tab.id) await markTab(sender.tab.id);

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'clearRejectionsForPage') {
    (async function() {
      var questionNames = request.questionNames || [];
      var groups = await loadDuplicates();
      var originalLength = groups.length;
      
      // Filter out 'ai-rejected' groups that intersect with current page questions
      groups = groups.filter(function(g) {
        if (g.status !== 'ai-rejected') return true;
        var hasMatch = (g.questions || []).some(function(q) { return questionNames.includes(q); });
        return !hasMatch;
      });

      if (groups.length !== originalLength) {
        await saveDuplicates(groups);
        // Refresh UI so content script's 'rejectedGroups' list is cleared
        if (sender.tab && sender.tab.id) await markTab(sender.tab.id);
        console.log('[IB] Cleared ' + (originalLength - groups.length) + ' AI rejections for this page.');
      }
      sendResponse({ ok: true, cleared: originalLength - groups.length });
    })();
    return true;
  }

  if (request.action === 'runFullV2Migration') {
    (async function() {
      var entries = await loadCache();
      var groups = await loadDuplicates();
      await migrateDataArchitecture(entries, groups, true); // true = deep sweep
      sendResponse({ ok: true });
    })();
    return true;
  }

});

// ── Migration Helper ──────────────────────────────────────────────────────────

async function migrateDataArchitecture(entries, groups, deepSweep) {
  var changed = false;
  
  // 1. Scan entries for legacy repeated_question and ensure a group exists
  entries.forEach(function(e) {
    if (e.repeated_question) {
      var allMembers = (e.repeated_question.linked_questions || []).slice();
      if (!allMembers.includes(e.question_name)) allMembers.push(e.question_name);
      allMembers.sort();
      
      var gid = 'dup_' + allMembers.join('|');
      var existingGroup = groups.find(function(g) { return g.id === gid || (g.questions && g.questions.includes(e.question_name)); });
      
      if (!existingGroup) {
        existingGroup = {
          id: gid,
          questions: allMembers,
          primary: e.repeated_question.is_primary ? e.question_name : (allMembers[0] || e.question_name),
          status: e.repeated_question.marked_by_user ? 'user' : 'ai',
          urls: {}
        };
        groups.push(existingGroup);
        changed = true;
      }
      
      if (e.source_url && !existingGroup.urls[e.question_name]) {
        existingGroup.urls[e.question_name] = e.source_url;
        changed = true;
      }
      
      delete e.repeated_question;
      changed = true;
    }
  });

  // 2. Normalize and Discover URLs
  groups.forEach(function(g) {
    var updated = false;
    if (!g.status) {
      g.status = 'user';
      updated = true;
    }
    if (!g.urls) {
      g.urls = {};
      updated = true;
    }
    
    (g.questions || []).forEach(function(qName) {
      // a. Try to capture from entries
      if (!g.urls[qName]) {
        var ex = entries.find(function(e) { return e.question_name === qName; });
        if (ex && ex.source_url && ex.source_url !== 'undefined') { 
          g.urls[qName] = ex.source_url; updated = true; 
        }
      }
      
      // b. Deep Sweep: Generate smart fallback if still missing
      if (deepSweep && !g.urls[qName]) {
        var u = qName.toUpperCase();
        var sId = '';
        if (u.includes('CHEMI')) sId = '7';
        else if (u.includes('PHYSI') || u.includes('PHYS')) sId = '92';
        else if (u.includes('MATH')) sId = '102';
        else if (u.includes('BIOL') || u.includes('BIO')) sId = '93';
        
        if (sId) {
          g.urls[qName] = 'https://www.exam-mate.com/topicalpastpapers?subject=' + sId + '&search=' + encodeURIComponent(qName);
          updated = true;
        }
      }
    });
    if (updated) changed = true;
  });

  if (changed || deepSweep) {
    await saveCache(entries);
    await saveDuplicates(groups);
    
    // Sync Groups & Clean Remote Entries to Firebase if needed
    var settings = await getSettings();
    if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
      // a. Save normalized groups
      for (var i = 0; i < groups.length; i++) {
        try { await fsWriteDupGroup(settings, groups[i]); } catch(e) {}
      }

      // b. Deep Sweep: Rewrite ALL entries to ensure remote side is also clean
      // (This removes the legacy 'repeated_question' field from Firestore docs)
      if (deepSweep) {
        for (var i = 0; i < entries.length; i++) {
          try { 
            await fsWrite(settings, entries[i]); 
            // Small throttle to avoid hitting Firestore limits too fast
            if (i % 10 === 0) await new Promise(r => setTimeout(r, 50));
          } catch(e) {}
        }
      }
    }

    console.log('[IB Migration] Duplicate data architecture normalized' + (deepSweep ? ' (Deep Sweep & Remote Cleanup)' : '') + '.');
    return true;
  }
  return false;
}

