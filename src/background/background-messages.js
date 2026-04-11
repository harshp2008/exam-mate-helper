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
      //... logic remains
      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      var ex = entries.find(function (e) { return e.question_name === name; });

      if (request.isFav) {
        if (ex) {
          ex.is_favourite = false;
          delete ex.repeated_question;
          await saveCache(entries);
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            try { await fsWrite(settings, ex); } catch (e) { }
          }
        }
      } else {
        var entry = request.entryData;
        entry.is_favourite = true;
        if (ex) {
          if (ex.todo_date) entry.todo_date = ex.todo_date;
          if (ex.logged_at) entry.logged_at = ex.logged_at;
          entries = entries.filter(function (e) { return e.question_name !== name; });
        }
        delete entry.repeated_question;
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

  // Helper function to remove orphaned questions (0Q 0A, not done, not fav, not to-do, not in any dup group)
  async function cleanOrphansAndSync(entries, groups, settings) {
    var inDupGroups = new Set();
    groups.forEach(function(g) {
      if (g.status !== 'ai-rejected') {
        (g.questions || []).forEach(function(q) { inDupGroups.add(q); });
      }
    });

    var newEntries = [];
    var orphansFound = false;
    
    for (var i = 0; i < entries.length; i++) {
       var e = entries[i];
       if (e.logged_at || e.is_favourite || e.todo_date || inDupGroups.has(e.question_name)) {
         newEntries.push(e);
       } else {
         orphansFound = true;
         if (settings.mode === 'firebase' && settings.firebaseApiKey) {
           try { await fsDelete(settings, e.subject || 'other', e.question_name); } catch(err){}
         }
       }
    }
    
    if (orphansFound) {
       await saveCache(newEntries);
    } else {
       await saveCache(entries); // preserve any changes made to entries prior to calling this
    }
    await saveDuplicates(groups);
    if (typeof markAllExamMateTabs !== 'undefined') await markAllExamMateTabs();
  }

  if (request.action === 'saveDuplicateGroup') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var groups = await loadDuplicates();
      var newGroup = request.group;
      var newNames = newGroup.questions || [];
      
      // 1. Validation: Prevent 'Bloated' groups with conflicting QNums (e.g. Q1 and Q2 from same paper)
      function parseSimpleIB(n) {
        // Robust regex for IB question names: [Subj]_[Paper][TZ]_[Season]_[Year]_Q[Num]
        // Example: BIOL_32_MARCH_2020_Q4
        var m = (n || '').match(/^([A-Z]+)[\/ \-_]?(\d)?(\d)[_ ]?([A-Z0-9]*)[_ ]?([A-Za-z]+)[_ ]?(\d{4})[_ ]?Q?(\d+)$/i);
        if (m) return { s:m[1].toUpperCase(), p:m[2]||'', tz:m[3], sea:m[5].toLowerCase(), yr:m[6], q:m[7] };
        return null;
      }
      function checkConflict(list) {
        for (var i = 0; i < list.length; i++) {
          for (var j = i + 1; j < list.length; j++) {
            var p1 = parseSimpleIB(list[i]), p2 = parseSimpleIB(list[j]);
            if (p1 && p2 && p1.s === p2.s && p1.p === p2.p && p1.yr === p2.yr && p1.sea === p2.sea && p1.tz === p2.tz) {
              if (p1.q !== p2.q) return true; // Conflict: Same paper, different QNum
            }
          }
        }
        return false;
      }

      // 2. Find group by ID first for direct updates
      var existingGroup = groups.find(function(g) { return g.id === newGroup.id; });
      var isDirectUpdate = !!existingGroup;

      if (!existingGroup) {
        // Check for overlap to perform MERGING if no exact ID match
        for (var i = 0; i < groups.length; i++) {
          var g = groups[i];
          if (g.status === 'ai-rejected') continue;
          var hasOverlap = (g.questions || []).some(function(q) { return newNames.includes(q); });
          if (hasOverlap) {
            existingGroup = g;
            break;
          }
        }
      }

      var finalGroup;
      if (existingGroup) {
        var mergedList;
        if (isDirectUpdate) {
          // User explicitly updating a group (can add or remove items)
          mergedList = newNames.slice();
        } else {
          // MERGE: Add new names to existing group, but CHECK FOR CONFLICT FIRST
          // Block AI from merging into a USER protected group (prevents AI re-adding removed questions)
          if (existingGroup.status === 'user' && newGroup.status === 'ai') {
             console.log('[IB Cache] AI overlap merge blocked to protect USER manual edits.');
             sendResponse({ ok: false, error: 'user_protected' });
             return;
          }
          var mergedSet = new Set(existingGroup.questions || []);
          newNames.forEach(function(n) { mergedSet.add(n); });
          mergedList = Array.from(mergedSet);
        }
        
        if (checkConflict(mergedList)) {
          console.log('[IB Cache] Merge/Update rejected due to paper conflict:', mergedList);
          sendResponse({ ok: false, error: 'conflict' });
          return;
        }
        existingGroup.questions = mergedList;
        existingGroup.primary = newGroup.primary || existingGroup.primary;
        if (newGroup.status) existingGroup.status = newGroup.status;
        
        // Merge URLs
        if (!existingGroup.urls) existingGroup.urls = {};
        if (newGroup.urls) {
          Object.keys(newGroup.urls).forEach(function(n) {
            if (newGroup.urls[n]) existingGroup.urls[n] = newGroup.urls[n];
          });
        }
        if (request.nameUrls) {
          Object.keys(request.nameUrls).forEach(function(n) {
            if (request.nameUrls[n]) existingGroup.urls[n] = request.nameUrls[n];
          });
        }
        finalGroup = existingGroup;
      } else {
        // CREATE: Use the new group as is
        if (!newGroup.urls) newGroup.urls = {};
        if (request.nameUrls) {
          Object.keys(request.nameUrls).forEach(function(n) {
            if (request.nameUrls[n]) newGroup.urls[n] = request.nameUrls[n];
          });
        }
        if (!newGroup.status) newGroup.status = 'ai';
        groups.push(newGroup);
        finalGroup = newGroup;
      }

      // Sync entries data
      var primary = finalGroup.primary || finalGroup.questions[0] || '';
      finalGroup.questions.forEach(function(name) {
        var isPrimary = (name === primary);
        var ex = entries.find(function(e) { return e.question_name === name; });
        var qUrl = finalGroup.urls[name];
        
        if (ex) {
          delete ex.repeated_question;
          if (qUrl && (!ex.source_url || ex.source_url === 'undefined')) ex.source_url = qUrl;
          if (!isPrimary) {
            ex.logged_at = null;
            ex.is_favourite = false;
            ex.todo_date = null;
          }
        } else {
          var u = name.toUpperCase();
          var subj = u.includes('CHEMI') ? 'chemistry' : u.includes('PHYSI') || u.includes('PHYS') ? 'physics' : u.includes('MATH') ? 'mathematics' : u.includes('BIOL') || u.includes('BIO') ? 'biology' : 'other';
          entries.unshift({ 
            question_name: name, subject: subj, question_imgs: [], answer_imgs: [], old_topics: '', 
            is_favourite: false, logged_at: null, todo_date: null, source_url: qUrl || ''
          });
        }
      });

      if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
        try { await fsWriteDupGroup(settings, finalGroup); } catch(e) {}
      }

      await cleanOrphansAndSync(entries, groups, settings);
      sendResponse({ ok: true, merged: !!existingGroup });
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

      // Trigger orphan cleaning + sync
      await cleanOrphansAndSync(entries, groups, settings);

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

  if (request.action === 'clearAllDuplicates') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var groups = await loadDuplicates();
      
      // Clear AI rejections too
      await saveRejectedGroups([]);
      
      // Wipe all groups
      if (settings.mode === 'firebase') {
        for (var i = 0; i < groups.length; i++) {
          try { await fsDeleteDupGroup(settings, groups[i].id); } catch(e) {}
        }
      }
      await saveDuplicates([]);

      // Cleanse entries of any duplicate-related state (isPrimary doesn't matter if no groups, but we can't 'restore' old data easily)
      await saveCache(entries);

      if (sender.tab && sender.tab.id) await markTab(sender.tab.id);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'cleanViolatingDups') {
    (async function() {
      var settings = await getSettings();
      var groups = await loadDuplicates();
      var entries = await loadCache();
      
      var initialLength = groups.length;
      var remainingGroups = [];
      
      function parseSimpleIB(n) {
        var m = (n || '').match(/^([A-Z]+)[\/ \-_]?(\d)?(\d)[_ ]?([A-Z0-9]*)[_ ]?([A-Za-z]+)[_ ]?(\d{4})[_ ]?Q?(\d+)$/i);
        if (m) return { s:m[1].toUpperCase(), p:m[2]||'', tz:m[3], sea:m[5].toLowerCase(), yr:m[6], q:m[7] };
        return null;
      }
      
      for (var i = 0; i < groups.length; i++) {
        var g = groups[i];
        if (g.status === 'ai-rejected') {
          remainingGroups.push(g);
          continue;
        }
        
        var isViolating = false;
        var qs = g.questions || [];
        if (qs.length > 1) {
          for (var j = 0; j < qs.length; j++) {
             for (var k = j+1; k < qs.length; k++) {
               var p1 = parseSimpleIB(qs[j]), p2 = parseSimpleIB(qs[k]);
               if (p1 && p2) {
                 if (p1.s !== p2.s || p1.p !== p2.p || p1.sea !== p2.sea || p1.yr !== p2.yr) {
                   isViolating = true;
                   break;
                 }
               }
             }
             if (isViolating) break;
          }
        }
        
        if (isViolating) {
          if (settings.mode === 'firebase') {
             try { await fsDeleteDupGroup(settings, g.id); } catch(e) {}
          }
          // Strip repeated_question from associated entries just in case
          qs.forEach(function(name) {
            var ex = entries.find(function(e) { return e.question_name === name; });
            if (ex) delete ex.repeated_question;
          });
        } else {
          remainingGroups.push(g);
        }
      }
      
      if (remainingGroups.length < initialLength) {
         await cleanOrphansAndSync(entries, remainingGroups, settings);
      }
      
      sendResponse({ ok: true, removedCount: initialLength - remainingGroups.length });
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

