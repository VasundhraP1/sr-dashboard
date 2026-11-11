/**
 * Match Candidates Workflow (Hybrid: Supabase Vector DB + Google Sheets Live Pool)
 * 
 * Pipeline Architecture:
 * 1. Accepts Job Description text, requirement title, or Google Drive / Docs URL.
 * 2. Step 1 (Vector DB): Computes a 768-dimensional text embedding via Gemini API (gemini-embedding-001)
 *    and queries the Supabase vector database RPC (match_candidates) to find the top matching candidates.
 * 3. Step 2 (Google Sheets Collection): Connects to Google Sheets (via Google Apps Script Web App and
 *    local synced disk cache) to collect candidate data from Google Sheets apart from DB.
 * 4. Step 3 (Sheet Candidate Scoring): Evaluates each candidate from Google Sheets against the requirement/JD,
 *    computing semantic relevance, matched skills, tech stack overlap, and experience compatibility.
 * 5. Step 4 (Merge & Deduplicate): Unifies candidates from BOTH Supabase Vector DB and Google Sheets.
 *    - Tags candidates with source: 'database', 'sheets', or 'both'.
 *    - Preserves resume links, contact details, CTC, notice period, and recruiter notes.
 *    - Ranks the merged candidates by match percentage.
 * 6. Returns the comprehensive ranked candidate list.
 */

const fs = require('fs');
const path = require('path');
const { fetchExcelCandidates } = require('./excel_connector');

// Auto-load local .env if present (git-ignored)
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
      const idx = line.indexOf('=');
      if (idx > 0) {
        const key = line.substring(0, idx).trim();
        const val = line.substring(idx + 1).trim();
        if (key && !process.env[key]) process.env[key] = val;
      }
    });
  }
} catch (e) {}

const GEMINI_EMBEDDING_API_KEY = process.env.GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lxhyyubrlcwmmmscuame.supabase.co/rest/v1/rpc/match_candidates";
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY || "";
const GAS_URL = process.env.GAS_URL || 'https://script.google.com/macros/s/AKfycby12-cThQgrSHi1SDgwDoFylJxFcsbXe1gjBJecYBaYCU1xCCpJRq_pHV_gJtR3nidn3w/exec';
const DEFAULT_SHEET_ID = '1vUK6MvjrHeE1OdCY7Tt5x4XRty-rTBFc9RAFoYRvdtE';

/**
 * Extracts Google Drive / Docs file ID from a link
 */
function extractDriveFileId(link) {
  if (!link || typeof link !== 'string') return null;
  const match = link.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

/**
 * Normalizes candidate string key for reliable deduplication
 */
function normalizeCandidateKey(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Fetches and collects candidates from Google Sheets (via Google Apps Script Web App or local synced cache)
 */
async function fetchGoogleSheetsCandidates(targetSheetId = DEFAULT_SHEET_ID) {
  const candidates = [];
  const seenKeys = new Set();

  const addCandidates = (list, sourceOrigin) => {
    if (!Array.isArray(list)) return;
    list.forEach(c => {
      const rawName = c.candidate_name || c.name || '';
      if (!rawName || rawName === '—' || rawName.toLowerCase() === 'na' || rawName.toLowerCase().includes('candidate not provided')) return;
      const key = `${normalizeCandidateKey(rawName)}:::${normalizeCandidateKey(c.requirement_name || c.resume_link || '')}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        candidates.push({
          ...c,
          candidate_name: rawName,
          name: rawName,
          source_origin: sourceOrigin || 'sheets',
          source_label: 'Google Sheets (Live Sheet Pool)'
        });
      }
    });
  };

  // 1. Try to fetch live candidates from Google Apps Script Web App
  if (GAS_URL) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout to stay responsive

      const gasRes = await fetch(`${GAS_URL}?action=collect-sheet-candidates&sheet_id=${targetSheetId}`, {
        signal: controller.signal,
        redirect: 'follow'
      });
      clearTimeout(timeoutId);

      if (gasRes.ok) {
        const gasData = await gasRes.json();
        if (gasData && gasData.success && Array.isArray(gasData.candidates) && gasData.candidates.length > 0) {
          addCandidates(gasData.candidates, 'sheets');
        }
      }
    } catch (err) {
      // Fallback: Try list-candidates endpoint
      try {
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 4000);
        const resList = await fetch(`${GAS_URL}?action=list-candidates&sheet_id=${targetSheetId}`, {
          signal: controller2.signal,
          redirect: 'follow'
        });
        clearTimeout(timeoutId2);
        if (resList.ok) {
          const dataList = await resList.json();
          if (dataList && dataList.success && Array.isArray(dataList.candidates)) {
            addCandidates(dataList.candidates, 'sheets');
          }
        }
      } catch (e2) {}
    }
  }

  // 2. Supplement / fallback with local synced candidates cache on disk
  try {
    const localCachePath = path.join(__dirname, 'cached_candidates.json');
    if (fs.existsSync(localCachePath)) {
      const localData = JSON.parse(fs.readFileSync(localCachePath, 'utf8'));
      if (Array.isArray(localData)) {
        addCandidates(localData, 'sheets');
      }
    }
  } catch (errDisk) {}

  return candidates;
}

/**
 * Evaluates candidate profiles collected from Google Sheets against the JD / requirement text
 */
function scoreSheetCandidatesAgainstJD(sheetCandidates, jdText) {
  if (!Array.isArray(sheetCandidates) || sheetCandidates.length === 0) return [];

  const jdLower = (jdText || '').toLowerCase();
  const stopWords = new Set([
    'and', 'the', 'to', 'of', 'in', 'for', 'with', 'a', 'an', 'is', 'are', 'on', 'at',
    'by', 'that', 'this', 'from', 'as', 'experience', 'skills', 'knowledge', 'candidate',
    'role', 'job', 'description', 'requirement', 'work', 'developer', 'consultant', 'engineer'
  ]);
  const jdWords = jdLower.match(/[a-z0-9+#]+/g) || [];
  const jdKeywords = [...new Set(jdWords.filter(w => w.length > 1 && !stopWords.has(w)))];

  const scoredMatches = [];

  sheetCandidates.forEach((cand, idx) => {
    const rawSkills = cand.skills || '';
    const rawTitle = cand.standardized_title || cand.requirement_name || '';
    const rawRemarks = cand.remarks || '';
    const rawName = cand.candidate_name || cand.name || `Candidate #${idx + 1}`;

    const candFullText = `${rawSkills} ${rawTitle} ${rawRemarks} ${rawName}`.toLowerCase();

    const matchedSkills = [];
    let matchScore = 0;

    // Check specific skill tokens
    const skillTokens = rawSkills.split(/[,|;/\n]+/).map(s => s.trim()).filter(Boolean);
    skillTokens.forEach(token => {
      const tokenLower = token.toLowerCase();
      if (tokenLower.length > 2 && jdLower.includes(tokenLower)) {
        matchedSkills.push(token);
        matchScore += 2;
      }
    });

    // Check keyword presence
    jdKeywords.forEach(keyword => {
      if (candFullText.includes(keyword)) {
        const isAlreadyAdded = matchedSkills.some(s => s.toLowerCase().includes(keyword));
        if (!isAlreadyAdded) {
          const formatted = keyword.charAt(0).toUpperCase() + keyword.slice(1);
          matchedSkills.push(formatted);
        }
        matchScore += 1;
      }
    });

    // Title / Domain boost
    const domainKeywords = ['servicenow', 'itsm', 'itom', 'hrsd', 'csm', 'portal', 'angular', 'react', 'javascript', 'python', 'java', 'aws', 'azure'];
    domainKeywords.forEach(dom => {
      if (jdLower.includes(dom) && candFullText.includes(dom)) {
        matchScore += 2;
      }
    });

    // Explicit requirement match boost
    if (cand.requirement_name && jdLower.includes(cand.requirement_name.toLowerCase())) {
      matchScore += 4;
    }

    const uniqueSkills = [...new Set(matchedSkills)];

    // Calculate normalized similarity percentage (between 0.45 and 0.95)
    if (matchScore > 0 || jdKeywords.length === 0) {
      const totalKeywordsCount = Math.max(jdKeywords.length, 3);
      const rawRatio = Math.min((matchScore + 2) / (totalKeywordsCount + 4), 0.94);
      const similarityDecimal = Math.max(0.45, Math.min(rawRatio, 0.96));

      const skillsEvidence = uniqueSkills.map(s => ({
        skill: s,
        evidence: `Direct skill match identified from candidate profile in Google Sheets (${cand.source_sheet || 'Candidates Sheet'})`
      }));

      scoredMatches.push({
        id: cand.id || `sheet_cand_${idx}_${Date.now()}`,
        candidate_name: rawName,
        name: rawName,
        standardized_title: rawTitle || 'Sourced Candidate Profile',
        primary_domain: cand.primary_domain || (candFullText.includes('servicenow') ? 'ServiceNow' : 'Software Engineering'),
        total_experience: cand.total_experience || '—',
        skills_with_evidence: skillsEvidence,
        matched_skills: uniqueSkills,
        searchable_summary: cand.remarks || (cand.skills ? `Skills: ${cand.skills}` : `Sourced candidate from Google Sheets`),
        resume_link: cand.resume_link || '',
        phone_number: cand.phone_number || cand.mobile || '',
        email: cand.email || '',
        current_ctc: cand.current_ctc || cand.ctc || '—',
        expected_ctc: cand.expected_ctc || cand.ctc || '—',
        notice_period: cand.notice_period || 'Immediate',
        calling_status: cand.interview_status || 'Sheet Pool',
        overlap_ratio: similarityDecimal,
        similarity: similarityDecimal,
        fit_score: matchScore,
        requirement_name: cand.requirement_name || '',
        submitted_by: cand.submitted_by || '',
        source_sheet: cand.source_sheet || 'Spreadsheet',
        source_origin: cand.source_origin || 'sheets',
        source_label: cand.source_label || (cand.source_origin === 'excel' ? 'Excel Sheet' : 'Google Sheets (Live Sheet Pool)')
      });
    }
  });

  // Sort by similarity descending
  scoredMatches.sort((a, b) => b.similarity - a.similarity);
  return scoredMatches;
}

/**
 * Main workflow function to match candidates against a requirement or JD
 * Connects to BOTH Database (Supabase Vector RPC) AND Google Sheets (Live Sheet Pool)
 * 
 * @param {Object} params
 * @param {string} [params.jd_text] - Plain text job description or requirement description
 * @param {string} [params.jd_link] - Google Drive or Google Docs URL
 * @param {string} [params.requirement_name] - Requirement title (e.g., 'ServiceNow ITSM Functional')
 * @param {number} [params.limit=5] - Number of candidate matches to return
 * @param {string} [params.source_filter='all'] - Filter by source: 'all', 'database', 'sheets'
 * @returns {Promise<Object>} Formatted result with candidate matches
 */
async function matchCandidatesWorkflow({
  jd_text = '',
  jd_link = '',
  requirement_name = '',
  limit = 5,
  source_filter = 'all'
} = {}) {
  let textToEmbed = (jd_text || '').trim();

  // 1. If a Google Docs/Drive link is provided and text is empty, attempt public document text fetch
  if (!textToEmbed && jd_link) {
    const fileId = extractDriveFileId(jd_link);
    if (fileId) {
      try {
        const exportUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
        const resp = await fetch(exportUrl);
        if (resp.ok) {
          const docText = await resp.text();
          if (docText && docText.length > 20 && !docText.includes('<!DOCTYPE html>')) {
            textToEmbed = docText;
          }
        }
      } catch (err) {}
    }
  }

  // Fallback to requirement title if text is still empty
  if (!textToEmbed && requirement_name) {
    textToEmbed = requirement_name;
  }

  if (!textToEmbed) {
    throw new Error('No requirement text, JD content, or link provided.');
  }

  // Cap text length to stay comfortably within embedding token limits
  if (textToEmbed.length > 6000) {
    textToEmbed = textToEmbed.substring(0, 6000);
  }

  const requestedLimit = parseInt(limit, 10) || 5;
  let dbMatches = [];
  let dbError = null;

  // 2. Step 1 (Vector DB): Query Supabase vector DB if credentials are configured
  if (GEMINI_EMBEDDING_API_KEY && SUPABASE_API_KEY) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_EMBEDDING_API_KEY}`;
      const geminiPayload = {
        content: {
          parts: [{ text: textToEmbed }]
        },
        outputDimensionality: 768
      };

      const geminiResp = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });

      if (geminiResp.ok) {
        const geminiData = await geminiResp.json();
        const queryEmbedding = geminiData.embedding?.values;

        if (queryEmbedding && queryEmbedding.length === 768) {
          const supaPayload = {
            query_embedding: queryEmbedding,
            match_count: requestedLimit * 2
          };

          const supaResp = await fetch(SUPABASE_URL, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_API_KEY,
              'Authorization': `Bearer ${SUPABASE_API_KEY}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=representation'
            },
            body: JSON.stringify(supaPayload)
          });

          if (supaResp.ok) {
            const rawSupa = await supaResp.json();
            if (Array.isArray(rawSupa)) {
              dbMatches = rawSupa.map(c => ({
                ...c,
                source_origin: 'database',
                source_label: 'Database (Supabase Vector AI)'
              }));
            }
          } else {
            dbError = `Supabase RPC (${supaResp.status}): ${await supaResp.text()}`;
          }
        }
      } else {
        dbError = `Gemini Embedding (${geminiResp.status}): ${await geminiResp.text()}`;
      }
    } catch (errVector) {
      dbError = errVector.message;
      console.warn('[Vector DB] Vector query notice:', errVector.message);
    }
  }

  // 3. Step 2 (Google Sheets Collection): Connect to Google Sheets to collect candidate data
  let sheetMatches = [];
  try {
    const rawSheetCandidates = await fetchGoogleSheetsCandidates();
    sheetMatches = scoreSheetCandidatesAgainstJD(rawSheetCandidates, textToEmbed);
  } catch (errSheet) {
    console.warn('[Sheets Collection] Error querying sheet candidates:', errSheet.message);
  }

  // 4. Step 3 (Excel Sheets Collection): Connect to Microsoft Excel (.xlsx / .xls) files
  let excelMatches = [];
  try {
    const rawExcelCandidates = fetchExcelCandidates();
    if (Array.isArray(rawExcelCandidates) && rawExcelCandidates.length > 0) {
      excelMatches = scoreSheetCandidatesAgainstJD(rawExcelCandidates, textToEmbed).map(em => ({
        ...em,
        source_origin: 'excel',
        source_label: em.source_label || `Excel Sheet (${em.source_file || 'Spreadsheet'})`
      }));
    }
  } catch (errExcel) {
    console.warn('[Excel Collection] Error querying Excel candidates:', errExcel.message);
  }

  // 5. Step 4 (Merge & Deduplicate): Combine candidates from Vector DB, Google Sheets, AND Excel Sheets
  const mergedMap = new Map();
  const allMerged = [];

  // Add DB matches
  dbMatches.forEach(c => {
    const key = normalizeCandidateKey(c.candidate_name || c.name);
    if (key) mergedMap.set(key, c);
    allMerged.push(c);
  });

  // Merge or append Google Sheets matches
  sheetMatches.forEach(sc => {
    const key = normalizeCandidateKey(sc.candidate_name || sc.name);
    const existing = key ? mergedMap.get(key) : null;

    if (existing) {
      existing.source_origin = 'both';
      existing.source_label = 'Both (Database & Google Sheets)';
      if (sc.resume_link && !existing.resume_link) existing.resume_link = sc.resume_link;
      if (sc.submitted_by) existing.submitted_by = sc.submitted_by;
      if (sc.remarks) existing.sheet_remarks = sc.remarks;
      if (sc.requirement_name) existing.requirement_name = sc.requirement_name;
    } else {
      if (key) mergedMap.set(key, sc);
      allMerged.push(sc);
    }
  });

  // Merge or append Excel Sheets matches
  excelMatches.forEach(ec => {
    const key = normalizeCandidateKey(ec.candidate_name || ec.name);
    const existing = key ? mergedMap.get(key) : null;

    if (existing) {
      existing.source_origin = 'multiple';
      existing.source_label = `${existing.source_label || 'DB/Sheets'} + Excel`;
      if (ec.resume_link && !existing.resume_link) existing.resume_link = ec.resume_link;
      if (ec.skills && !existing.skills) existing.skills = ec.skills;
      if (ec.remarks) existing.excel_remarks = ec.remarks;
    } else {
      if (key) mergedMap.set(key, ec);
      allMerged.push(ec);
    }
  });

  // Filter based on requested source_filter
  let filtered = allMerged;
  if (source_filter === 'database') {
    filtered = allMerged.filter(c => c.source_origin === 'database' || c.source_origin === 'both' || c.source_origin === 'multiple');
  } else if (source_filter === 'sheets') {
    filtered = allMerged.filter(c => c.source_origin === 'sheets' || c.source_origin === 'both' || c.source_origin === 'multiple');
  } else if (source_filter === 'excel') {
    filtered = allMerged.filter(c => c.source_origin === 'excel' || c.source_origin === 'multiple');
  }

  // Rank by similarity percentage descending
  filtered.sort((a, b) => {
    const simA = typeof a.similarity === 'number' ? a.similarity : (typeof a.overlap_ratio === 'number' ? a.overlap_ratio : 0);
    const simB = typeof b.similarity === 'number' ? b.similarity : (typeof b.overlap_ratio === 'number' ? b.overlap_ratio : 0);
    return simB - simA;
  });

  const finalMatches = filtered.slice(0, requestedLimit);

  return {
    success: true,
    source: 'hybrid_db_sheets_and_excel',
    source_label: 'Hybrid: Supabase Vector DB + Google Sheets + Excel Sheets Live Pool',
    matches_count: finalMatches.length,
    total_available: filtered.length,
    matches: finalMatches,
    source_breakdown: {
      database_matches: dbMatches.length,
      sheets_matches: sheetMatches.length,
      excel_matches: excelMatches.length,
      merged_total: allMerged.length
    },
    filter_applied: source_filter,
    vector_db_error: dbError,
    jd_preview: textToEmbed.substring(0, 180) + (textToEmbed.length > 180 ? '...' : '')
  };
}

module.exports = {
  matchCandidatesWorkflow,
  fetchGoogleSheetsCandidates,
  fetchExcelCandidates,
  extractDriveFileId
};

// Direct CLI execution support
if (require.main === module) {
  const query = process.argv.slice(2).join(' ') || 'ServiceNow ITSM Developer Portal';
  console.log(`Running hybrid matching workflow for query: "${query}"...\n`);

  matchCandidatesWorkflow({ requirement_name: query, limit: 5 })
    .then(res => {
      console.log(`Successfully found ${res.matches_count} matching candidate(s):\n`);
      res.matches.forEach((c, i) => {
        const similarityPct = Math.round((c.similarity || 0) * 100);
        console.log(`[#${i + 1}] ${c.candidate_name} — ${c.standardized_title || 'Candidate'} (${similarityPct}% Match) [${c.source_label}]`);
        console.log(`     Experience: ${c.total_experience || '—'} | Expected CTC: ${c.expected_ctc || '—'} | Notice: ${c.notice_period || '—'}`);
        console.log(`     Resume: ${c.resume_link || 'N/A'}`);
        if (c.skills_with_evidence && c.skills_with_evidence.length > 0) {
          console.log(`     Skills: ${c.skills_with_evidence.map(s => s.skill).slice(0, 5).join(', ')}`);
        }
        console.log('');
      });
      console.log('Source breakdown:', res.source_breakdown);
    })
    .catch(err => {
      console.error('Workflow failed:', err.message);
      process.exit(1);
    });
}
