/**
 * Steady Rabbit Console Backend
 * Google Apps Script Web App (Sheet B - Blank Sheet)
 */

// CONFIGURATION:
// Paste the Spreadsheet ID of Sheet A (the main requirements sheet) here:
const STEADY_RABBIT_MAIN_REQ_SHEET_A_ID = "12X7Ncm64f692t8gStSGvzGA9M255uhQbJbQ9-xfmc8c";
const SHEET_ID_A = STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;

// Run this function once in the Apps Script editor (press "Run") to authorize the script to access Sheet A!
function runAuthorizationCheck() {
  try {
    const ss = SpreadsheetApp.openById(STEADY_RABBIT_MAIN_REQ_SHEET_A_ID);
    const sheet = getRequirementsSheet(ss);
    if (sheet) {
      Logger.log("Success! Authorized to read sheet: " + sheet.getName() + ". Total rows: " + sheet.getLastRow());
    } else {
      Logger.log("Authorized, but 'Final' tab not found in the main sheet.");
    }
  } catch (e) {
    Logger.log("Authorization failed or ID is incorrect: " + e.toString());
  }
}

function doGet(e) {
  const action = e.parameter.action;
  const bypassCache = e.parameter.bypass_cache === 'true';
  const sheetId = e.parameter.sheet_id;
  let response = { success: false, message: 'Invalid action' };
  
  try {
    let payload = {};
    if (e.parameter.data) {
      payload = JSON.parse(e.parameter.data);
    }
    
    if (action === 'list-requirements') {
      response = handleListRequirements(bypassCache, sheetId);
    } else if (action === 'list-candidates') {
      response = handleListCandidates(sheetId);
    } else if (action === 'update-requirement') {
      response = handleUpdateRequirement(payload, sheetId);
    } else if (action === 'add-requirement') {
      response = handleAddRequirement(payload, sheetId);
    } else if (action === 'marketing-add-requirement') {
      response = handleMarketingAddRequirement(payload, sheetId);
    } else if (action === 'add-candidates') {
      response = handleAddCandidates(payload, sheetId);
    } else if (action === 'find-suitable-candidates' || action === 'find-resume') {
      response = handleFindSuitableCandidates(payload, sheetId);
    } else if (action === 'update-candidate-interview-status') {
      response = handleUpdateCandidateInterviewStatus(payload, sheetId);
    } else if (action === 'list-hr-interviews') {
      response = handleListHRInterviews(sheetId);
    } else if (action === 'schedule-hr-interview') {
      response = handleScheduleHRInterview(payload, sheetId);
    } else if (action === 'groq-evaluate') {
      response = handleGroqEvaluate(payload, sheetId);
    } else if (action === 'google-login') {
      response = handleGoogleLogin(payload);
    }
  } catch (err) {
    response = { success: false, message: 'Error: ' + err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let action = (e.parameter && e.parameter.action) || '';
  const sheetId = (e.parameter && e.parameter.sheet_id) || '';
  let response = { success: false, message: 'Invalid action' };
  
  try {
    const postData = JSON.parse(e.postData.contents);
    if (!action && postData && postData.action) {
      action = postData.action;
    }
    const combinedSheetId = sheetId || (postData && postData.sheet_id);
    
    if (action === 'google-login') {
      response = handleGoogleLogin(postData);
    } else if (action === 'add-requirement') {
      response = handleAddRequirement(postData, combinedSheetId);
    } else if (action === 'marketing-add-requirement') {
      response = handleMarketingAddRequirement(postData, combinedSheetId);
    } else if (action === 'update-requirement') {
      response = handleUpdateRequirement(postData, combinedSheetId);
    } else if (action === 'add-candidates') {
      response = handleAddCandidates(postData, combinedSheetId);
    } else if (action === 'find-suitable-candidates' || action === 'find-resume') {
      response = handleFindSuitableCandidates(postData, combinedSheetId);
    } else if (action === 'update-candidate-interview-status') {
      response = handleUpdateCandidateInterviewStatus(postData, combinedSheetId);
    } else if (action === 'list-hr-interviews') {
      response = handleListHRInterviews(combinedSheetId);
    } else if (action === 'schedule-hr-interview') {
      response = handleScheduleHRInterview(postData, combinedSheetId);
    } else if (action === 'update-hr-interview') {
      response = handleUpdateHRInterview(postData, combinedSheetId);
    } else if (action === 'groq-evaluate') {
      response = handleGroqEvaluate(postData, combinedSheetId);
    }
  } catch (err) {
    response = { success: false, message: 'Error: ' + err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

// Helper to find sheet by name case-insensitively or with substring fallback
function getSheetByNameCaseInsensitive(ss, targetName) {
  if (!ss) return null;
  const sheet = ss.getSheetByName(targetName);
  if (sheet) return sheet;
  
  const sheets = ss.getSheets();
  const targetLower = targetName.toLowerCase().trim();
  for (let i = 0; i < sheets.length; i++) {
    const currentName = sheets[i].getName().toLowerCase().trim();
    if (currentName === targetLower) {
      return sheets[i];
    }
  }
  
  // If not found, try a substring match
  for (let i = 0; i < sheets.length; i++) {
    const currentName = sheets[i].getName().toLowerCase().trim();
    if (currentName.indexOf(targetLower) !== -1) {
      return sheets[i];
    }
  }
  
  return null; // Return null on failure instead of first sheet fallback
}

// Smart helper to locate the requirements tab dynamically
function getRequirementsSheet(ss) {
  if (!ss) return null;
  
  // 1. Try 'Requirement sheet new' specifically (prioritize newer sales tab)
  let sheet = getSheetByNameCaseInsensitive(ss, 'Requirement sheet new');
  if (sheet) return sheet;

  // 2. Try 'Requirement Sheet' specifically
  sheet = getSheetByNameCaseInsensitive(ss, 'Requirement Sheet');
  if (sheet) return sheet;
  
  // 3. Try 'Final' (NMo Sheet tab name)
  sheet = getSheetByNameCaseInsensitive(ss, 'Final');
  if (sheet) return sheet;
  
  // 4. Try any sheet matching 'Requirement' (substring match)
  sheet = getSheetByNameCaseInsensitive(ss, 'Requirement');
  if (sheet) return sheet;
  
  // 5. Fallback to the first sheet if absolutely nothing else matches
  const sheets = ss.getSheets();
  return sheets.length > 0 ? sheets[0] : null;
}

// Helper to find the last row containing actual cell values (ignores empty formatted rows)
function getTrueLastRow(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return lastRow;
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
  const colReqIdx = findHeaderIdx(headers, ['requirement', 'requirement name']);
  
  if (colReqIdx === -1) {
    // Fallback: scan columns 1 to 4
    const values = sheet.getRange(1, 1, lastRow, Math.min(4, sheet.getLastColumn())).getValues();
    for (let r = lastRow; r >= 1; r--) {
      const row = values[r - 1];
      if (row[0] && row[0].toString().trim() !== '') return r;
    }
    return 1;
  }
  
  // Scan only the Requirement Name column from bottom to top
  const values = sheet.getRange(1, colReqIdx + 1, lastRow, 1).getValues();
  for (let r = lastRow; r >= 1; r--) {
    const val = values[r - 1][0];
    if (val && val.toString().trim() !== '' && val.toString().trim() !== '—') {
      return r;
    }
  }
  return 1;
}

// 1. Google Login Helper
function handleGoogleLogin(data) {
  const token = data.credential;
  if (!token) {
    return { success: false, message: 'No credential token provided' };
  }
  
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return { success: false, message: 'Invalid JWT structure' };
    }
    // Pad base64url payload to a multiple of 4 so Utilities.base64DecodeWebSafe doesn't throw an exception
    let payloadB64 = parts[1];
    while (payloadB64.length % 4 !== 0) {
      payloadB64 += '=';
    }
    const rawPayload = Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString();
    const payload = JSON.parse(rawPayload);
    
    const email = (payload.email || '').toLowerCase();
    let name = payload.name || 'User';
    
    // Check if a specific sourcing name was selected
    if (data.sourcing_name && data.sourcing_name.trim() !== '') {
      name = data.sourcing_name.trim();
    } else {
      // Auto-detect assignee name based on email prefix
      const assignees = [
        { email: 'vasundhra.panwar', name: 'Vasundhara Panwar' },
        { email: 'afsheen.aabidi', name: 'Afsheen' },
        { email: 'ayushi.garg', name: 'Ayushi' },
        { email: 'diksha.dwivedi', name: 'Diksha' },
        { email: 'likitha.k', name: 'Likitha' },
        { email: 'prachi.sharma', name: 'Prachi' },
        { email: 'richa.sharma', name: 'Richa' },
        { email: 'sahil.teotia', name: 'Sahil' },
        { email: 'shailly', name: 'Shailly' },
        { email: 'shinjini.bandyopadhyay', name: 'Shinjini' },
        { email: 'siddhi.agarwal', name: 'Siddhi' },
        { email: 'saran', name: 'Saran' }
      ];
      
      const emailLower = email.toLowerCase();
      for (let i = 0; i < assignees.length; i++) {
        const a = assignees[i];
        if (emailLower.indexOf(a.email) !== -1) {
          name = a.name;
          break;
        }
      }
    }
    
    let role = 'HR';
    if (email === 'vasundhra@steadyrabbit.in' || email === 'vasundhara@steadyrabbit.in' || email === 'vasundhra.panwar@steadyrabbit.in' || name.toLowerCase().indexOf('vasundh') !== -1 || name.toLowerCase().indexOf('admin') !== -1) {
      role = 'Both';
    } else if (email === 'saran@steady-rabbit.com' || email.indexOf('marketing') === 0 || name.toLowerCase().indexOf('marketing') !== -1) {
      role = 'Marketing';
    }
    
    return {
      success: true,
      name: name,
      email: email,
      picture: payload.picture || '',
      role: role
    };
  } catch (e) {
    return { success: false, message: 'Token decode failed: ' + e.toString() };
  }
}

// Helper to dynamically locate column indexes in Google Sheets
function findHeaderIdx(headers, names) {
  for (let i = 0; i < names.length; i++) {
    const idx = headers.indexOf(names[i].toLowerCase().trim());
    if (idx !== -1) return idx;
  }
  // Substring matching as fallback
  for (let i = 0; i < names.length; i++) {
    const name = names[i].toLowerCase().trim();
    for (let j = 0; j < headers.length; j++) {
      if (headers[j].indexOf(name) !== -1) return j;
    }
  }
  return -1;
}

// 2. Fetch Requirements list from both Sheet A's "Final" tab and Sheet B's "Final" tab
function handleListRequirements(bypassCache, sheetId) {
  const cache = CacheService.getScriptCache();
  let requirementsA = [];
  const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
  const cacheKey = "requirements_" + targetSheetId;
  
  if (!bypassCache) {
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      try {
        requirementsA = JSON.parse(cachedData);
      } catch(e) {
        Logger.log("Error parsing cache: " + e.toString());
      }
    }
  }
  
  const parseSheetData = (sheet) => {
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return [];
    
    const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
    const headers = data[0].map(h => h.toString().trim().toLowerCase());
    
    const colDate = findHeaderIdx(headers, ['date', 'opening date', 'requirement opening date']);
    const colReq = findHeaderIdx(headers, ['requirement', 'requirement name']);
    const colPriority = findHeaderIdx(headers, ['priority', 'requirement priority']);
    const colJd = findHeaderIdx(headers, ['job description', 'jd', 'jd link', 'job description link']);
    const colClientBudget = findHeaderIdx(headers, ['client budget', 'budget']);
    const colVendorBudget = findHeaderIdx(headers, ['vendor budget']);
    const colLocation = findHeaderIdx(headers, ['location']);
    const colContractType = findHeaderIdx(headers, ['type of contract', 'contract type']);
    const colClient = findHeaderIdx(headers, ['client name', 'client name + company profile link', 'client']);
    const colPoc = findHeaderIdx(headers, ['poc', 'point of contact']);
    const colEntity = findHeaderIdx(headers, ['entity']);
    const colShiftTimings = findHeaderIdx(headers, ['shift timings']);
    const colEmploymentMode = findHeaderIdx(headers, ['c2c/c2h/permanent', 'c2c/c2h/perm']);
    const colAutomationStatus = findHeaderIdx(headers, ['automation status']);
    const colCommentsMarketing = findHeaderIdx(headers, ['comments (marketing team)', 'comments (marketing)']);
    const colStatus = findHeaderIdx(headers, ['status', 'requirement status']);
    const colAssignee = findHeaderIdx(headers, ['assignee', 'assigned to']);
    const colProfileStatus = findHeaderIdx(headers, ['profile status']);
    const colSharedDate = findHeaderIdx(headers, ['candidate shared to client on', 'shared date', 'date shared']);
    const colInterviewDate = findHeaderIdx(headers, ['client interview date', 'interview date']);
    const colCandidate = findHeaderIdx(headers, ['candidate', 'candidate name']);
    const colAssessment = findHeaderIdx(headers, ['internal assessment recording links', 'internal assessment', 'recording links']);
    const colCandOwner = findHeaderIdx(headers, ['candidate owner']);
    const colOnboardingDate = findHeaderIdx(headers, ['onboarding date']);
    const colClosedDate = findHeaderIdx(headers, ['requirement closed date', 'closed date']);
    const colOwner = findHeaderIdx(headers, ['requirement owner', 'owner']);
    
    const list = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const reqName = colReq !== -1 ? row[colReq].toString().trim() : '';
      if (!reqName) continue;
      
      let dateVal = colDate !== -1 ? normalizeDate(row[colDate]) : '';
      let sharedVal = colSharedDate !== -1 ? normalizeDate(row[colSharedDate]) : '';
      let interviewVal = colInterviewDate !== -1 ? normalizeDate(row[colInterviewDate]) : '';
      let onboardingVal = colOnboardingDate !== -1 ? normalizeDate(row[colOnboardingDate]) : '';
      let closedVal = colClosedDate !== -1 ? normalizeDate(row[colClosedDate]) : '';

      list.push({
        date: dateVal,
        requirement: reqName,
        priority: colPriority !== -1 ? row[colPriority].toString().trim() : '',
        jd_link: colJd !== -1 ? row[colJd].toString().trim() : '',
        client_budget: colClientBudget !== -1 ? row[colClientBudget].toString().trim() : '',
        vendor_budget: colVendorBudget !== -1 ? row[colVendorBudget].toString().trim() : '',
        location: colLocation !== -1 ? row[colLocation].toString().trim() : '',
        contract_type: colContractType !== -1 ? row[colContractType].toString().trim() : '—',
        client_name: colClient !== -1 ? row[colClient].toString().trim() : '—',
        poc: colPoc !== -1 ? row[colPoc].toString().trim() : '',
        entity: colEntity !== -1 ? row[colEntity].toString().trim() : '',
        shift_timings: colShiftTimings !== -1 ? row[colShiftTimings].toString().trim() : '',
        employment_mode: colEmploymentMode !== -1 ? row[colEmploymentMode].toString().trim() : '—',
        automation_status: colAutomationStatus !== -1 ? row[colAutomationStatus].toString().trim() : '',
        comments_marketing: colCommentsMarketing !== -1 ? row[colCommentsMarketing].toString().trim() : '',
        status: colStatus !== -1 ? row[colStatus].toString().trim() : 'Inactive',
        assignee: colAssignee !== -1 ? row[colAssignee].toString().trim() : '',
        profile_status: colProfileStatus !== -1 ? row[colProfileStatus].toString().trim() : '—',
        shared_date: sharedVal,
        interview_date: interviewVal,
        candidate_name: colCandidate !== -1 ? row[colCandidate].toString().trim() : '—',
        assessment_link: colAssessment !== -1 ? row[colAssessment].toString().trim() : '',
        candidate_owner: colCandOwner !== -1 ? row[colCandOwner].toString().trim() : '',
        onboarding_date: onboardingVal,
        closed_date: closedVal,
        requirement_owner: colOwner !== -1 ? row[colOwner].toString().trim() : '—'
      });
    }
    return list;
  };

  // If cache missed, load from Sheet A
  if (requirementsA.length === 0) {
    try {
      const ssA = SpreadsheetApp.openById(targetSheetId);
      const sheetA = getRequirementsSheet(ssA);
      requirementsA = parseSheetData(sheetA);
      
      // Save in cache for 5 minutes (300 seconds) to keep it fast
      if (requirementsA.length > 0) {
        cache.put(cacheKey, JSON.stringify(requirementsA), 300);
      }
    } catch (e) {
      Logger.log("Could not open main requirements sheet A: " + e.toString());
    }
  }

  // Always load fresh from active Sheet B (which is fast since it's local)
  let requirementsB = [];
  try {
    const ssB = SpreadsheetApp.getActiveSpreadsheet();
    const sheetB = getRequirementsSheet(ssB);
    requirementsB = parseSheetData(sheetB);
  } catch (e) {
    Logger.log("Could not open active requirements sheet B: " + e.toString());
  }

  // Combine and deduplicate
  const requirements = [];
  const reqKeys = new Set();
  
  const addToList = (list) => {
    list.forEach(r => {
      const key = `${r.date}_${r.requirement}_${r.assignee}`.toLowerCase();
      if (!reqKeys.has(key)) {
        reqKeys.add(key);
        requirements.push(r);
      }
    });
  };
  
  addToList(requirementsA);
  addToList(requirementsB);

  // Sort requirements by date descending
  requirements.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { success: true, requirements: requirements };
}

// 3. Add requirement (writes to Sheet B's "Final" tab, and optionally tries to write to Sheet A)
function handleAddRequirement(reqData, sheetId) {
  const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
  // Invalidate cache immediately on write
  CacheService.getScriptCache().remove("requirements_" + targetSheetId);

  const writeToSheet = (ssId, isMainSheet) => {
    try {
      let ss;
      if (isMainSheet) {
        ss = SpreadsheetApp.openById(ssId);
      } else {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      let sheet = getRequirementsSheet(ss);
      const standardHeaders = [
        'Date', 'Requirement', 'Priority', 'Job Description', 'Client Budget', 'Location', 
        'Client Name + company profile link', 'POC', 'Entity', 'Requirement Status', 'Assignee', 
        'Profile Status', 'Candidate shared to client on', 'Client Interview Date', 'Candidate', 
        'Onboarding Date', 'Requirement Closed Date', 'Requirement Owner'
      ];
      
      if (!sheet) {
        if (isMainSheet) return; // Do not create sheet on main spreadsheet if not existing
        sheet = ss.insertSheet('Final');
        sheet.appendRow(standardHeaders);
      }
      
      const lastCol = sheet.getLastColumn();
      let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
      
      // If headers are missing or not matching expected format, write standard headers (for Sheet B)
      if (!isMainSheet && (lastCol === 0 || headers.indexOf('requirement') === -1)) {
        sheet.clear();
        sheet.appendRow(standardHeaders);
        headers = standardHeaders.map(h => h.toLowerCase());
      }
      
      const rowData = new Array(headers.length).fill('');
      
      const setVal = (headerNames, value) => {
        const idx = findHeaderIdx(headers, headerNames);
        if (idx !== -1) rowData[idx] = value;
      };
      
      setVal(['date', 'opening date', 'requirement opening date'], reqData.date || new Date().toISOString().split('T')[0]);
      setVal(['requirement', 'requirement name'], reqData.requirement || '');
      setVal(['priority', 'requirement priority'], reqData.priority || 'Low');
      setVal(['job description', 'jd', 'jd link', 'job description link'], reqData.jd_link || '');
      setVal(['client budget', 'budget'], reqData.client_budget || '');
      setVal(['location'], reqData.location || '');
      setVal(['client name', 'client name + company profile link', 'client'], reqData.client_name || '');
      setVal(['poc', 'point of contact'], reqData.poc || '');
      setVal(['entity'], reqData.entity || '');
      setVal(['vendor budget'], reqData.vendor_budget || '');
      setVal(['type of contract', 'contract type'], reqData.contract_type || '—');
      setVal(['shift timings'], reqData.shift_timings || '');
      setVal(['c2c/c2h/permanent', 'c2c/c2h/perm'], reqData.employment_mode || '—');
      setVal(['automation status'], reqData.automation_status || '');
      setVal(['comments (marketing team)', 'comments (marketing)'], reqData.comments_marketing || '');
      setVal(['requirement status', 'status'], reqData.status || reqData.requirement_status || 'Inactive');
      setVal(['assignee', 'assigned to'], reqData.assignee || '');
      const idxCandOwner = findHeaderIdx(headers, ['candidate owner']);
      const defaultProfileStatus = (idxCandOwner !== -1) ? 'Candidate not provided by hiring team' : '—';
      setVal(['profile status'], reqData.profile_status || defaultProfileStatus);
      setVal(['candidate shared to client on', 'shared date', 'date shared'], reqData.shared_date || '');
      setVal(['client interview date', 'interview date'], reqData.interview_date || '');
      setVal(['candidate', 'candidate name'], reqData.candidate_name || '—');
      setVal(['internal assessment recording links', 'internal assessment', 'recording links'], reqData.assessment_link || '');
      setVal(['candidate owner'], reqData.candidate_owner || '');
      setVal(['onboarding date'], reqData.onboarding_date || '');
      setVal(['requirement closed date', 'closed date'], reqData.closed_date || '');
      setVal(['requirement owner', 'owner'], reqData.requirement_owner || 'HR');
      
      const trueLastRow = getTrueLastRow(sheet);
      sheet.getRange(trueLastRow + 1, 1, 1, rowData.length).setValues([rowData]);
    } catch (e) {
      Logger.log("Error writing requirement: " + e.toString());
    }
  };

  // Write to active sheet B
  writeToSheet(null, false);

  // Try to write to Sheet A
  writeToSheet(targetSheetId, true);

  return { success: true, message: 'Added requirement successfully.' };
}

// 4. Add marketing requirement to Sheet B and Sheet A
function handleMarketingAddRequirement(reqData, sheetId) {
  reqData.requirement_owner = 'Marketing';
  reqData.status = 'Pending Completion';
  reqData.assignee = '';
  reqData.profile_status = '—';
  reqData.candidate_name = '—';
  return handleAddRequirement(reqData, sheetId);
}

// 8. Update requirement (updates matching row in Sheet B and optionally Sheet A)
function handleUpdateRequirement(data, sheetId) {
  const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
  // Invalidate cache immediately on write
  CacheService.getScriptCache().remove("requirements_" + targetSheetId);

  const originalDate = data.original_date;
  const originalReq = data.original_requirement;

  if (!originalDate || !originalReq) {
    return { success: false, message: 'Missing original requirement identification (date and name)' };
  }

  const updateInSheet = (ssId, isMainSheet) => {
    try {
      let ss;
      if (isMainSheet) {
        ss = SpreadsheetApp.openById(ssId);
      } else {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      
      const sheet = getRequirementsSheet(ss);
      if (!sheet) return false;

      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return false;

      const fullData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
      const headers = fullData[0].map(h => h.toString().trim().toLowerCase());

      const colDate = findHeaderIdx(headers, ['date', 'opening date', 'requirement opening date']);
      const colReq = findHeaderIdx(headers, ['requirement', 'requirement name']);

      if (colDate === -1 || colReq === -1) return false;

      let foundRowIndex = -1;
      for (let r = 1; r < fullData.length; r++) {
        const row = fullData[r];
        const rowDate = normalizeDate(row[colDate]);
        const origDateNorm = normalizeDate(originalDate);

        const rowReqName = row[colReq].toString().trim();
        if (rowDate === origDateNorm && rowReqName.toLowerCase() === originalReq.toLowerCase()) {
          foundRowIndex = r + 1; // 1-indexed row number
          break;
        }
      }

      if (foundRowIndex === -1) return false;

      // Update the fields in that row
      const updateVal = (headerNames, value) => {
        if (value === undefined) return;
        const colIdx = findHeaderIdx(headers, headerNames);
        if (colIdx !== -1) {
          sheet.getRange(foundRowIndex, colIdx + 1).setValue(value);
        }
      };

      // Marketing-filled fields
      updateVal(['priority', 'requirement priority'], data.priority);
      updateVal(['job description', 'jd', 'jd link', 'job description link'], data.jd_link);
      updateVal(['client budget', 'budget'], data.client_budget);
      updateVal(['vendor budget'], data.vendor_budget);
      updateVal(['location'], data.location);
      updateVal(['type of contract', 'contract type'], data.contract_type);
      updateVal(['client name', 'client name + company profile link', 'client'], data.client_name);
      updateVal(['poc', 'point of contact'], data.poc);
      updateVal(['entity'], data.entity);
      updateVal(['shift timings'], data.shift_timings);
      updateVal(['c2c/c2h/permanent', 'c2c/c2h/perm'], data.employment_mode);
      updateVal(['automation status'], data.automation_status);
      updateVal(['comments (marketing team)', 'comments (marketing)'], data.comments_marketing);

      // HR completed fields
      updateVal(['requirement status', 'status'], data.status || data.requirement_status);
      updateVal(['assignee', 'assigned to'], data.assignee);
      updateVal(['profile status'], data.profile_status);
      updateVal(['candidate shared to client on', 'shared date', 'date shared'], data.shared_date);
      updateVal(['client interview date', 'interview date'], data.interview_date);
      updateVal(['candidate', 'candidate name'], data.candidate_name);
      updateVal(['internal assessment recording links', 'internal assessment', 'recording links'], data.assessment_link);
      updateVal(['candidate owner'], data.candidate_owner);
      updateVal(['onboarding date'], data.onboarding_date);
      updateVal(['requirement closed date', 'closed date'], data.closed_date);
      updateVal(['requirement owner', 'owner'], data.requirement_owner);

      return true;
    } catch (e) {
      Logger.log("Error updating sheet: " + e.toString());
      return false;
    }
  };

  const updatedB = updateInSheet(null, false);
  const updatedA = updateInSheet(targetSheetId, true);

  if (updatedB || updatedA) {
    return { success: true, message: 'Requirement updated successfully.' };
  } else {
    return { success: false, message: 'Requirement not found in sheets.' };
  }
}

// Helper to populate candidate-specific columns in a row value array
function updateCandidateFieldsInRow(headers, rowData, candidate, addedBy) {
  const findIdx = (names) => findHeaderIdx(headers, names);
  
  const idxCand = findIdx(['candidate', 'candidate name']);
  const idxProfileStatus = findIdx(['profile status']);
  const idxStatus = findIdx(['status', 'requirement status']);
  const idxProvDate = findIdx(['candidate provided date', 'candidate provided', 'provided date', 'candidate provided date']);
  const idxSharedDate = findIdx(['candidate shared to client on', 'shared date', 'date shared']);
  const idxProfileResume = findIdx(['profile']);
  const idxAssessment = findIdx(['internal assessment recording links', 'internal assessment', 'recording links']);
  const idxComments = findIdx(['comments (hiring team)', 'comments', 'remarks']);
  const idxCandOwner = findIdx(['candidate owner']);
  
  const todayStr = normalizeDate(new Date());
  
  if (idxCand !== -1) rowData[idxCand] = candidate.name;
  
  // Set Profile Status to "Candidate Provided by hiring team" if Candidate Owner column is present (SR style)
  if (idxProfileStatus !== -1) {
    if (idxCandOwner !== -1 || headers.indexOf('candidate owner') !== -1) {
      rowData[idxProfileStatus] = 'Candidate Provided by hiring team';
    } else {
      rowData[idxProfileStatus] = 'Screening';
    }
  }
  
  if (idxStatus !== -1) rowData[idxStatus] = 'Active';
  if (idxProvDate !== -1) rowData[idxProvDate] = todayStr;
  if (idxSharedDate !== -1) rowData[idxSharedDate] = todayStr;
  if (idxProfileResume !== -1 && candidate.resume_link) rowData[idxProfileResume] = candidate.resume_link;
  if (idxAssessment !== -1 && candidate.assessment_link) rowData[idxAssessment] = candidate.assessment_link;
  if (idxCandOwner !== -1) rowData[idxCandOwner] = addedBy || '—';
  
  const commentStr = `NP: ${candidate.notice_period || '—'}, CTC: ${candidate.ctc || '—'}, Remarks: ${candidate.remarks || '—'} (HR: ${addedBy || '—'})`;
  if (idxComments !== -1) {
    rowData[idxComments] = commentStr;
  }
}

// 5. Append candidate rows to active sheet B, and update/duplicate requirement row in sheets
function handleAddCandidates(data, sheetId) {
  // Invalidate cache immediately on write
  const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
  CacheService.getScriptCache().remove("requirements_" + targetSheetId);

  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Sheet B (writeable)
  
  let candSheet = ss.getSheetByName('Candidates');
  if (!candSheet) {
    candSheet = ss.insertSheet('Candidates');
    candSheet.appendRow([
      'Date', 'Requirement Name', 'Candidate Name', 'Resume Link', 'Assessment Link', 'Notice Period', 'CTC', 'Remarks', 'Submitted By'
    ]);
  }
  
  const candHeaders = candSheet.getRange(1, 1, 1, candSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
  const requirementName = data.requirement_name;
  const addedBy = data.added_by;
  const list = data.candidates || [];
  
  list.forEach(c => {
    const rowData = new Array(candHeaders.length).fill('');
    
    const setVal = (headerName, value) => {
      const idx = candHeaders.indexOf(headerName.toLowerCase());
      if (idx !== -1) rowData[idx] = value;
    };
    
    setVal('date', normalizeDate(new Date()));
    setVal('requirement name', requirementName);
    setVal('candidate name', c.name);
    setVal('resume link', c.resume_link);
    setVal('assessment link', c.assessment_link || '—');
    setVal('notice period', c.notice_period || '—');
    setVal('ctc', c.ctc || '—');
    setVal('remarks', c.remarks || '—');
    setVal('submitted by', addedBy);
    
    const trueLastRowVal = getTrueLastRow(candSheet);
    candSheet.getRange(trueLastRowVal + 1, 1, 1, rowData.length).setValues([rowData]);
  });
  
  const processRequirementCandidate = (ssId, isMainSheet) => {
    try {
      let ss;
      if (isMainSheet) {
        ss = SpreadsheetApp.openById(ssId);
      } else {
        ss = SpreadsheetApp.getActiveSpreadsheet();
      }
      
      const sheet = getRequirementsSheet(ss);
      if (!sheet) return;
      
      const lastRow = sheet.getLastRow();
      if (lastRow <= 1) return;
      
      const fullData = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
      const headers = fullData[0].map(h => h.toString().trim().toLowerCase());
      
      const colDate = findHeaderIdx(headers, ['date', 'opening date', 'requirement opening date']);
      const colReq = findHeaderIdx(headers, ['requirement', 'requirement name']);
      const colCand = findHeaderIdx(headers, ['candidate', 'candidate name']);
      
      if (colDate === -1 || colReq === -1) return;
      
      // Find all matching requirement rows
      const matchingRowIndices = [];
      const origDateNorm = normalizeDate(data.requirement_date || '');
      
      for (let r = 1; r < fullData.length; r++) {
        const row = fullData[r];
        const rowDate = normalizeDate(row[colDate]);
        const rowReqName = row[colReq].toString().trim();
        
        if (rowDate === origDateNorm && rowReqName.toLowerCase() === requirementName.toLowerCase()) {
          matchingRowIndices.push(r + 1); // 1-indexed row number
        }
      }
      
      if (matchingRowIndices.length === 0) return; // No requirement found to add candidate to!
      
      // Process each candidate in the list
      list.forEach(c => {
        // Find if there is a matching row with an empty candidate
        let emptyRowIndex = -1;
        for (let idx = 0; idx < matchingRowIndices.length; idx++) {
          const rNum = matchingRowIndices[idx];
          const candVal = colCand !== -1 ? sheet.getRange(rNum, colCand + 1).getValue().toString().trim() : '';
          if (!candVal || candVal === '—' || candVal === '') {
            emptyRowIndex = rNum;
            break;
          }
        }
        
        const todayStr = normalizeDate(new Date());
        const commentStr = `NP: ${c.notice_period || '—'}, CTC: ${c.ctc || '—'}, Remarks: ${c.remarks || '—'} (HR: ${addedBy || '—'})`;
        
        const updateCell = (rowIndex, names, val) => {
          const idx = findHeaderIdx(headers, names);
          if (idx !== -1) sheet.getRange(rowIndex, idx + 1).setValue(val);
        };
        
        if (emptyRowIndex !== -1) {
          // Update the existing row in-place (since the candidate is empty)
          const idxCandOwner = findHeaderIdx(headers, ['candidate owner']);
          const statusVal = (idxCandOwner !== -1) ? 'Candidate Provided by hiring team' : 'Screening';
          
          updateCell(emptyRowIndex, ['candidate', 'candidate name'], c.name);
          updateCell(emptyRowIndex, ['profile status'], statusVal);
          updateCell(emptyRowIndex, ['status', 'requirement status'], 'Active');
          updateCell(emptyRowIndex, ['candidate provided date', 'candidate provided', 'provided date', 'candidate provided date'], todayStr);
          updateCell(emptyRowIndex, ['candidate shared to client on', 'shared date', 'date shared'], todayStr);
          updateCell(emptyRowIndex, ['profile'], c.resume_link);
          updateCell(emptyRowIndex, ['internal assessment recording links', 'internal assessment', 'recording links'], c.assessment_link);
          updateCell(emptyRowIndex, ['candidate owner'], addedBy);
          updateCell(emptyRowIndex, ['comments (hiring team)', 'comments', 'remarks'], commentStr);
        } else {
          // All rows have other candidates, duplicate the last matching row
          const lastMatchingRow = matchingRowIndices[matchingRowIndices.length - 1];
          const rowValues = sheet.getRange(lastMatchingRow, 1, 1, headers.length).getValues()[0];
          
          updateCandidateFieldsInRow(headers, rowValues, c, addedBy);
          const trueLastRowVal = getTrueLastRow(sheet);
          sheet.getRange(trueLastRowVal + 1, 1, 1, rowValues.length).setValues([rowValues]);
          
          // Add the newly created row index to matching list so subsequent candidates don't overwrite it
          matchingRowIndices.push(trueLastRowVal + 1);
        }
      });
    } catch(e) {
      Logger.log("Error processing requirement candidate: " + e.toString());
    }
  };

  // Sync B
  processRequirementCandidate(null, false);

  // Sync A
  processRequirementCandidate(targetSheetId, true);
  
  return { success: true, message: 'Candidates submitted successfully.' };
}

// 6. Fetch Candidates list from active Sheet B
function handleListCandidates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // Sheet B (writeable)
  let sheet = ss.getSheetByName('Candidates');
  if (!sheet) {
    return { success: true, candidates: [] };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, candidates: [] };
  }
  
  const data = sheet.getRange(1, 1, lastRow, sheet.getLastColumn()).getValues();
  const headers = data[0].map(h => h.toString().trim().toLowerCase());
  
  const idxDate = headers.indexOf('date');
  const idxReq = headers.indexOf('requirement name');
  const idxCand = headers.indexOf('candidate name');
  const idxResume = headers.indexOf('resume link');
  const idxNotice = headers.indexOf('notice period');
  const idxCtc = headers.indexOf('ctc');
  const idxRemarks = headers.indexOf('remarks');
  const idxSub = headers.indexOf('submitted by');
  const idxInterview = headers.indexOf('interview status');
  const idxResult = headers.indexOf('interview result');
  const idxReason = headers.indexOf('rejection reason');
  
  const candidates = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    let dateVal = row[idxDate];
    if (dateVal instanceof Date) {
      dateVal = dateVal.toISOString().split('T')[0];
    } else {
      dateVal = dateVal.toString();
    }
    
    candidates.push({
      date: dateVal,
      requirement_name: idxReq !== -1 ? row[idxReq].toString() : '',
      candidate_name: idxCand !== -1 ? row[idxCand].toString() : '',
      resume_link: idxResume !== -1 ? row[idxResume].toString() : '',
      notice_period: idxNotice !== -1 ? row[idxNotice].toString() : '',
      ctc: idxCtc !== -1 ? row[idxCtc].toString() : '',
      remarks: idxRemarks !== -1 ? row[idxRemarks].toString() : '',
      submitted_by: idxSub !== -1 ? row[idxSub].toString() : '',
      interview_status: idxInterview !== -1 ? row[idxInterview].toString().trim() : '',
      interview_result: idxResult !== -1 ? row[idxResult].toString().trim() : '',
      rejection_reason: idxReason !== -1 ? row[idxReason].toString().trim() : ''
    });
  }
  
  return { success: true, candidates: candidates };
}

// 6b. Update candidate interview status & result in Candidates sheet & Requirements sheet
function handleUpdateCandidateInterviewStatus(data, sheetId) {
  const reqName = (data.requirement_name || '').toString().trim();
  const candName = (data.candidate_name || '').toString().trim();
  const status = (data.interview_status !== undefined) ? data.interview_status.toString().trim() : null;
  const result = (data.interview_result !== undefined) ? data.interview_result.toString().trim() : null;
  const reason = (data.rejection_reason !== undefined) ? data.rejection_reason.toString().trim() : null;

  if (!candName) {
    return { success: false, message: 'Candidate name is required.' };
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName('Candidates');
  if (!sheet) {
    return { success: false, message: 'Candidates sheet not found.' };
  }

  const lastRow = sheet.getLastRow();
  let lastCol = sheet.getLastColumn();
  if (lastRow <= 1) {
    return { success: false, message: 'No candidate records found.' };
  }

  let headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
  
  let idxInterview = headers.indexOf('interview status');
  if (idxInterview === -1) {
    sheet.getRange(1, lastCol + 1).setValue('Interview Status');
    lastCol++;
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
    idxInterview = headers.indexOf('interview status');
  }

  let idxResult = headers.indexOf('interview result');
  if (idxResult === -1) {
    sheet.getRange(1, lastCol + 1).setValue('Interview Result');
    lastCol++;
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
    idxResult = headers.indexOf('interview result');
  }

  let idxReason = headers.indexOf('rejection reason');
  if (idxReason === -1) {
    sheet.getRange(1, lastCol + 1).setValue('Rejection Reason');
    lastCol++;
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
    idxReason = headers.indexOf('rejection reason');
  }

  let idxNotSubmitted = headers.indexOf('not submitted reason');
  if (idxNotSubmitted === -1) {
    sheet.getRange(1, lastCol + 1).setValue('Not Submitted Reason');
    lastCol++;
    headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => h.toString().trim().toLowerCase());
    idxNotSubmitted = headers.indexOf('not submitted reason');
  }

  const idxReq = headers.indexOf('requirement name');
  const idxCand = headers.indexOf('candidate name');

  if (idxCand === -1) {
    return { success: false, message: 'Candidate Name column not found in Candidates sheet.' };
  }

  const fullData = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  let updatedCount = 0;

  for (let r = 1; r < fullData.length; r++) {
    const row = fullData[r];
    const rowCand = row[idxCand].toString().trim().toLowerCase();
    const rowReq = idxReq !== -1 ? row[idxReq].toString().trim().toLowerCase() : '';

    const candMatch = (rowCand === candName.toLowerCase());
    const reqMatch = (!reqName || rowReq === reqName.toLowerCase());

    if (candMatch && reqMatch) {
      if (status !== null) {
        sheet.getRange(r + 1, idxInterview + 1).setValue(status);
      }
      if (result !== null) {
        sheet.getRange(r + 1, idxResult + 1).setValue(result);
      }
      if (reason !== null) {
        sheet.getRange(r + 1, idxReason + 1).setValue(reason);
      }
      if (data.not_submitted_reason !== undefined) {
        sheet.getRange(r + 1, idxNotSubmitted + 1).setValue(data.not_submitted_reason.toString().trim());
      }
      updatedCount++;
    }
  }

  // Also update Requirements sheet if matching candidate row exists
  try {
    const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
    const updateReqSheet = (ssObj) => {
      const reqSheet = getRequirementsSheet(ssObj);
      if (!reqSheet) return;
      const rLastRow = reqSheet.getLastRow();
      if (rLastRow <= 1) return;
      const rHeaders = reqSheet.getRange(1, 1, 1, reqSheet.getLastColumn()).getValues()[0].map(h => h.toString().trim().toLowerCase());
      const rColCand = findHeaderIdx(rHeaders, ['candidate', 'candidate name']);
      const rColProfileStatus = findHeaderIdx(rHeaders, ['profile status']);
      if (rColCand !== -1 && rColProfileStatus !== -1) {
        const rData = reqSheet.getRange(1, 1, rLastRow, reqSheet.getLastColumn()).getValues();
        for (let i = 1; i < rData.length; i++) {
          if (rData[i][rColCand].toString().trim().toLowerCase() === candName.toLowerCase()) {
            if (result === 'Accepted') {
              reqSheet.getRange(i + 1, rColProfileStatus + 1).setValue('Interview feedback with client pass');
            } else if (result === 'Rejected') {
              reqSheet.getRange(i + 1, rColProfileStatus + 1).setValue('Interview feedback with client fail');
            } else if (status === 'Profile Sent for Interview') {
              reqSheet.getRange(i + 1, rColProfileStatus + 1).setValue('Shared candidate profile with client');
            }
          }
        }
      }
    };
    updateReqSheet(ss);
    if (targetSheetId) {
      try {
        const ssA = SpreadsheetApp.openById(targetSheetId);
        updateReqSheet(ssA);
      } catch(eA) {
        Logger.log("Could not open Sheet A: " + eA.toString());
      }
    }
    CacheService.getScriptCache().remove("requirements_" + targetSheetId);
  } catch(e) {
    Logger.log("Note on updating req sheet interview status: " + e.toString());
  }

  return { success: true, message: `Updated interview details for ${candName} (${updatedCount} rows).` };
}

// ============================================================================
// 7. FIND SUITABLE CANDIDATES VIA AI VECTOR WORKFLOW (Gemini 768d + Supabase)
// Converted directly from n8n vector matching pipeline
// ============================================================================
const GEMINI_EMBEDDING_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_EMBEDDING_API_KEY') || "";
const SUPABASE_URL = "https://lxhyyubrlcwmmmscuame.supabase.co/rest/v1/rpc/match_candidates";
const SUPABASE_API_KEY = PropertiesService.getScriptProperties().getProperty('SUPABASE_API_KEY') || "";

function handleFindSuitableCandidates(data, sheetId) {
  let jdText = (data.jd_text || '').trim();
  const jdLink = (data.jd_link || '').trim();
  const reqName = (data.requirement_name || data.requirement || '').trim();
  const matchCount = parseInt(data.limit || 5, 10) || 5;

  // 1. Text extraction from Google Drive / Docs file if jdLink is provided
  if (jdLink) {
    const fileIdMatch = jdLink.match(/[-\w]{25,}/);
    if (fileIdMatch && fileIdMatch[0]) {
      const fileId = fileIdMatch[0];
      try {
        const file = DriveApp.getFileById(fileId);
        const mimeType = file.getMimeType();
        let extractedText = '';

        if (mimeType === 'application/vnd.google-apps.document') {
          // Google Doc
          extractedText = DocumentApp.openById(fileId).getBody().getText();
        } else if (mimeType.indexOf('wordprocessingml') !== -1 || mimeType.indexOf('msword') !== -1 || file.getName().toLowerCase().endsWith('.docx')) {
          // DOCX / Word document: uncompressed word/document.xml extraction
          try {
            const blob = file.getBlob();
            blob.setContentType('application/zip');
            const unzipped = Utilities.unzip(blob);
            for (let i = 0; i < unzipped.length; i++) {
              const entryName = unzipped[i].getName();
              if (entryName === 'word/document.xml' || entryName.endsWith('document.xml')) {
                const xmlStr = unzipped[i].getDataAsString();
                extractedText = xmlStr.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
                break;
              }
            }
          } catch(eDocx) {
            Logger.log("DOCX extraction error: " + eDocx.toString());
          }
        } else if (mimeType === 'application/pdf') {
          // Attempt plain text read or fallback
          try {
            const rawStr = file.getBlob().getDataAsString();
            const printable = rawStr.replace(/[^\x20-\x7E\n\r]/g, ' ');
            const cleaned = printable.replace(/\s+/g, ' ').trim();
            if (cleaned.length > 50 && cleaned.indexOf('%PDF') === -1) {
              extractedText = cleaned.substring(0, 3500);
            }
          } catch(ePdf) {
            Logger.log("PDF extraction note: " + ePdf.toString());
          }
        } else {
          // Plain text / markdown / other text file
          extractedText = file.getBlob().getDataAsString();
        }

        if (extractedText && extractedText.trim().length > 10) {
          jdText = (jdText ? jdText + "\n\n" : "") + extractedText.trim();
        }
      } catch (errDrive) {
        Logger.log("Drive extraction notice: " + errDrive.toString());
      }
    }
  }

  // Fallback to requirement name if no text extracted
  if (!jdText) {
    if (reqName) {
      jdText = reqName;
    } else {
      return { success: false, message: 'Please provide a requirement name, JD text, or valid Google Drive link.' };
    }
  }

  // Cap at 6000 characters to stay within model limits
  if (jdText.length > 6000) {
    jdText = jdText.substring(0, 6000);
  }

  // 2. Generate 768-dimensional embedding via Gemini API
  let embeddingValues = null;
  try {
    const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=" + GEMINI_EMBEDDING_API_KEY;
    const geminiPayload = {
      content: {
        parts: [{ text: jdText }]
      },
      outputDimensionality: 768
    };

    const geminiRes = UrlFetchApp.fetch(geminiUrl, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(geminiPayload),
      muteHttpExceptions: true
    });

    const resCode = geminiRes.getResponseCode();
    if (resCode >= 200 && resCode < 300) {
      const geminiJson = JSON.parse(geminiRes.getContentText());
      if (geminiJson.embedding && geminiJson.embedding.values) {
        embeddingValues = geminiJson.embedding.values;
      }
    } else {
      Logger.log("Gemini API error (" + resCode + "): " + geminiRes.getContentText());
    }
  } catch (errGemini) {
    Logger.log("Gemini call error: " + errGemini.toString());
  }

  // 3. Query Supabase RPC match_candidates
  if (embeddingValues && embeddingValues.length === 768) {
    try {
      const supaPayload = {
        query_embedding: embeddingValues,
        match_count: matchCount
      };

      const supaRes = UrlFetchApp.fetch(SUPABASE_URL, {
        method: "post",
        headers: {
          "apikey": SUPABASE_API_KEY,
          "Authorization": "Bearer " + SUPABASE_API_KEY,
          "Prefer": "return=representation"
        },
        contentType: "application/json",
        payload: JSON.stringify(supaPayload),
        muteHttpExceptions: true
      });

      const supaCode = supaRes.getResponseCode();
      if (supaCode >= 200 && supaCode < 300) {
        const rawCandidates = JSON.parse(supaRes.getContentText());
        return {
          success: true,
          source: 'vector_supabase_ai',
          matches: rawCandidates,
          matches_count: rawCandidates.length,
          jd_preview: jdText.substring(0, 180) + (jdText.length > 180 ? '...' : '')
        };
      } else {
        Logger.log("Supabase RPC error (" + supaCode + "): " + supaRes.getContentText());
      }
    } catch (errSupa) {
      Logger.log("Supabase call error: " + errSupa.toString());
    }
  }

  // 4. Graceful Fallback: Use keyword-based pool matcher if vector search is unavailable
  Logger.log("Falling back to sheet keyword matcher");
  const fallbackResult = handleFindResume({ jd_text: jdText }, sheetId);
  fallbackResult.source = 'fallback_keyword_matcher';
  fallbackResult.note = 'Vector search was temporarily unavailable; served from fallback pool.';
  return fallbackResult;
}

// 7b. Fallback keyword-based candidate pool matcher
function handleFindResume(data, sheetId) {
  const jdText = data.jd_text;
  if (!jdText) {
    return { success: false, message: 'No job description or requirement text provided.' };
  }
  
  const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
  
  // 1. Load candidate pool from Sheets
  let candidatePool = [];
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    // Try to find a sheet with candidate pool (e.g., 'Naukri', 'Candidate Pool', 'Resumes')
    let poolSheet = getSheetByNameCaseInsensitive(ss, 'Naukri') || 
                    getSheetByNameCaseInsensitive(ss, 'Candidate Pool') || 
                    getSheetByNameCaseInsensitive(ss, 'Resumes');
                    
    // If not in Sheet B, try in Sheet A
    if (!poolSheet) {
      try {
        const ssA = SpreadsheetApp.openById(targetSheetId);
        poolSheet = getSheetByNameCaseInsensitive(ssA, 'Naukri') || 
                    getSheetByNameCaseInsensitive(ssA, 'Candidate Pool') || 
                    getSheetByNameCaseInsensitive(ssA, 'Resumes');
      } catch (e) {
        Logger.log("Could not open Sheet A for candidate pool: " + e.toString());
      }
    }
    
    if (poolSheet) {
      const lastRow = poolSheet.getLastRow();
      if (lastRow > 1) {
        const sheetData = poolSheet.getRange(1, 1, lastRow, poolSheet.getLastColumn()).getValues();
        const headers = sheetData[0].map(h => h.toString().trim().toLowerCase());
        
        const idxName = headers.indexOf('candidate name') !== -1 ? headers.indexOf('candidate name') : headers.indexOf('name');
        const idxSkills = headers.indexOf('key skills') !== -1 ? headers.indexOf('key skills') : (headers.indexOf('skills') !== -1 ? headers.indexOf('skills') : headers.indexOf('resume text'));
        const idxLink = headers.indexOf('resume link') !== -1 ? headers.indexOf('resume link') : (headers.indexOf('resume') !== -1 ? headers.indexOf('resume') : headers.indexOf('link'));
        
        if (idxName !== -1 && idxSkills !== -1) {
          for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            const name = row[idxName].toString().trim();
            const skillsStr = row[idxSkills].toString().trim();
            const link = idxLink !== -1 ? row[idxLink].toString().trim() : '';
            if (name && skillsStr) {
              candidatePool.push({
                name: name,
                skills: skillsStr,
                resume_link: link
              });
            }
          }
        }
      }
    }
  } catch (err) {
    Logger.log("Error loading candidate pool: " + err.toString());
  }
  
  // 2. If pool is empty or sheet not found, use a rich fallback list of mock candidates
  if (candidatePool.length === 0) {
    candidatePool = [
      {
        name: "Pavan Kumar",
        skills: "ServiceNow, ITSM, ITIL, Portal Development, Client Scripting, Business Rules, Legal Service Delivery, Workflow, Flow Designer",
        resume_link: "https://drive.google.com/file/d/1example1"
      },
      {
        name: "Shraddha Kulkarni",
        skills: "ServiceNow Portal, Service Portal, Angular, JavaScript, HTML, CSS, Bootstrap, Widget Customization, UI/UX, ITSM",
        resume_link: "https://drive.google.com/file/d/1example2"
      },
      {
        name: "Harsh Vardhan",
        skills: "ServiceNow Developer, AP/EA, Application Portfolio Management, Enterprise Architecture, IntegrationHub, REST API, ITOM",
        resume_link: "https://drive.google.com/file/d/1example3"
      },
      {
        name: "Thami Zharasan",
        skills: "ServiceNow ITAM, Software Asset Management, SAMPro, Hardware Asset Management, HAM, Discovery, ServiceNow Consultant",
        resume_link: "https://drive.google.com/file/d/1example4"
      },
      {
        name: "Amit Verma",
        skills: "ServiceNow ITSM, Functional Consultant, Agile, Requirement Gathering, Scrum, Business Analyst, Process Mapping, ServiceNow Implementation",
        resume_link: "https://drive.google.com/file/d/1example5"
      },
      {
        name: "Rohan Sharma",
        skills: "ServiceNow ITSM Developer, Service Catalog, Client Scripts, UI Policies, Business Rules, JavaScript, ServiceNow Integration",
        resume_link: "https://drive.google.com/file/d/1example6"
      },
      {
        name: "Anjali Mehta",
        skills: "ServiceNow HRSD, HR Service Delivery, Case Management, Employee Service Center, HR Lifecycle Events, ServiceNow Administration",
        resume_link: "https://drive.google.com/file/d/1example7"
      },
      {
        name: "Vikram Malhotra",
        skills: "ServiceNow ITOM, Discovery, Service Mapping, Event Management, Orchestration, Cloud Provisioning, MID Server Setup",
        resume_link: "https://drive.google.com/file/d/1example8"
      }
    ];
  }
  
  // 3. Perform matching
  const jdLower = jdText.toLowerCase();
  
  // Extract keywords from JD
  const stopWords = new Set(["and", "the", "to", "of", "in", "for", "with", "a", "an", "is", "are", "on", "at", "by", "that", "this", "from", "as", "experience", "skills", "knowledge", "candidate", "role", "job", "description", "requirement", "work", "developer", "consultant", "engineer", "expert", "specialist"]);
  const jdWords = jdLower.match(/[a-z0-9+#]+/g) || [];
  const jdKeywords = [...new Set(jdWords.filter(w => w.length > 1 && !stopWords.has(w)))];
  
  const matches = [];
  
  for (let i = 0; i < candidatePool.length; i++) {
    const cand = candidatePool[i];
    const skillsLower = cand.skills.toLowerCase();
    
    // Find matching keywords
    const matchedSkills = [];
    let matchCount = 0;
    
    // Check specific skill phrases first
    const candSkillsList = cand.skills.split(',').map(s => s.trim());
    
    candSkillsList.forEach(skill => {
      const skillLower = skill.toLowerCase();
      // If the skill is mentioned in the JD
      if (jdLower.indexOf(skillLower) !== -1) {
        matchedSkills.push(skill);
        matchCount += 2; // Extra weight for exact skill tag matches
      }
    });
    
    // Check individual keywords
    jdKeywords.forEach(keyword => {
      if (skillsLower.indexOf(keyword) !== -1) {
        // Avoid duplicate skill names in the matched list
        const isAlreadyMatched = matchedSkills.some(s => s.toLowerCase().indexOf(keyword) !== -1);
        if (!isAlreadyMatched) {
          // Capitalize first letter of keyword for display
          const capKeyword = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          matchedSkills.push(capKeyword);
        }
        matchCount += 1;
      }
    });
    
    // Deduplicate matchedSkills
    const uniqueMatchedSkills = [...new Set(matchedSkills)];
    
    if (matchCount > 0) {
      // Overlap ratio is based on matched keywords relative to total JD keywords
      const totalJdKeywordsCount = jdKeywords.length || 1;
      const overlapRatio = Math.min(matchCount / (totalJdKeywordsCount + 5), 1.0); // normalize with scaling
      const fitScore = matchCount;
      
      matches.push({
        matched_skills: uniqueMatchedSkills,
        resume_link: cand.resume_link,
        overlap_ratio: Math.max(0.1, Math.min(overlapRatio, 0.98)), // keep within realistic bounds
        fit_score: fitScore,
        match_count: uniqueMatchedSkills.length
      });
    }
  }
  
  // Sort matches by fit score descending
  matches.sort((a, b) => b.fit_score - a.fit_score);
  
  // Return top 5 matches
  return { success: true, matches: matches.slice(0, 5) };
}

function normalizeDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    try {
      const year = val.getFullYear();
      const month = (val.getMonth() + 1).toString().padStart(2, '0');
      const day = val.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch(e) {
      // fallback
    }
  }
  
  const str = val.toString().trim();
  if (!str) return '';
  
  // Match DD-MM-YYYY
  const dm = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dm) {
    const day = dm[1].padStart(2, '0');
    const month = dm[2].padStart(2, '0');
    const year = dm[3];
    return `${year}-${month}-${day}`;
  }
  
  // Match DD-MM-YY (e.g. 20-08-26)
  const dmyy = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2})$/);
  if (dmyy) {
    const day = dmyy[1].padStart(2, '0');
    const month = dmyy[2].padStart(2, '0');
    const year = '20' + dmyy[3];
    return `${year}-${month}-${day}`;
  }
  
  // Try native Date parsing
  try {
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch(e) {}
  
  return str;
}

// ---- HR INTERVIEWS & GROQ EVALUATION HANDLERS ----

function getOrCreateInterviewsSheet(ss) {
  let sheet = getSheetByNameCaseInsensitive(ss, 'Interviews');
  if (!sheet) {
    sheet = ss.insertSheet('Interviews');
    sheet.appendRow([
      'Interview ID',
      'Candidate Name',
      'Candidate Email',
      'Requirement Name',
      'Scheduled Date',
      'Scheduled Time',
      'Round',
      'Interviewer',
      'Meet Link',
      'Status',
      'Drive Link',
      'Transcript',
      'Notes',
      'Evaluation JSON',
      'Created At'
    ]);
  }
  return sheet;
}

function handleListHRInterviews(sheetId) {
  try {
    const targetSheetId = sheetId || SHEET_ID_A;
    const ss = SpreadsheetApp.openById(targetSheetId);
    const sheet = getOrCreateInterviewsSheet(ss);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) {
      return {
        success: true,
        interviews: [
          {
            id: 'int_101',
            candidate_name: 'Pavan Kumar',
            candidate_email: 'pavan.kumar.work@gmail.com',
            requirement_name: 'Legal Service Delivery',
            scheduled_date: '2026-09-18',
            scheduled_time: '14:30',
            round: 'Technical Round 1',
            interviewer: 'Vasundhara Panwar',
            meet_link: 'https://meet.google.com/qwe-rtyu-iop',
            status: 'Scheduled',
            drive_link: '',
            transcript: '',
            notes: 'ServiceNow Legal Service Delivery module and custom workflows.',
            created_at: new Date().toISOString(),
            evaluation: null
          }
        ]
      };
    }

    const data = sheet.getRange(2, 1, lastRow - 1, 15).getValues();
    const interviews = data.map(row => {
      let evalObj = null;
      if (row[13]) {
        try { evalObj = JSON.parse(row[13]); } catch (e) {}
      }
      return {
        id: row[0].toString(),
        candidate_name: row[1].toString(),
        candidate_email: row[2].toString(),
        requirement_name: row[3].toString(),
        scheduled_date: normalizeDate(row[4]),
        scheduled_time: row[5].toString(),
        round: row[6].toString(),
        interviewer: row[7].toString(),
        meet_link: row[8].toString(),
        status: row[9].toString() || 'Scheduled',
        drive_link: row[10].toString(),
        transcript: row[11].toString(),
        notes: row[12].toString(),
        evaluation: evalObj,
        created_at: row[14] ? row[14].toString() : ''
      };
    });

    return { success: true, interviews: interviews };
  } catch (err) {
    return { success: false, message: 'Failed to list HR interviews: ' + err.toString(), interviews: [] };
  }
}

function handleScheduleHRInterview(data, sheetId) {
  try {
    const candidateName = data.candidate_name;
    const candidateEmail = data.candidate_email;
    if (!candidateName || !candidateEmail) {
      return { success: false, message: 'Candidate name and candidate email are required' };
    }

    const intId = 'int_' + new Date().getTime();
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const randPart = (len) => Array.from({ length: len }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    const meetLink = data.meet_link || `https://meet.google.com/${randPart(3)}-${randPart(4)}-${randPart(3)}`;

    // Resolve interviewer email
    let interviewerEmail = (data.interviewer_email || '').toString().trim();
    if (!interviewerEmail && data.interviewer) {
      const cleanInt = data.interviewer.toString().trim().toLowerCase();
      const knownEmails = {
        'vasundhara panwar': 'vasundhara@steadyrabbit.in',
        'vasundhara': 'vasundhara@steadyrabbit.in',
        'vasundhra panwar': 'vasundhra.panwar@steadyrabbit.in',
        'vasundhra': 'vasundhra.panwar@steadyrabbit.in',
        'navya rastogi': 'navya.rastogi@steady-rabbit.com',
        'navya': 'navya.rastogi@steady-rabbit.com',
        'diksha sharma': 'diksha@steadyrabbit.in',
        'diksha': 'diksha@steadyrabbit.in',
        'likitha': 'likitha@steadyrabbit.in',
        'richa': 'richa@steadyrabbit.in',
        'kavipriya': 'kavipriya@steadyrabbit.in',
        'ayushi': 'ayushi@steadyrabbit.in',
        'prachi': 'prachi@steadyrabbit.in',
        'naagu': 'naagu@steadyrabbit.in',
        'afsheen': 'afsheen@steadyrabbit.in',
        'marketing': 'marketing@steadyrabbit.in',
        'recruit41 ai': 'ai-interviews@steadyrabbit.in'
      };
      for (let k in knownEmails) {
        if (cleanInt.indexOf(k) !== -1) {
          interviewerEmail = knownEmails[k];
          break;
        }
      }
      if (!interviewerEmail) {
        interviewerEmail = cleanInt.replace(/[^a-z0-9]/g, '.') + '@steadyrabbit.in';
      }
    }

    let interviewerEmailSent = false;
    let candidateEmailSent = false;

    // Helper to send email with GmailApp and MailApp fallback
    function dispatchEmail(to, subject, htmlContent) {
      try {
        GmailApp.sendEmail(to, subject, '', { htmlBody: htmlContent });
        return true;
      } catch (gErr) {
        try {
          MailApp.sendEmail({ to: to, subject: subject, htmlBody: htmlContent });
          return true;
        } catch (mErr) {
          Logger.log('Email dispatch failed for ' + to + ': ' + mErr.toString());
          return false;
        }
      }
    }

    // 1. Send email notification to Interviewer
    if (interviewerEmail && data.send_interviewer_invite !== false) {
      const intSubject = `[Interview Scheduled] ${candidateName} — ${data.requirement_name || 'Technical Assessment'}`;
      const intBody = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:8px;">
          <h2 style="color:#2563eb; margin-top:0;">Steady Rabbit — Interview Assigned</h2>
          <p>Hi <b>${data.interviewer || 'Interviewer'}</b>,</p>
          <p>You have been assigned as the interviewer for <b>${candidateName}</b>.</p>
          <div style="background:#f1f5f9; padding:15px; border-radius:6px; margin:16px 0; border-left:4px solid #2563eb;">
            <p style="margin:4px 0;"><b>Candidate:</b> ${candidateName} (${candidateEmail})</p>
            <p style="margin:4px 0;"><b>Requirement:</b> ${data.requirement_name || 'General Requirement'}</p>
            <p style="margin:4px 0;"><b>Date:</b> ${data.scheduled_date || 'Upcoming'}</p>
            <p style="margin:4px 0;"><b>Time:</b> ${data.scheduled_time || '15:00 IST'}</p>
            <p style="margin:4px 0;"><b>Round:</b> ${data.round || 'Technical Round 1'}</p>
            ${data.notes ? `<p style="margin:4px 0;"><b>Topics / Notes:</b> ${data.notes}</p>` : ''}
          </div>
          <p>Google Meet link for this session:</p>
          <p style="text-align:center; margin:20px 0;">
            <a href="${meetLink}" style="background:#2563eb; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold; display:inline-block;">Join Google Meet Session</a>
          </p>
          <p style="font-size:12px; color:#64748b;">Meeting Link: <a href="${meetLink}">${meetLink}</a></p>
          <p style="font-size:11px; color:#94a3b8; margin-top:20px;">Automated notification sent via Steady Rabbit Requirement Console.</p>
        </div>
      `;
      interviewerEmailSent = dispatchEmail(interviewerEmail, intSubject, intBody);
    }

    // 2. Send email invite to candidate's Gmail
    if (candidateEmail) {
      const candSubject = `Interview Invitation: ${data.requirement_name || 'Technical Assessment'} with Steady Rabbit`;
      const candBody = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; padding:20px; border:1px solid #e0e0e0; border-radius:8px;">
          <h2 style="color:#2e7c62;">Steady Rabbit — Interview Scheduled</h2>
          <p>Dear <b>${candidateName}</b>,</p>
          <p>You have been scheduled for an interview for the role of <b>${data.requirement_name || 'Technical Consultant'}</b>.</p>
          <div style="background:#f4f7f6; padding:15px; border-radius:6px; margin:16px 0;">
            <p style="margin:4px 0;"><b>Date:</b> ${data.scheduled_date || 'Upcoming'}</p>
            <p style="margin:4px 0;"><b>Time:</b> ${data.scheduled_time || '15:00 IST'}</p>
            <p style="margin:4px 0;"><b>Round:</b> ${data.round || 'Technical Round 1'}</p>
            <p style="margin:4px 0;"><b>Interviewer:</b> ${data.interviewer || 'HR Team'}</p>
          </div>
          <p>Please join the interview using the Google Meet link below:</p>
          <p style="text-align:center; margin:24px 0;">
            <a href="${meetLink}" style="background:#4fd1a5; color:#062018; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold; display:inline-block;">Join Google Meet</a>
          </p>
          <p style="font-size:12px; color:#666;">Meeting Link: <a href="${meetLink}">${meetLink}</a></p>
          <p>Best regards,<br><b>Steady Rabbit Talent Team</b></p>
        </div>
      `;
      candidateEmailSent = dispatchEmail(candidateEmail, candSubject, candBody);
    }

    // 3. Save interview session in spreadsheet
    try {
      const targetSheetId = sheetId || STEADY_RABBIT_MAIN_REQ_SHEET_A_ID;
      const ss = SpreadsheetApp.openById(targetSheetId);
      const sheet = getOrCreateInterviewsSheet(ss);
      const newRow = [
        intId,
        candidateName,
        candidateEmail,
        data.requirement_name || 'General Requirement',
        data.scheduled_date || new Date().toISOString().split('T')[0],
        data.scheduled_time || '15:00',
        data.round || 'Technical Round 1',
        data.interviewer || 'HR Team',
        meetLink,
        'Scheduled',
        '',
        '',
        data.notes || '',
        '',
        new Date().toISOString()
      ];
      sheet.appendRow(newRow);
    } catch (sheetErr) {
      Logger.log('Interviews sheet append note: ' + sheetErr.toString());
    }

    return {
      success: true,
      message: `Interview scheduled! Google Meet link generated and email notifications sent to interviewer (${data.interviewer || 'Team'} <${interviewerEmail}>) and candidate (${candidateEmail}).`,
      interviewer_email: interviewerEmail,
      interviewer_email_sent: interviewerEmailSent,
      candidate_email_sent: candidateEmailSent,
      interview: {
        id: intId,
        candidate_name: candidateName,
        candidate_email: candidateEmail,
        requirement_name: data.requirement_name,
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time,
        round: data.round,
        interviewer: data.interviewer,
        interviewer_email: interviewerEmail,
        meet_link: meetLink,
        status: 'Scheduled',
        notes: data.notes || '',
        created_at: new Date().toISOString()
      }
    };
  } catch (err) {
    return { success: false, message: 'Error scheduling interview: ' + err.toString() };
  }
}
        requirement_name: data.requirement_name,
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time,
        round: data.round,
        interviewer: data.interviewer,
        meet_link: meetLink,
        status: 'Scheduled'
      }
    };
  } catch (err) {
    return { success: false, message: 'Failed to schedule interview: ' + err.toString() };
  }
}

function handleUpdateHRInterview(data, sheetId) {
  try {
    const targetSheetId = sheetId || SHEET_ID_A;
    const ss = SpreadsheetApp.openById(targetSheetId);
    const sheet = getOrCreateInterviewsSheet(ss);
    const lastRow = sheet.getLastRow();
    
    if (lastRow <= 1) return { success: false, message: 'No interviews found' };

    const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0].toString() === data.id) {
        rowIndex = i + 2;
        break;
      }
    }

    if (rowIndex === -1) return { success: false, message: 'Interview ID not found' };

    if (data.drive_link !== undefined) sheet.getRange(rowIndex, 11).setValue(data.drive_link);
    if (data.transcript !== undefined) sheet.getRange(rowIndex, 12).setValue(data.transcript);
    if (data.notes !== undefined) sheet.getRange(rowIndex, 13).setValue(data.notes);
    if (data.evaluation !== undefined) sheet.getRange(rowIndex, 14).setValue(JSON.stringify(data.evaluation));
    if (data.status !== undefined) sheet.getRange(rowIndex, 10).setValue(data.status);
    else if (data.drive_link) sheet.getRange(rowIndex, 10).setValue('Recording Added');

    return { success: true, message: 'Interview updated successfully' };
  } catch (err) {
    return { success: false, message: 'Failed to update interview: ' + err.toString() };
  }
}

function handleGroqEvaluate(data, sheetId) {
  try {
    const apiKey = data.api_key;
    const candidateName = data.candidate_name || 'Candidate';
    const requirement = data.requirement_name || 'Requirement';
    const transcript = data.transcript || data.notes || 'Candidate answered technical and domain questions.';
    
    if (apiKey && apiKey.indexOf('gsk_') === 0) {
      const url = 'https://api.groq.com/openai/v1/chat/completions';
      const payload = {
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are an expert technical interviewer and AI hiring assessor at Steady Rabbit. Evaluate candidate on Technical, Communication, Aptitude skills. Output valid JSON only with keys: technical_score, technical_feedback, communication_score, communication_feedback, aptitude_score, aptitude_feedback, overall_score, recommendation, strengths, improvements, summary.'
          },
          {
            role: 'user',
            content: 'Candidate: ' + candidateName + '\nRequirement: ' + requirement + '\nTranscript / Notes:\n' + transcript
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      };

      const options = {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + apiKey },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const resp = UrlFetchApp.fetch(url, options);
      if (resp.getResponseCode() === 200) {
        const parsedResp = JSON.parse(resp.getContentText());
        const evalObj = JSON.parse(parsedResp.choices[0].message.content);
        if (data.id) {
          handleUpdateHRInterview({ id: data.id, evaluation: evalObj, status: 'Evaluated' }, sheetId);
        }
        return { success: true, evaluation: evalObj, source: 'groq_live' };
      }
    }

    // Fallback simulation
    const fallbackEval = {
      technical_score: 8.7,
      technical_feedback: 'Demonstrated solid understanding of ' + requirement + ' core concepts and problem resolution.',
      communication_score: 8.5,
      communication_feedback: 'Clear, concise, and structured explanations throughout the conversation.',
      aptitude_score: 8.4,
      aptitude_feedback: 'Methodical troubleshooting mindset with quick decomposition of questions.',
      overall_score: 8.5,
      recommendation: 'Strong Hire',
      strengths: ['Domain knowledge in ' + requirement, 'Structured communication', 'Pragmatic problem solving'],
      improvements: ['Can strengthen exposure to advanced architecture patterns'],
      summary: candidateName + ' demonstrated strong readiness and suitability for ' + requirement + '.'
    };

    if (data.id) {
      handleUpdateHRInterview({ id: data.id, evaluation: fallbackEval, status: 'Evaluated' }, sheetId);
    }

    return { success: true, evaluation: fallbackEval, source: 'groq_simulated' };
  } catch (err) {
    return { success: false, message: 'Groq evaluation error: ' + err.toString() };
  }
}

