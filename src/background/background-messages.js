// background-messages.js — Message listener for service worker

// ── Message listener: toggleDoneFromPage + toggleFavouriteFromPage ────────────

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
 
  if (request.action === 'syncAndGetState') {
    (async function() {
      try {
        // 1. Run the full autoSync logic and wait for it to finish.
        // This ensures the local cache is current BEFORE we try to mark the page.
        await autoSync(); 
        // 2. Extract the fresh state for the content script.
        var data = await getSyncDataForTab();
        sendResponse(data);
      } catch (err) {
        console.error('[IB Sync] syncAndGetState handler failed:', err);
        // Ensure the content script is NEVER left hanging
        sendResponse(null);
      }
    })();
    return true;
  }

  if (request.action === 'getTodoPages') {
    (async function() {
      var todos = await loadTodos();
      
      var stats = {}; 
      
      todos.forEach(function(e) {
        if (e.source_url) {
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
      var todos = await loadTodos();
      var doneNames = entries.filter(function(e) { return e.logged_at !== null; }).map(function(e) { return e.question_name; });
      var favNames = entries.filter(function(e) { return e.is_favourite; }).map(function(e) { return e.question_name; });
      var todoNames = todos.map(function(t) { return t.question_name; });
      
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
      var todos = await loadTodos();
      var groups = await loadDuplicates();
      var rejectedGroups = await loadRejectedGroups();
      sendResponse({ entries: entries, todos: todos, groups: groups, rejectedGroups: rejectedGroups });
    })();
    return true;
  }

  if (request.action === 'updateTodoQueue') {
    (async function() {
      // 1. Pull changes first to ensure we have the latest state
      await autoSync();

      var settings = await getSettings();
      var todos = await loadTodos();
      var today = new Date().toISOString().replace('T', ' ').substring(0, 19);
      var useFirebase = settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId;

      var addSet = new Set(request.add || []);
      var removeSet = new Set(request.remove || []);

      // STEP 1: Remove any unchecked todos from local cache and Firebase
      if (removeSet.size > 0) {
        todos = todos.filter(function(t) { 
          if (removeSet.has(t.question_name)) {
            if (useFirebase) fsDeleteTodo(settings, t.question_name).catch(function(){});
            // Record deletion in the pending changes log
            recordChange('todos', 'delete', t.question_name, null);
            return false;
          }
          return true;
        });
      }

      // STEP 2: Add todos for questions that ARE already in the main PYQS cache.
      // FIX: Previously these names were collected but never iterated to create todo objects.
      if (addSet.size > 0) {
        var entries = await loadCache();
        addSet.forEach(function(name) {
          if (todos.some(function(t) { return t.question_name === name; })) return; // already in queue
          var entry = entries.find(function(e) { return e.question_name === name; });
          var newTodo = {
            question_name: name,
            subject: (entry && entry.subject) ? entry.subject : 'other',
            source_url: (entry && entry.source_url) ? entry.source_url : '',
            page_num: (entry && entry.page_num) ? entry.page_num : 1,
            added_at: today,
            updated_at: Date.now()
          };
          todos.unshift(newTodo);
          if (useFirebase) fsWriteTodo(settings, newTodo).catch(function() {});
          recordChange('todos', 'add', name, newTodo);
        });
      }

      // STEP 3: Add todos for NEW questions not yet in cache (full entry data provided).
      // FIX: Previously gated by addSet.has() which was always empty when addWithData was used,
      // silently dropping every new question. Now fully independent of addSet.
      var unlogged = request.addWithData || [];
      unlogged.forEach(function(entryData) {
        if (todos.some(function(t) { return t.question_name === entryData.question_name; })) return; // already in queue
        var newTodo = {
          question_name: entryData.question_name,
          subject: entryData.subject || 'other',
          source_url: entryData.source_url || '',
          page_num: entryData.page_num || 1,
          added_at: today,
          updated_at: Date.now()
        };
        todos.unshift(newTodo);
        if (useFirebase) fsWriteTodo(settings, newTodo).catch(function() {});
        recordChange('todos', 'add', entryData.question_name, newTodo);
      });

      await saveTodos(todos);
      
      // V5 FIX: Explicitly bump sync time after bulk todo update
      await bumpGlobalSyncTime(settings).catch(function() {});
      
      // 2. Push changes immediately
      await autoSync();

      sendResponse({ ok: true, count: todos.length });
    })();
    return true;
  }

  if (request.action === 'toggleDoneFromPage') {
    (async function () {
      // 1. Pull changes first
      await autoSync();

      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      if (request.isDone) {
        // Un-done: remove entry from local cache and Firebase
        entries = entries.filter(function (e) { return e.question_name !== name; });
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsDelete(settings, request.subject, name); } catch (e) { }
          
        }
        // Record the deletion so sync knows this was intentional (not a remote delete)
        recordChange('entries', 'delete', name, { subject: request.subject || 'other' });
      } else {
        var entry = request.entryData;
        entry.is_favourite = false;
        entry.updated_at = Date.now();
        var ex = entries.find(function (e) { return e.question_name === name; });
        if (ex) {
          if (ex.is_favourite) entry.is_favourite = ex.is_favourite; // preserve fav state
        }
        delete entry.repeated_question; // V2 PURGE: Remove legacy field
        entries = entries.filter(function (e) { return e.question_name !== name; });
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch (e) { }
          
        }
        recordChange('entries', 'add', name, entry);
      }
      
      // 2. Push changes immediately
      await autoSync();
      
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'toggleFavouriteFromPage') {
    (async function () {
      // 1. Pull changes first
      await autoSync();

      var settings = await getSettings();
      var entries = await loadCache();
      var name = request.question_name;
      var ex = entries.find(function (e) { return e.question_name === name; });

      if (request.isFav) {
        // Un-favourite
        if (ex) {
          ex.is_favourite = false;
          ex.updated_at = Date.now();
          delete ex.repeated_question;
          await saveCache(entries);
          if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
            try { await fsWrite(settings, ex); } catch (e) { }
            
          }
          recordChange('entries', 'update', name, ex);
        }
      } else {
        // Mark as favourite
        var entry = request.entryData;
        entry.is_favourite = true;
        entry.updated_at = Date.now();
        if (ex) {
          if (ex.logged_at) entry.logged_at = ex.logged_at;
          entries = entries.filter(function (e) { return e.question_name !== name; });
        }
        delete entry.repeated_question;
        entries.unshift(entry);
        await saveCache(entries);
        if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
          try { await fsWrite(settings, entry); } catch (e) { }
        }
        recordChange('entries', 'update', name, entry);
      }

      // 2. Push changes immediately
      await autoSync();

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
        if (e.logged_at || e.is_favourite || inDupGroups.has(e.question_name)) {
          // If we are keeping it, ensure it has a timestamp for future syncs
          if (!e.updated_at) e.updated_at = Date.now();
          newEntries.push(e);
        } else {
         orphansFound = true;
         if (settings.mode === 'firebase' && settings.firebaseApiKey) {
           try { await fsDelete(settings, e.subject || 'other', e.question_name); } catch(err){}
         }
         // Record deletion for sync
         recordChange('entries', 'delete', e.question_name, { subject: e.subject || 'other' });
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
      // 1. Pull changes first
      await autoSync();

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
        newGroup.updated_at = Date.now(); // Stamp group creation
        groups.push(newGroup);
        finalGroup = newGroup;
      }
      finalGroup.updated_at = Date.now(); // Stamp every update

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
          }
          ex.updated_at = Date.now(); // CRITICAL: ensure delta pulls can see the change
          // Always record entry update for dup questions
          recordChange('entries', 'update', name, ex);
        } else {
          var u = name.toUpperCase();
          var subj = u.includes('CHEMI') ? 'chemistry' : u.includes('PHYSI') || u.includes('PHYS') ? 'physics' : u.includes('MATH') ? 'mathematics' : u.includes('BIOL') || u.includes('BIO') ? 'biology' : 'other';
          var newEntry = { 
            question_name: name, subject: subj, question_imgs: [], answer_imgs: [], old_topics: '', 
            is_favourite: false, logged_at: null, source_url: qUrl || '', updated_at: Date.now()
          };
          entries.unshift(newEntry);
          recordChange('entries', 'add', name, newEntry);
        }
      });

      if (settings.mode === 'firebase' && settings.firebaseApiKey && settings.firebaseProjectId) {
        try { 
          await fsWriteDupGroup(settings, finalGroup); 
          
        } catch(e) {}
      }
      // Record this dup group mutation for the next sync
      recordChange('dups', existingGroup && !isDirectUpdate ? 'update' : 'add', finalGroup.id, finalGroup);

      await cleanOrphansAndSync(entries, groups, settings);

      // 2. Push changes immediately
      await autoSync();

      sendResponse({ ok: true, merged: !!existingGroup });
    })();
    return true;
  }

  if (request.action === 'removeDuplicateGroup') {
    (async function() {
      // 1. Pull changes first
      await autoSync();

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
          group.updated_at = Date.now();
          if (settings.mode === 'firebase') { 
            try { 
              await fsWriteDupGroup(settings, group); 
              
            } catch(e) {} 
          }
          recordChange('dups', 'update', groupId, group);
        } else {
          groups.splice(gIdx, 1);
          if (settings.mode === 'firebase') { 
            try { 
              await fsDeleteDupGroup(settings, groupId); 
              
            } catch(e) {} 
          }
          recordChange('dups', 'delete', groupId, null);
        }
        
        // Strip repeated_question from all associated entries
        (group.questions || []).forEach(function(name) {
          var ex = entries.find(function(e) { return e.question_name === name; });
          if (ex) delete ex.repeated_question;
        });
      }

      // Trigger orphan cleaning + sync
      await cleanOrphansAndSync(entries, groups, settings);

      // 2. Push changes immediately
      await autoSync();

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'clearRejectionsForPage') {
    (async function() {
      // 1. Pull changes first
      await autoSync();

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
        
        // V5 FIX: Bump sync time so other devices see the rejections are gone
        var settings = await getSettings();
        await bumpGlobalSyncTime(settings).catch(function() {});
        
        // 2. Push changes immediately
        await autoSync();
      }
      sendResponse({ ok: true, cleared: originalLength - groups.length });
    })();
    return true;
  }

  if (request.action === 'clearAllDuplicates') {
    (async function() {
      // 1. Pull changes first
      await autoSync();

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
      // Record each deletion and clear any pending dup changes (they're all gone)
      var pendingAfterClear = (await getPendingChanges()).filter(function(c) { return c.collection !== 'dups'; });
      await chrome.storage.local.set({ [PENDING_CHANGES_KEY]: pendingAfterClear });
      await saveDuplicates([]);

      // Cleanse entries of any duplicate-related state
      await saveCache(entries);

      // V5 FIX: Explicitly bump sync time after bulk duplicates clear
      await bumpGlobalSyncTime(settings).catch(function() {});

      if (sender.tab && sender.tab.id) await markTab(sender.tab.id);
      
      // 2. Push changes immediately
      await autoSync();

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



  if (request.action === 'clearAllProgress') {
    (async function() {
      var settings = await getSettings();
      var entries = await loadCache();
      var todos = await loadTodos();
      var useFirebase = settings.mode === 'firebase' && settings.firebaseApiKey;

      // 1. Clear Local Cache
      await saveCache([]);
      await saveTodos([]);
      
      // 2. Clear Firebase (if applicable)
      if (useFirebase) {
        // We delete individual items to ensure consistency, but we ONLY bump at the end
        for (var i = 0; i < entries.length; i++) {
          try { await fsDelete(settings, entries[i].subject || 'other', entries[i].question_name, true); } catch(e){}
          // Record deletion for sync
          recordChange('entries', 'delete', entries[i].question_name, { subject: entries[i].subject || 'other' });
        }
        for (var j = 0; j < todos.length; j++) {
          try { await fsDeleteTodo(settings, todos[j].question_name, true); } catch(e){}
          recordChange('todos', 'delete', todos[j].question_name, null);
        }
        
        // Final Handshake: Notify all devices that EVERYTHING is gone
        await bumpGlobalSyncTime(settings).catch(function() {});
      }

      sendResponse({ ok: true });
    })();
    return true;
  }

  if (request.action === 'clearAllTodos') {
    (async function() {
      var settings = await getSettings();
      var todos = await loadTodos();
      var useFirebase = settings.mode === 'firebase' && settings.firebaseApiKey;

      await saveTodos([]);
      
      if (useFirebase) {
        for (var i = 0; i < todos.length; i++) {
          try { await fsDeleteTodo(settings, todos[i].question_name, true); } catch(e){}
          recordChange('todos', 'delete', todos[i].question_name, null);
        }
        await bumpGlobalSyncTime(settings).catch(function() {});
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

});

// ── Migration Helper ──────────────────────────────────────────────────────────



