/**
 * govPolicyScraper.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Government Policy Web Scraper & Knowledge Base Sync Utility.
 *
 * Real-World Equivalent: In production, this service would:
 *   - Periodically scrape official government gazette portals (mahaonline.gov.in,
 *     india.gov.in, etc.) to detect new Government Resolutions (GRs).
 *   - Convert PDF Gazette Notifications to Markdown using OCR/pdfjs.
 *   - Update the local RAG policy corpus (data/policies/*.md).
 *   - Trigger RAG index rebuild on policy changes.
 *
 * Project Simulation: Since we cannot scrape live government portals in a
 * development environment, this service:
 *   1. Validates the existing policy Markdown files are present and current.
 *   2. Provides a manual "sync report" showing policy file status.
 *   3. Simulates a last-sync timestamp and change detection.
 *   4. Exposes a triggerPolicySync() function that would call the real scraper
 *      in production.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const POLICY_DIR = path.join(__dirname, "../data/policies");

// ─── Real-World Government Portal URLs (for production scraping) ───────────
const GOV_PORTAL_URLS = {
  domicile: [
    "https://mahaonline.gov.in/en/Domicile/DomicileGuidelines",
    "https://aaplesarkar.mahaonline.gov.in/en/FrmForms/CasteDomicileCertForm",
    "https://india.gov.in/official-document/domicile-certificate-issuance"
  ],
  income: [
    "https://mahaonline.gov.in/en/IncomeCertificate/Guidelines",
    "https://aaplesarkar.mahaonline.gov.in/en/FrmForms/IncomeCertificateForm",
    "https://scholarships.gov.in/public/index.php"
  ],
  birth: [
    "https://crsorgi.gov.in/web/index.php/auth/login",
    "https://ejanma.maharashtra.gov.in/",
    "https://mahaonline.gov.in/en/BirthCertificate/Guidelines"
  ]
};

// ─── Policy Metadata (simulated gazette references) ───────────────────────
const POLICY_GAZETTE_REFS = {
  "domicile_policy.md": {
    gazetteName: "Maharashtra Government Gazette",
    grNumber: "GR No. GAD-2019/CR-15/GAD-12",
    issuedDate: "2019-03-15",
    lastAmendment: "2022-06-01",
    department: "General Administration Department",
    sourceUrl: "https://mahaonline.gov.in/en/Domicile/DomicileGuidelines"
  },
  "income_policy.md": {
    gazetteName: "Maharashtra Revenue Gazette",
    grNumber: "GR No. REV-2018/CR-07/M-3",
    issuedDate: "2018-11-20",
    lastAmendment: "2023-01-10",
    department: "Revenue and Forest Department, Maharashtra",
    sourceUrl: "https://mahaonline.gov.in/en/IncomeCertificate/Guidelines"
  },
  "birth_policy.md": {
    gazetteName: "Central Government Gazette / Maharashtra Supplement",
    grNumber: "Registration of Births and Deaths Act 1969 — Maharashtra Rules 2000",
    issuedDate: "2000-04-01",
    lastAmendment: "2021-08-15",
    department: "Home Department, Government of Maharashtra",
    sourceUrl: "https://crsorgi.gov.in/"
  }
};

/**
 * getPolicyFileStatus(filename)
 * Returns status information about a policy file.
 */
function getPolicyFileStatus(filename) {
  const filePath = path.join(POLICY_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return {
      file: filename,
      status: "MISSING",
      error: `Policy file not found at: ${filePath}`,
      requires_action: true
    };
  }

  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, "utf-8");
  const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
  const wordCount = content.split(/\s+/).length;
  const clauseCount = (content.match(/###\s+Section/g) || []).length +
    (content.match(/>\s+\*\*Clause/g) || []).length;

  const gazetteRef = POLICY_GAZETTE_REFS[filename] || {};

  return {
    file: filename,
    status: "PRESENT",
    file_size_kb: (stats.size / 1024).toFixed(2),
    last_modified: stats.mtime.toISOString(),
    content_hash: hash,
    word_count: wordCount,
    clauses_indexed: clauseCount,
    gazette_reference: gazetteRef.grNumber || "Unknown",
    issued_date: gazetteRef.issuedDate || "Unknown",
    last_amendment: gazetteRef.lastAmendment || "Unknown",
    source_portal: gazetteRef.sourceUrl || "Unknown",
    requires_action: false
  };
}

/**
 * runSyncReport()
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates a full policy knowledge base sync report.
 * In production: Would also compare local hashes against portal change-detection
 * endpoints to identify outdated policies.
 *
 * @returns {Object} Sync report with status of all policy files.
 */
function runSyncReport() {
  console.log("[GovPolicyScraper] Running policy sync status check...");

  const expectedFiles = Object.keys(POLICY_GAZETTE_REFS);
  const fileStatuses = expectedFiles.map(getPolicyFileStatus);

  const allPresent = fileStatuses.every(f => f.status === "PRESENT");
  const missingFiles = fileStatuses.filter(f => f.status === "MISSING");

  const report = {
    sync_timestamp: new Date().toISOString(),
    knowledge_base_status: allPresent ? "HEALTHY" : "DEGRADED",
    total_policy_files: expectedFiles.length,
    present: fileStatuses.filter(f => f.status === "PRESENT").length,
    missing: missingFiles.length,
    policy_files: fileStatuses,
    government_portals: GOV_PORTAL_URLS,
    rag_index_status: allPresent ? "READY" : "INCOMPLETE",
    recommendation: allPresent
      ? "All policy files are present. RAG engine is ready."
      : `Missing policy files: ${missingFiles.map(f => f.file).join(", ")}. Run policy generation script.`,
    note: "PRODUCTION NOTE: In production deployment, this service would auto-scrape " +
      "government gazette portals and update policy files when new Government Resolutions (GRs) are published."
  };

  console.log(`[GovPolicyScraper] Status: ${report.knowledge_base_status}`);
  console.log(`[GovPolicyScraper] Files: ${report.present}/${report.total_policy_files} present`);

  return report;
}

/**
 * triggerPolicySync(domain)
 * ─────────────────────────────────────────────────────────────────────────────
 * In production: Would scrape the government portal for the given domain,
 * extract new policy content, update the local Markdown file, and rebuild
 * the RAG index.
 *
 * In development (current): Returns a simulation message showing what
 * would happen in production.
 *
 * @param {"domicile"|"income"|"birth"|"all"} domain
 */
async function triggerPolicySync(domain = "all") {
  const domains = domain === "all" ? ["domicile", "income", "birth"] : [domain];

  const results = [];

  for (const d of domains) {
    const filename = `${d}_policy.md`;
    const gazetteRef = POLICY_GAZETTE_REFS[filename];
    const urls = GOV_PORTAL_URLS[d] || [];

    console.log(`[GovPolicyScraper] Sync triggered for domain: ${d}`);

    // In production: Scrape URLs, extract text, convert to Markdown, diff with existing
    // In development: Return simulation
    results.push({
      domain: d,
      status: "SIMULATED",
      gazette_reference: gazetteRef?.grNumber || "Unknown",
      portals_checked: urls,
      message: `PRODUCTION: Would fetch content from ${urls.join(", ")} and update ${filename}. ` +
        `LOCAL: File already exists with ${gazetteRef?.grNumber || "unknown"} content.`,
      last_sync: new Date().toISOString(),
      change_detected: false,
      file_updated: false
    });
  }

  return {
    sync_triggered_at: new Date().toISOString(),
    domains_synced: domains,
    results,
    mode: "SIMULATION — Connect real government portals for production scraping"
  };
}

/**
 * validateKnowledgeBase()
 * Quick check used at server startup to ensure all policy files are present.
 * @returns {boolean} true if all policy files exist, false otherwise
 */
function validateKnowledgeBase() {
  const expectedFiles = Object.keys(POLICY_GAZETTE_REFS);
  for (const filename of expectedFiles) {
    const filePath = path.join(POLICY_DIR, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`[GovPolicyScraper] CRITICAL: Policy file missing: ${filePath}`);
      return false;
    }
  }
  console.log("[GovPolicyScraper] Knowledge base validated: All policy files present.");
  return true;
}

module.exports = {
  runSyncReport,
  triggerPolicySync,
  validateKnowledgeBase,
  POLICY_GAZETTE_REFS,
  GOV_PORTAL_URLS
};
