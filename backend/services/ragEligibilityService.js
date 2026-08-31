/**
 * ragEligibilityService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * High-Precision Hybrid RAG (Retrieval-Augmented Generation) Engine
 * for GovSahayak Certificate Eligibility Verification.
 *
 * Architecture:
 *   - BM25 Keyword Search: Finds exact section/clause numbers, legal terms,
 *     thresholds ("15 years", "Section 4.2", "Non-Creamy Layer", "Tehsildar").
 *   - Dense Semantic Scoring: Finds semantically relevant clauses even when
 *     exact keywords differ (e.g. "studied in school" → Clause 4.2).
 *   - Hybrid Fusion: Combines both scores with configurable weights.
 *   - Hierarchical Indexing: Chunks indexed at Act→Chapter→Section→Clause level.
 *
 * Real-World Equivalent:
 *   In production, this would use vector embeddings (e.g., Google text-embedding-004
 *   or FAISS) + Elasticsearch BM25. Here we use pure JS scoring without external
 *   vector DB dependencies to keep the project deployable without GPU infrastructure.
 *
 * Zero-Hallucination Guarantee:
 *   The RAG engine only returns verbatim quotes from the policy corpus.
 *   The LLM agent (llmVerificationAgent.js) is instructed to cite ONLY these
 *   retrieved clauses and never generate rules not present in the corpus.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");

// ─── Policy corpus paths ───────────────────────────────────────────────────
const POLICY_DIR = path.join(__dirname, "../data/policies");
const POLICY_FILES = {
  domicile: path.join(POLICY_DIR, "domicile_policy.md"),
  income: path.join(POLICY_DIR, "income_policy.md"),
  birth: path.join(POLICY_DIR, "birth_policy.md"),
};

// ─── In-memory chunk index (populated on first use via loadPolicy) ─────────
const _policyIndex = {};

// ─────────────────────────────────────────────────────────────────────────────
// Chunk Parsing — Hierarchical Markdown Chunking
// Act → Chapter → Section → Clause → Paragraph
// ─────────────────────────────────────────────────────────────────────────────

/**
 * parsePolicyIntoChunks(markdownText, domain)
 * Splits policy markdown into hierarchical chunks for BM25 + semantic indexing.
 * Each chunk has: id, level (h1/h2/h3/blockquote), heading, content, fullText, domain.
 */
function parsePolicyIntoChunks(markdownText, domain) {
  const lines = markdownText.split("\n");
  const chunks = [];
  let currentH2 = "";
  let currentH3 = "";
  let currentContent = [];
  let chunkId = 0;

  function flushChunk(level, heading) {
    if (currentContent.length > 0) {
      const content = currentContent.join("\n").trim();
      if (content.length > 20) {
        chunks.push({
          id: `${domain}_${chunkId++}`,
          domain,
          level,
          heading: heading || "General",
          breadcrumb: `${currentH2 ? currentH2 + " > " : ""}${currentH3 || ""}`.trim(),
          content,
          fullText: `${heading ? heading + "\n" : ""}${content}`,
          // BM25 term frequency will be computed on demand
          keywords: extractKeywords(content)
        });
      }
      currentContent = [];
    }
  }

  for (const line of lines) {
    if (line.startsWith("## ")) {
      flushChunk("section", currentH3 || currentH2);
      currentH2 = line.replace(/^#+\s+/, "").trim();
      currentH3 = "";
    } else if (line.startsWith("### ")) {
      flushChunk("subsection", currentH3);
      currentH3 = line.replace(/^#+\s+/, "").trim();
    } else if (line.startsWith("#### ")) {
      flushChunk("clause", currentH3);
      currentH3 = line.replace(/^#+\s+/, "").trim();
    } else if (line.startsWith("> **Clause")) {
      // Blockquote clause — important legal clause, keep as own chunk
      flushChunk("clause_quote", currentH3);
      currentContent.push(line.replace(/^>\s*/, "").trim());
    } else {
      currentContent.push(line);
    }
  }
  flushChunk("tail", currentH3 || currentH2);

  return chunks;
}

/**
 * extractKeywords(text)
 * Extracts significant legal keywords from text for BM25 indexing.
 */
function extractKeywords(text) {
  if (!text) return [];
  // Remove markdown formatting
  const clean = text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[^a-zA-Z0-9\s\-\.]/g, " ")
    .toLowerCase();

  // Legal stopwords to ignore
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "be", "as",
    "at", "by", "for", "on", "that", "this", "with", "from", "all", "must",
    "may", "shall", "will", "not", "no", "but", "if", "it", "its", "been",
    "has", "have", "had", "was", "were", "any", "per", "as", "up", "do"
  ]);

  return clean.split(/\s+/)
    .filter(t => t.length >= 3 && !stopwords.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i); // deduplicate
}

// ─────────────────────────────────────────────────────────────────────────────
// Policy Loading and Caching
// ─────────────────────────────────────────────────────────────────────────────

/**
 * loadPolicy(domain)
 * Loads and chunks a policy file, caches result in memory.
 * @param {"domicile"|"income"|"birth"} domain
 */
function loadPolicy(domain) {
  if (_policyIndex[domain]) return _policyIndex[domain];

  const filePath = POLICY_FILES[domain];
  if (!fs.existsSync(filePath)) {
    console.error(`[RAG] Policy file not found: ${filePath}`);
    return [];
  }

  const text = fs.readFileSync(filePath, "utf-8");
  const chunks = parsePolicyIntoChunks(text, domain);
  _policyIndex[domain] = chunks;
  console.log(`[RAG] Loaded ${chunks.length} chunks for domain: ${domain}`);
  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// BM25 Scoring
// ─────────────────────────────────────────────────────────────────────────────

const BM25_K1 = 1.5;
const BM25_B = 0.75;

/**
 * bm25Score(queryTerms, chunk, avgDocLen, totalDocs, docFrequency)
 * Computes BM25 score for a chunk given query terms.
 */
function bm25Score(queryTerms, chunk, avgDocLen, totalDocs, docFrequency) {
  const docLen = chunk.keywords.length;
  let score = 0;

  for (const term of queryTerms) {
    const tf = chunk.keywords.filter(k => k === term || k.includes(term)).length;
    if (tf === 0) continue;

    const df = docFrequency[term] || 1;
    const idf = Math.log((totalDocs - df + 0.5) / (df + 0.5) + 1);
    const tfNorm = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * docLen / avgDocLen));

    score += idf * tfNorm;
  }
  return score;
}

// ─────────────────────────────────────────────────────────────────────────────
// Semantic Similarity (Lightweight JS implementation)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * semanticScore(queryTerms, chunk)
 * Lightweight semantic scoring using term overlap and legal synonym matching.
 * In production: Replace with vector embedding cosine similarity (Google/OpenAI embeddings).
 */
const LEGAL_SYNONYMS = {
  "residence": ["residency", "domicile", "resident", "living", "dwelling", "habitual abode"],
  "stay": ["residence", "residency", "domicile", "years", "duration"],
  "school": ["education", "ssс", "hsc", "board", "certificate", "standard", "class"],
  "income": ["salary", "wage", "earnings", "annual", "monthly", "financial"],
  "birth": ["born", "delivery", "hospital", "registration", "child", "newborn"],
  "parent": ["father", "mother", "guardian", "aadhaar", "age"],
  "late": ["delayed", "overdue", "beyond", "after", "past", "exceeded"],
  "exemption": ["exception", "relaxation", "special", "category", "clause"],
  "duplicate": ["existing", "already", "previous", "same", "repeat"],
  "mismatch": ["discrepancy", "different", "inconsistency", "conflict", "error"],
  "threshold": ["limit", "ceiling", "maximum", "minimum", "cap", "below"]
};

function expandWithSynonyms(terms) {
  const expanded = new Set(terms);
  for (const term of terms) {
    if (LEGAL_SYNONYMS[term]) {
      LEGAL_SYNONYMS[term].forEach(syn => expanded.add(syn));
    }
    // Also check if this term is a synonym of something
    for (const [key, syns] of Object.entries(LEGAL_SYNONYMS)) {
      if (syns.includes(term)) expanded.add(key);
    }
  }
  return Array.from(expanded);
}

function semanticScore(queryTerms, chunk) {
  const expandedQuery = expandWithSynonyms(queryTerms);
  const chunkText = chunk.fullText.toLowerCase();
  let matches = 0;

  for (const term of expandedQuery) {
    if (chunkText.includes(term)) matches++;
  }

  // Boost score if chunk heading directly mentions a key term
  const headingText = chunk.heading.toLowerCase();
  for (const term of expandedQuery) {
    if (headingText.includes(term)) matches += 2;
  }

  // Boost for clause-level chunks (more specific and authoritative)
  if (chunk.level === "clause_quote") matches += 3;

  return matches / Math.max(expandedQuery.length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main RAG Query Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * retrieveRelevantClauses(query, domain, options)
 * ─────────────────────────────────────────────────────────────────────────────
 * Main RAG retrieval function. Returns top-K most relevant policy clauses
 * using Hybrid BM25 + Semantic scoring.
 *
 * @param {string} query  - Natural language query (e.g. "15 year stay in Maharashtra")
 * @param {string} domain - "domicile" | "income" | "birth"
 * @param {Object} [options]
 *   @param {number} [options.topK=5]         - Number of chunks to retrieve
 *   @param {number} [options.bm25Weight=0.6] - Weight for BM25 score (0-1)
 *   @param {number} [options.semWeight=0.4]  - Weight for semantic score (0-1)
 *   @param {number} [options.minScore=0.05]  - Minimum score threshold
 *
 * @returns {Array<Object>} Top-K relevant chunks with scores:
 *   [{id, heading, content, breadcrumb, score, bm25Score, semanticScore, rank}]
 */
function retrieveRelevantClauses(query, domain, options = {}) {
  const {
    topK = 5,
    bm25Weight = 0.6,
    semWeight = 0.4,
    minScore = 0.05
  } = options;

  const chunks = loadPolicy(domain);
  if (!chunks.length) {
    console.warn(`[RAG] No chunks found for domain: ${domain}`);
    return [];
  }

  // Tokenize query
  const queryTerms = extractKeywords(query);
  if (!queryTerms.length) return [];

  // Precompute document frequency for BM25
  const docFrequency = {};
  for (const chunk of chunks) {
    const seen = new Set();
    for (const kw of chunk.keywords) {
      if (!seen.has(kw)) {
        docFrequency[kw] = (docFrequency[kw] || 0) + 1;
        seen.add(kw);
      }
    }
  }
  const avgDocLen = chunks.reduce((sum, c) => sum + c.keywords.length, 0) / chunks.length;

  // Score each chunk
  const scored = chunks.map(chunk => {
    const bm25 = bm25Score(queryTerms, chunk, avgDocLen, chunks.length, docFrequency);
    const semantic = semanticScore(queryTerms, chunk);
    const hybrid = (bm25Weight * bm25) + (semWeight * semantic);

    return { ...chunk, _bm25: bm25, _semantic: semantic, _hybrid: hybrid };
  });

  // Sort by hybrid score, filter by minScore
  const ranked = scored
    .filter(c => c._hybrid >= minScore)
    .sort((a, b) => b._hybrid - a._hybrid)
    .slice(0, topK)
    .map((c, i) => ({
      id: c.id,
      rank: i + 1,
      heading: c.heading,
      breadcrumb: c.breadcrumb,
      content: c.content,
      level: c.level,
      score: Math.round(c._hybrid * 100) / 100,
      bm25Score: Math.round(c._bm25 * 100) / 100,
      semanticScore: Math.round(c._semantic * 100) / 100,
      domain: c.domain
    }));

  return ranked;
}

// ─────────────────────────────────────────────────────────────────────────────
// High-Level Eligibility Check Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkDomicileEligibility(applicationData)
 * Retrieves relevant domicile policy clauses for the given application data.
 * Returns applicable rules + whether any exemption clauses may apply.
 *
 * @param {Object} applicationData
 *   @param {number} [applicationData.declaredDurationYears] - Declared residency duration
 *   @param {string} [applicationData.residencyProofType]    - Type of residency doc uploaded
 *   @param {string} [applicationData.state]                 - Declared state
 *   @param {boolean} [applicationData.hasSchoolCert]        - If school certificate uploaded
 *   @param {boolean} [applicationData.isGovEmployee]        - If government employee
 *   @param {boolean} [applicationData.bornInMaharashtra]    - Born in state
 */
function checkDomicileEligibility(applicationData) {
  const {
    declaredDurationYears = 0,
    residencyProofType = "",
    state = "",
    hasSchoolCert = false,
    isGovEmployee = false,
    bornInMaharashtra = false
  } = applicationData;

  const queries = [];

  // Build context-sensitive queries based on application data
  queries.push(`minimum residency years requirement domicile`);

  if (declaredDurationYears < 15) {
    queries.push(`exemption less than 15 years residence special category`);
  }
  if (hasSchoolCert) {
    queries.push(`educational exemption 10 years school certificate clause 4.2`);
  }
  if (isGovEmployee) {
    queries.push(`government employee transfer exemption 5 years clause 4.1`);
  }
  if (bornInMaharashtra) {
    queries.push(`born in maharashtra exemption clause 4.3`);
  }

  queries.push(`identity verification name match aadhaar`);
  queries.push(`address verification state district mismatch`);
  queries.push(`document requirements residency proof`);

  // Aggregate unique retrieved clauses across all queries
  const allClauses = {};
  for (const q of queries) {
    const results = retrieveRelevantClauses(q, "domicile", { topK: 3 });
    for (const clause of results) {
      if (!allClauses[clause.id] || clause.score > allClauses[clause.id].score) {
        allClauses[clause.id] = clause;
      }
    }
  }

  const sortedClauses = Object.values(allClauses).sort((a, b) => b.score - a.score).slice(0, 8);

  return {
    domain: "domicile",
    retrieved_clauses: sortedClauses,
    applicable_exemptions: {
      educational_exemption_possible: hasSchoolCert && declaredDurationYears >= 10,
      gov_employee_exemption_possible: isGovEmployee && declaredDurationYears >= 5,
      born_in_state_possible: bornInMaharashtra && declaredDurationYears >= 5
    },
    policy_source: "GR No. GAD-2019/CR-15/GAD-12, Maharashtra Government Gazette"
  };
}

/**
 * checkIncomeEligibility(applicationData)
 * Retrieves relevant income policy clauses.
 *
 * @param {Object} applicationData
 *   @param {number} [applicationData.annualIncome]      - Extracted annual income
 *   @param {string} [applicationData.incomeProofType]   - "salary_slip" | "itr" | "other"
 *   @param {boolean} [applicationData.incomeMatched]    - Whether declared vs doc income matches
 */
function checkIncomeEligibility(applicationData) {
  const {
    annualIncome = 0,
    incomeProofType = "salary_slip",
    incomeMatched = true
  } = applicationData;

  const queries = [];
  queries.push(`income eligibility threshold EWS annual income limit`);
  queries.push(`salary slip verification employee name gross monthly income`);

  if (annualIncome > 720000) {
    queries.push(`borderline income officer review zone threshold limit`);
  }
  if (!incomeMatched) {
    queries.push(`income discrepancy mismatch declared vs document`);
  }
  if (incomeProofType === "itr") {
    queries.push(`ITR income tax return self employed income proof`);
  }

  queries.push(`duplicate certificate aadhaar financial year anti duplication`);
  queries.push(`salary slip mandatory fields required payslip month year`);

  const allClauses = {};
  for (const q of queries) {
    const results = retrieveRelevantClauses(q, "income", { topK: 3 });
    for (const clause of results) {
      if (!allClauses[clause.id] || clause.score > allClauses[clause.id].score) {
        allClauses[clause.id] = clause;
      }
    }
  }

  const sortedClauses = Object.values(allClauses).sort((a, b) => b.score - a.score).slice(0, 8);

  return {
    domain: "income",
    retrieved_clauses: sortedClauses,
    eligibility_threshold: 800000,
    officer_review_zone: 720000,
    policy_source: "GR No. REV-2018/CR-07/M-3, Maharashtra Revenue Department"
  };
}

/**
 * checkBirthEligibility(applicationData)
 * Retrieves relevant birth certificate policy clauses.
 *
 * @param {Object} applicationData
 *   @param {number} [applicationData.ageDaysAtRegistration] - Days since birth when applying
 *   @param {boolean} [applicationData.duplicateFound]       - Duplicate entry exists
 *   @param {boolean} [applicationData.parentAgeValid]       - Parent >= 18 at birth
 *   @param {boolean} [applicationData.nameMatched]          - Child name matches
 */
function checkBirthEligibility(applicationData) {
  const {
    ageDaysAtRegistration = 0,
    duplicateFound = false,
    parentAgeValid = true,
    nameMatched = true
  } = applicationData;

  const queries = [];
  queries.push(`birth registration timeline 21 days requirements`);
  queries.push(`parent identity aadhaar father mother verification`);
  queries.push(`parent age minimum 18 years at birth clause 4.2`);

  if (ageDaysAtRegistration > 21) {
    queries.push(`late registration beyond 21 days delayed registration`);
  }
  if (ageDaysAtRegistration > 365) {
    queries.push(`delayed registration beyond 1 year magistrate order required clause 2.3`);
  }
  if (duplicateFound) {
    queries.push(`duplicate birth certificate same child existing record`);
  }
  if (!nameMatched) {
    queries.push(`child name mismatch similarity verification`);
  }

  queries.push(`place of birth matching verification`);

  const allClauses = {};
  for (const q of queries) {
    const results = retrieveRelevantClauses(q, "birth", { topK: 3 });
    for (const clause of results) {
      if (!allClauses[clause.id] || clause.score > allClauses[clause.id].score) {
        allClauses[clause.id] = clause;
      }
    }
  }

  const sortedClauses = Object.values(allClauses).sort((a, b) => b.score - a.score).slice(0, 8);

  return {
    domain: "birth",
    retrieved_clauses: sortedClauses,
    registration_type: ageDaysAtRegistration <= 21 ? "TIMELY" :
      ageDaysAtRegistration <= 365 ? "LATE" : "DELAYED_REQUIRES_MAGISTRATE",
    policy_source: "Registration of Births and Deaths Act, 1969 — Maharashtra Rules 2000"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: Format clauses for LLM prompt injection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * formatClausesForPrompt(clauses)
 * Formats retrieved clauses into a numbered list suitable for LLM prompt injection.
 * The LLM is instructed to cite ONLY these clauses and not invent rules.
 */
function formatClausesForPrompt(clauses) {
  if (!clauses || clauses.length === 0) {
    return "No policy clauses retrieved. Do not make eligibility decisions without policy context.";
  }

  return clauses.map((c, i) =>
    `[CLAUSE ${i+1}] ${c.breadcrumb ? `(${c.breadcrumb})` : ""} ${c.heading}\n` +
    `Score: ${c.score} | Level: ${c.level}\n` +
    `---\n${c.content}\n`
  ).join("\n\n");
}

module.exports = {
  retrieveRelevantClauses,
  checkDomicileEligibility,
  checkIncomeEligibility,
  checkBirthEligibility,
  formatClausesForPrompt,
  loadPolicy
};
