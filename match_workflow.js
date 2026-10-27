/**
 * Match Candidates Workflow
 * Direct JavaScript conversion of the n8n vector matching pipeline.
 *
 * Pipeline Steps:
 * 1. Accepts a Job Description text, requirement title, or Google Drive link.
 * 2. Generates a 768-dimensional text embedding via Gemini API (gemini-embedding-001).
 * 3. Queries the Supabase vector database RPC (match_candidates) to find the top matching candidates.
 * 4. Returns ranked candidate profiles with skills evidence, experience, and contact details.
 */

const fs = require('fs');
const path = require('path');

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

/**
 * Extracts Google Drive / Docs file ID from a link
 */
function extractDriveFileId(link) {
  if (!link || typeof link !== 'string') return null;
  const match = link.match(/[-\w]{25,}/);
  return match ? match[0] : null;
}

/**
 * Main workflow function to match candidates against a requirement or JD
 * @param {Object} params
 * @param {string} [params.jd_text] - Plain text job description or requirement description
 * @param {string} [params.jd_link] - Google Drive or Google Docs URL
 * @param {string} [params.requirement_name] - Requirement title (e.g., 'ServiceNow ITSM Functional')
 * @param {number} [params.limit=5] - Number of candidate matches to return
 * @returns {Promise<Object>} Formatted result with candidate matches
 */
async function matchCandidatesWorkflow({ jd_text = '', jd_link = '', requirement_name = '', limit = 5 } = {}) {
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
      } catch (err) {
        // Fallback to requirement name if doc cannot be exported without auth
      }
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

  // 2. Step 1: Generate 768d Gemini Embedding
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

  if (!geminiResp.ok) {
    const errBody = await geminiResp.text();
    throw new Error(`Gemini Embedding API Error (${geminiResp.status}): ${errBody}`);
  }

  const geminiData = await geminiResp.json();
  const queryEmbedding = geminiData.embedding?.values;
  if (!queryEmbedding || queryEmbedding.length !== 768) {
    throw new Error('Gemini API did not return a valid 768-dimensional embedding.');
  }

  // 3. Step 2: Query Supabase RPC match_candidates vector similarity
  const supaPayload = {
    query_embedding: queryEmbedding,
    match_count: limit || 5
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

  if (!supaResp.ok) {
    const supaErr = await supaResp.text();
    throw new Error(`Supabase RPC Error (${supaResp.status}): ${supaErr}`);
  }

  const matches = await supaResp.json();

  return {
    success: true,
    source: 'vector_supabase_ai',
    matches_count: matches.length,
    matches: matches,
    jd_preview: textToEmbed.substring(0, 180) + (textToEmbed.length > 180 ? '...' : '')
  };
}

module.exports = {
  matchCandidatesWorkflow,
  extractDriveFileId
};

// Direct CLI execution support
if (require.main === module) {
  const query = process.argv.slice(2).join(' ') || 'ServiceNow ITSM Developer Portal';
  console.log(`Running vector matching workflow for query: "${query}"...\n`);

  matchCandidatesWorkflow({ requirement_name: query, limit: 3 })
    .then(res => {
      console.log(`Successfully found ${res.matches_count} matching candidate(s):\n`);
      res.matches.forEach((c, i) => {
        const similarityPct = Math.round((c.similarity || 0) * 100);
        console.log(`[#${i + 1}] ${c.candidate_name} — ${c.standardized_title || 'Candidate'} (${similarityPct}% Match)`);
        console.log(`     Experience: ${c.total_experience || '—'} yrs | Expected CTC: ${c.expected_ctc || '—'} | Notice: ${c.notice_period || '—'}`);
        console.log(`     Resume: ${c.resume_link || 'N/A'}`);
        if (c.skills_with_evidence && c.skills_with_evidence.length > 0) {
          console.log(`     Skills: ${c.skills_with_evidence.map(s => s.skill).slice(0, 5).join(', ')}`);
        }
        console.log('');
      });
    })
    .catch(err => {
      console.error('Workflow failed:', err.message);
      process.exit(1);
    });
}
