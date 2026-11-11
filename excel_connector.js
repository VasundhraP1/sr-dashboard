/**
 * Excel Data Connector for Steady Rabbit Console
 * Connects to Microsoft Excel (.xlsx / .xls) spreadsheets to collect candidates and requirements
 * alongside Database (Supabase Vector DB) and Google Sheets.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const EXCEL_DATA_DIR = path.join(__dirname, 'excel_data');

// Ensure directory exists
function ensureExcelDir() {
  if (!fs.existsSync(EXCEL_DATA_DIR)) {
    try {
      fs.mkdirSync(EXCEL_DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('[Excel Connector] Could not create excel_data directory:', e.message);
    }
  }
}

/**
 * Normalizes header string to alphanumeric lowercase for robust column mapping
 */
function cleanKey(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes date values from Excel (which may be date serials, Date objects, or strings)
 */
function formatExcelDate(val) {
  if (!val) return new Date().toISOString().split('T')[0];
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().split('T')[0];
  }
  if (typeof val === 'number') {
    // Excel date serial number
    try {
      const dateObj = XLSX.SSF.parse_date_code(val);
      if (dateObj) {
        const y = String(dateObj.y).padStart(4, '2000');
        const m = String(dateObj.m).padStart(2, '0');
        const d = String(dateObj.d).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    } catch (e) {}
  }
  const s = String(val).trim();
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    let year = dmyMatch[3];
    if (year.length === 2) year = '20' + year;
    return `${year}-${month}-${day}`;
  }
  return s;
}

/**
 * Parses a raw Excel row object into a normalized Candidate object
 */
function parseCandidateRow(row, fileName, sheetName, rowIndex) {
  const normMap = {};
  for (const [k, v] of Object.entries(row)) {
    normMap[cleanKey(k)] = v !== undefined && v !== null ? String(v).trim() : '';
  }

  // Find candidate name
  const nameKeys = ['candidatename', 'name', 'candidate', 'fullname', 'resourcename', 'resourcenamecandidate', 'candidatefullname'];
  let candidateName = '';
  for (const k of nameKeys) {
    if (normMap[k]) {
      candidateName = normMap[k];
      break;
    }
  }

  // If no candidate name, ignore row (or it might be an empty row / requirement row)
  if (!candidateName || candidateName === '—' || candidateName.toLowerCase() === 'na' || candidateName.toLowerCase().includes('candidate not provided')) {
    return null;
  }

  // Find mobile
  const mobileKeys = ['mobile', 'phone', 'contact', 'contactnumber', 'mobilenumber', 'cell', 'cellnumber', 'phonecontact'];
  let mobile = '—';
  for (const k of mobileKeys) {
    if (normMap[k]) { mobile = normMap[k]; break; }
  }

  // Find email
  const emailKeys = ['email', 'emailid', 'mail', 'emailaddress', 'mailid'];
  let email = '—';
  for (const k of emailKeys) {
    if (normMap[k]) { email = normMap[k]; break; }
  }

  // Find skills
  const skillKeys = ['skills', 'keyskills', 'technicalskills', 'techstack', 'primaryskills', 'corecompetencies', 'technologies', 'skillset', 'profiledescription'];
  let skills = '';
  for (const k of skillKeys) {
    if (normMap[k]) { skills = normMap[k]; break; }
  }

  // Find experience
  const expKeys = ['totalexperience', 'experience', 'exp', 'totalexp', 'yoe', 'relevantexp', 'relevantexperience', 'workexperience'];
  let totalExperience = '';
  for (const k of expKeys) {
    if (normMap[k]) { totalExperience = normMap[k]; break; }
  }

  // Find Current CTC
  const ctcKeys = ['currentctc', 'ctc', 'fixedctc', 'currentcompensation', 'currentsalary', 'fixed', 'presentctc', 'salary'];
  let currentCtc = '—';
  for (const k of ctcKeys) {
    if (normMap[k]) { currentCtc = normMap[k]; break; }
  }

  // Find Expected CTC
  const ectcKeys = ['expectedctc', 'ectc', 'expectedcompensation', 'expectedsalary', 'expected'];
  let expectedCtc = '—';
  for (const k of ectcKeys) {
    if (normMap[k]) { expectedCtc = normMap[k]; break; }
  }

  // Find Notice Period
  const npKeys = ['noticeperiod', 'notice', 'servingnotice', 'np', 'availability', 'noticeperiodindays', 'servingnoticeperiod'];
  let noticePeriod = 'Immediate';
  let isServingNotice = false;
  for (const k of npKeys) {
    if (normMap[k]) {
      noticePeriod = normMap[k];
      if (noticePeriod.toLowerCase().includes('serving') || noticePeriod.toLowerCase().includes('yes')) {
        isServingNotice = true;
      }
      break;
    }
  }

  // Find Requirement
  const reqKeys = ['requirement', 'requirementname', 'jobtitle', 'role', 'position', 'profile', 'reqtitle', 'jobrole', 'reqid'];
  let requirementName = 'General Pool';
  for (const k of reqKeys) {
    if (normMap[k]) { requirementName = normMap[k]; break; }
  }

  // Find Client
  const clientKeys = ['client', 'clientname', 'company', 'customer', 'account', 'clientaccount'];
  let clientName = '—';
  for (const k of clientKeys) {
    if (normMap[k]) { clientName = normMap[k]; break; }
  }

  // Find Resume link
  const resumeKeys = ['resumelink', 'resume', 'cvlink', 'cv', 'drivelink', 'profilelink', 'link', 'resumepath'];
  let resumeLink = '';
  for (const k of resumeKeys) {
    if (normMap[k]) { resumeLink = normMap[k]; break; }
  }

  // Find Status
  const statusKeys = ['status', 'candidatestatus', 'profilestatus', 'decision', 'stage'];
  let status = 'Sourced';
  for (const k of statusKeys) {
    if (normMap[k]) { status = normMap[k]; break; }
  }

  // Find Remarks
  const remarkKeys = ['remarks', 'comments', 'notes', 'feedback', 'summary', 'evaluation', 'recruiterremarks'];
  let remarks = '';
  for (const k of remarkKeys) {
    if (normMap[k]) { remarks = normMap[k]; break; }
  }

  // Find Recruiter / Submitter
  const hrKeys = ['submittedby', 'hr', 'recruiter', 'sourcer', 'owner', 'assignedto', 'createdby', 'hrname'];
  let submittedBy = 'Excel Import';
  for (const k of hrKeys) {
    if (normMap[k]) { submittedBy = normMap[k]; break; }
  }

  // Find Date
  const dateKeys = ['date', 'submitteddate', 'createddate', 'timestamp', 'createdat'];
  let dateVal = new Date().toISOString().split('T')[0];
  for (const k of dateKeys) {
    if (normMap[k]) { dateVal = formatExcelDate(normMap[k]); break; }
  }

  const uniqueId = `excel_${cleanKey(fileName)}_${cleanKey(sheetName)}_${rowIndex}_${cleanKey(candidateName).slice(0, 10)}`;

  return {
    id: uniqueId,
    date: dateVal,
    candidate_name: candidateName,
    name: candidateName,
    mobile: mobile,
    email: email,
    skills: skills,
    total_experience: totalExperience,
    experience: totalExperience,
    current_ctc: currentCtc,
    expected_ctc: expectedCtc,
    ctc: currentCtc,
    source: 'Excel Sheet',
    vendor_name: normMap['vendorname'] || normMap['vendor'] || 'NA',
    is_serving_notice: isServingNotice,
    notice_period: noticePeriod,
    requirement_name: requirementName,
    client_name: clientName,
    resume_link: resumeLink,
    recording_link: normMap['recordinglink'] || '',
    recording_type: normMap['recordingtype'] || '',
    remarks: remarks || (skills ? `Skills: ${skills}` : `Imported from Excel: ${fileName}`),
    submitted_by: submittedBy,
    submitted_at: new Date().toISOString(),
    status: status,
    not_submitted_reason: normMap['notsubmittedreason'] || '',
    source_origin: 'excel',
    source_file: fileName,
    source_sheet: sheetName,
    source_label: `Excel Sheet (${fileName} • ${sheetName})`
  };
}

/**
 * Parses an Excel Workbook object (from file or buffer) into candidates and requirements
 */
function parseWorkbook(workbook, fileName = 'Workbook.xlsx') {
  const candidates = [];
  const requirements = [];
  const seenCandKeys = new Set();

  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) return;

    // Convert sheet to JSON array
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
    if (!Array.isArray(rawRows) || rawRows.length === 0) return;

    rawRows.forEach((row, idx) => {
      // 1. Try parsing as Candidate
      const cand = parseCandidateRow(row, fileName, sheetName, idx + 2);
      if (cand) {
        const dedupeKey = `${cleanKey(cand.candidate_name)}:::${cleanKey(cand.requirement_name || cand.email || cand.mobile)}`;
        if (!seenCandKeys.has(dedupeKey)) {
          seenCandKeys.add(dedupeKey);
          candidates.push(cand);
        }
      }

      // 2. Check if row represents a Requirement
      const normMap = {};
      for (const [k, v] of Object.entries(row)) {
        normMap[cleanKey(k)] = v !== undefined && v !== null ? String(v).trim() : '';
      }
      const reqName = normMap['requirement'] || normMap['requirementname'] || normMap['jobtitle'] || normMap['position'];
      if (reqName && reqName.length > 3 && !reqName.toLowerCase().includes('candidate')) {
        requirements.push({
          date: formatExcelDate(normMap['date'] || normMap['createddate']),
          req_id: normMap['reqid'] || `REQ-EXL-${idx + 1}`,
          requirement: reqName,
          client_name: normMap['client'] || normMap['clientname'] || normMap['company'] || '—',
          priority: normMap['priority'] || 'Medium',
          assignee: normMap['assignee'] || normMap['hr'] || normMap['recruiter'] || 'Unassigned',
          status: normMap['status'] || 'Open – Assigned',
          jd_link: normMap['jdlink'] || normMap['jd'] || normMap['link'] || '',
          source: 'Excel Sheet',
          source_file: fileName,
          source_sheet: sheetName
        });
      }
    });
  });

  return { candidates, requirements };
}

/**
 * Scans `excel_data/` directory and parses all Excel workbooks
 */
function fetchExcelCandidates() {
  ensureExcelDir();
  const allCandidates = [];
  const seenKeys = new Set();

  try {
    const files = fs.readdirSync(EXCEL_DATA_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') && !f.startsWith('~$');
    });

    files.forEach(file => {
      const fullPath = path.join(EXCEL_DATA_DIR, file);
      try {
        const fileBuffer = fs.readFileSync(fullPath);
        const wb = XLSX.read(fileBuffer, { type: 'buffer' });
        const { candidates } = parseWorkbook(wb, file);
        candidates.forEach(c => {
          const k = `${cleanKey(c.candidate_name)}:::${cleanKey(c.requirement_name || c.email)}`;
          if (!seenKeys.has(k)) {
            seenKeys.add(k);
            allCandidates.push(c);
          }
        });
      } catch (fileErr) {
        console.warn(`[Excel Connector] Error parsing ${file}:`, fileErr.message);
      }
    });
  } catch (err) {
    console.warn('[Excel Connector] Error reading excel_data dir:', err.message);
  }

  return allCandidates;
}

/**
 * Parses uploaded Excel Buffer and returns parsed entities
 */
function parseExcelBuffer(buffer, originalFileName = 'Uploaded_Candidates.xlsx') {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return parseWorkbook(wb, originalFileName);
}

/**
 * Saves an uploaded Excel buffer into the `excel_data/` directory and returns parsed records
 */
function saveUploadedExcelFile(buffer, originalFileName = 'Candidates_Upload.xlsx') {
  ensureExcelDir();
  const safeName = path.basename(originalFileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const targetPath = path.join(EXCEL_DATA_DIR, safeName);
  
  fs.writeFileSync(targetPath, buffer);
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const result = parseWorkbook(wb, safeName);

  return {
    ...result,
    savedPath: targetPath,
    fileName: safeName
  };
}

/**
 * Returns metadata summary of all Excel files currently connected in `excel_data/`
 */
function getExcelFilesStatus() {
  ensureExcelDir();
  const filesList = [];
  let totalCandidatesCount = 0;

  try {
    const files = fs.readdirSync(EXCEL_DATA_DIR).filter(f => {
      const ext = path.extname(f).toLowerCase();
      return (ext === '.xlsx' || ext === '.xls' || ext === '.xlsm') && !f.startsWith('~$');
    });

    files.forEach(file => {
      const fullPath = path.join(EXCEL_DATA_DIR, file);
      try {
        const stat = fs.statSync(fullPath);
        const fileBuffer = fs.readFileSync(fullPath);
        const wb = XLSX.read(fileBuffer, { type: 'buffer' });
        const { candidates } = parseWorkbook(wb, file);
        totalCandidatesCount += candidates.length;

        filesList.push({
          file_name: file,
          size_kb: Math.round(stat.size / 1024),
          sheets: wb.SheetNames,
          candidates_found: candidates.length,
          last_modified: stat.mtime.toISOString()
        });
      } catch (e) {
        filesList.push({
          file_name: file,
          error: e.message
        });
      }
    });
  } catch (err) {}

  return {
    directory: EXCEL_DATA_DIR,
    files_count: filesList.length,
    total_candidates: totalCandidatesCount,
    files: filesList
  };
}

/**
 * Exports an array of candidates into a downloadable Excel (.xlsx) buffer
 */
function exportCandidatesToExcel(candidatesList = []) {
  const wb = XLSX.utils.book_new();

  const exportRows = (candidatesList || []).map((c, idx) => ({
    'S.No': idx + 1,
    'Date': c.date || '',
    'Candidate Name': c.candidate_name || c.name || '',
    'Requirement': c.requirement_name || '',
    'Skills': c.skills || '',
    'Experience': c.total_experience || c.experience || '',
    'Mobile': c.mobile || '',
    'Email': c.email || '',
    'Current CTC': c.current_ctc || '',
    'Expected CTC': c.expected_ctc || '',
    'Notice Period': c.notice_period || '',
    'Status': c.status || 'Submitted',
    'Submitted By': c.submitted_by || '',
    'Client': c.client_name || '',
    'Resume Link': c.resume_link || '',
    'Data Source': c.source_label || c.source || 'Steady Rabbit Console'
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);

  // Column width hints
  ws['!cols'] = [
    { wch: 6 },  // S.No
    { wch: 12 }, // Date
    { wch: 22 }, // Candidate Name
    { wch: 28 }, // Requirement
    { wch: 32 }, // Skills
    { wch: 12 }, // Experience
    { wch: 15 }, // Mobile
    { wch: 24 }, // Email
    { wch: 12 }, // Current CTC
    { wch: 12 }, // Expected CTC
    { wch: 14 }, // Notice Period
    { wch: 14 }, // Status
    { wch: 16 }, // Submitted By
    { wch: 18 }, // Client
    { wch: 30 }, // Resume Link
    { wch: 24 }  // Source
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Creates a starter sample Excel file with realistic recruiter candidates if the directory is empty
 */
function createSampleExcelIfEmpty() {
  ensureExcelDir();
  const samplePath = path.join(EXCEL_DATA_DIR, 'SteadyRabbit_Candidates_Master.xlsx');
  if (fs.existsSync(samplePath)) return;

  const sampleCandidates = [
    {
      'Date': '2026-11-05',
      'Candidate Name': 'Aarav Sharma',
      'Requirement': 'Sr. ServiceNow ITOM developer',
      'Skills': 'ServiceNow, ITOM, Discovery, Service Mapping, Event Management, JavaScript',
      'Experience': '6.5 Years',
      'Mobile': '+91 98450 12345',
      'Email': 'aarav.sharma.dev@gmail.com',
      'Current CTC': '18 LPA',
      'Expected CTC': '24 LPA',
      'Notice Period': '15 Days (Serving Notice)',
      'Status': 'Submitted',
      'Client': 'Cognizant',
      'Submitted By': 'Diksha',
      'Resume Link': 'https://drive.google.com/file/d/sample_aarav_sharma/view',
      'Remarks': 'Strong ITOM discovery & pattern designer experience. Ready to join immediately.'
    },
    {
      'Date': '2026-11-06',
      'Candidate Name': 'Priya Venkataraman',
      'Requirement': 'Sr. Java Backend Developer (Microservices & Spring Boot)',
      'Skills': 'Java 17, Spring Boot, Microservices, Kafka, Docker, Kubernetes, AWS, PostgreSQL',
      'Experience': '8 Years',
      'Mobile': '+91 97123 45678',
      'Email': 'priya.v.tech@outlook.com',
      'Current CTC': '22 LPA',
      'Expected CTC': '28 LPA',
      'Notice Period': '30 Days',
      'Status': 'Submitted',
      'Client': 'Persistent Systems',
      'Submitted By': 'Likitha',
      'Resume Link': 'https://drive.google.com/file/d/sample_priya_v/view',
      'Remarks': 'Excellent system design & high-throughput streaming with Kafka.'
    },
    {
      'Date': '2026-11-07',
      'Candidate Name': 'Rohan Kulkarni',
      'Requirement': 'Fullstack Python / React Developer',
      'Skills': 'Python, FastAPI, Django, React, TypeScript, Redux, PostgreSQL, REST APIs',
      'Experience': '5 Years',
      'Mobile': '+91 98234 56789',
      'Email': 'rohan.kulkarni@gmail.com',
      'Current CTC': '14 LPA',
      'Expected CTC': '19 LPA',
      'Notice Period': 'Immediate',
      'Status': 'Submitted',
      'Client': 'Wipro',
      'Submitted By': 'Ayushi',
      'Resume Link': 'https://drive.google.com/file/d/sample_rohan_k/view',
      'Remarks': 'Immediate joiner. Full stack proficiency with React UI and Python API services.'
    },
    {
      'Date': '2026-11-08',
      'Candidate Name': 'Sneha Deshmukh',
      'Requirement': 'Data Engineer (Snowflake & PySpark)',
      'Skills': 'Snowflake, PySpark, Databricks, SQL, Airflow, AWS S3, ETL Pipelines',
      'Experience': '7 Years',
      'Mobile': '+91 99345 67890',
      'Email': 'sneha.deshmukh.data@gmail.com',
      'Current CTC': '20 LPA',
      'Expected CTC': '26 LPA',
      'Notice Period': 'Serving Notice (LWD: Nov 28)',
      'Status': 'Submitted',
      'Client': 'Accenture',
      'Submitted By': 'Richa',
      'Resume Link': 'https://drive.google.com/file/d/sample_sneha_d/view',
      'Remarks': 'Snowflake core certified data engineer. Strong SQL optimization.'
    },
    {
      'Date': '2026-11-09',
      'Candidate Name': 'Mohammed Tariq',
      'Requirement': 'ServiceNow ITSM Functional Consultant',
      'Skills': 'ServiceNow ITSM, Incident, Problem, Change, Service Catalog, ITIL v4, Workflows',
      'Experience': '6 Years',
      'Mobile': '+91 98877 66554',
      'Email': 'm.tariq.servicenow@yahoo.com',
      'Current CTC': '16 LPA',
      'Expected CTC': '21 LPA',
      'Notice Period': '30 Days',
      'Status': 'Submitted',
      'Client': 'Infosys',
      'Submitted By': 'Afsheen',
      'Resume Link': 'https://drive.google.com/file/d/sample_m_tariq/view',
      'Remarks': 'ITSM functional specialist with client consulting background.'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(sampleCandidates);
  ws['!cols'] = [
    { wch: 12 }, { wch: 22 }, { wch: 30 }, { wch: 40 },
    { wch: 12 }, { wch: 16 }, { wch: 26 }, { wch: 12 },
    { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 18 },
    { wch: 14 }, { wch: 32 }, { wch: 35 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.writeFile(wb, samplePath);
  console.log('[Excel Connector] Created starter sample Excel sheet at:', samplePath);
}

module.exports = {
  EXCEL_DATA_DIR,
  ensureExcelDir,
  fetchExcelCandidates,
  parseWorkbook,
  parseExcelBuffer,
  saveUploadedExcelFile,
  getExcelFilesStatus,
  exportCandidatesToExcel,
  createSampleExcelIfEmpty
};
