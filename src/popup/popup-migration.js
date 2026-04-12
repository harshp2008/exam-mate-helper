// popup-migration.js — Legacy Data Migration Tool

window.IB = window.IB || {};

/**
 * Transcribes old version (subject-keyed) JSON data into the current normalized V2 architecture.
 * @param {Object} jsonData - The raw JSON object from the file.
 * @returns {Promise<Object>} Statistics of the migration.
 */
window.IB.importOldVersionData = async function(jsonData) {
  console.log('[IB Migration] Starting transcription of old version data...');
  
  var entries = await window.IB.loadCache();
  var todos = await window.IB.loadTodos();
  var dups = await window.IB.loadDuplicates();
  
  var addedEntries = 0;
  var addedTodos = 0;
  var addedDups = 0;

  // 1. Determine if this is a V2 export or an Old Version export
  // Old version: Keyed by subject (mathematics, physics, etc.)
  // V2 version: Keyed as { subjects: {...}, todos: [...], duplicates: [...] }
  
  var subjectsRoot = jsonData.subjects || jsonData;
  
  // Handle V2 style 'todos' and 'duplicates' if present in the file
  if (Array.isArray(jsonData.todos)) {
    jsonData.todos.forEach(function(t) {
      if (!todos.some(function(et) { return et.question_name === t.question_name; })) {
        todos.push(t);
        addedTodos++;
      }
    });
  }
  
  if (Array.isArray(jsonData.duplicates)) {
    jsonData.duplicates.forEach(function(g) {
      if (!dups.some(function(eg) { return eg.id === g.id; })) {
        dups.push(g);
        addedDups++;
      }
    });
  }

  // 2. Iterate subjects for Question Entries
  Object.keys(subjectsRoot).forEach(function(subjKey) {
    // Skip V2 metadata keys
    if (subjKey === 'duplicates' || subjKey === 'todos' || subjKey === 'subjects' || subjKey === 'meta') return;

    var subjObj = subjectsRoot[subjKey];
    var pyqs = subjObj.PYQS || [];
    
    pyqs.forEach(function(q) {
      if (!q.question_name) return;
      
      // Normalize subject
      var subj = q.subject || subjKey;

      // --- A. Process as Logged (Done) Entry ---
      // In V2, we only keep it in question_cache if it's actually logged_at (done)
      if (q.logged_at) {
        var existingIdx = entries.findIndex(function(e) { return e.question_name === q.question_name; });
        if (existingIdx !== -1) {
          // Merge: use the more complete metadata
          if (!entries[existingIdx].logged_at) entries[existingIdx].logged_at = q.logged_at;
          if (q.is_favourite) entries[existingIdx].is_favourite = true;
          // Merge images if ours are missing
          if ((!entries[existingIdx].question_imgs || entries[existingIdx].question_imgs.length === 0) && q.question_imgs) {
            entries[existingIdx].question_imgs = q.question_imgs;
          }
        } else {
          entries.push({
            question_name: q.question_name,
            subject: subj,
            question_imgs: q.question_imgs || [],
            answer_imgs: q.answer_imgs || [],
            mcq_answer: q.mcq_answer || null,
            old_topics: q.old_topics || '',
            source_url: q.source_url || '',
            page_num: q.page_num || 1,
            logged_at: q.logged_at,
            is_favourite: !!q.is_favourite,
            updated_at: Date.now()
          });
          addedEntries++;
        }
      }

      // --- B. Process as Todo Entry ---
      if (q.todo_date) {
        if (!todos.some(function(t) { return t.question_name === q.question_name; })) {
          todos.push({
            question_name: q.question_name,
            subject: subj,
            source_url: q.source_url || '',
            page_num: q.page_num || 1,
            todo_date: q.todo_date,
            updated_at: Date.now()
          });
          addedTodos++;
        }
      }
    });
  });

  // 3. Persist and Sync
  await window.IB.saveCache(entries);
  await window.IB.saveTodos(todos);
  await window.IB.saveDuplicates(dups);

  // Update popup global state
  window.IB.allEntries = entries;
  window.IB.allTodos = todos;
  window.IB.duplicatesDB = dups;

  console.log('[IB Migration] Transcription complete. Merged ' + addedEntries + ' entries and ' + addedTodos + ' todos.');
  
  return { addedEntries, addedTodos, addedDups };
};
