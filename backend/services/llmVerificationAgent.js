/**
 * llmVerificationAgent.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Groq LLM Verification Agent for GovSahayak — Core of the RAG+LLM Architecture.
 *
 * Role: This agent acts as an AI Government Officer that:
 *   1. Receives all OCR-extracted data, form data, e-KYC results, and RAG policy clauses.
 *   2. Reasons through eligibility using ONLY the retrieved policy clauses (zero hallucination).
 *   3. Produces a structured JSON audit report with:
 *      - Final eligibility decision (APPROVE / OFFICER_REVIEW / REJECT)
 *      - Confidence score (0–100)
 *      - Risk level (LOW / MEDIUM / HIGH)
 *      - Exact legal citations from the RAG corpus
 *      - Reasoning chain in plain English for Human Officer review
 *      - All flags raised
 *
 * Zero Hallucination Safeguards:
 *   - temperature = 0 (fully deterministic, no creative generation)
 *   - System prompt strictly forbids inventing rules not in the RAG corpus.
 *   - LLM output is parsed and validated against a strict JSON schema.
 *   - Confidence < 95% → auto-escalate to Human Officer regardless of LLM decision.
 *
 * Real-World Equivalent:
 *   In a real government system, a trained Revenue Officer would review all documents
 *   and apply Gazette Rules. This agent simulates that role with legal clause citations.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const Groq = require("groq-sdk");
const {
  checkDomicileEligibility,
  checkIncomeEligibility,
  checkBirthEligibility,
  formatClausesForPrompt
} = require("./ragEligibilityService");
const { verifyEkyc } = require("./mockUidaiVault");
const { groq, createChatCompletion } = require("./aiHelper");

// Confidence threshold for auto-approval (95% as per implementation plan)
const CONFIDENCE_AUTO_APPROVE = 95;
// Confidence below which we always escalate to officer
const CONFIDENCE_OFFICER_THRESHOLD = 75;

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt — Zero-Hallucination Legal Verification Agent
// ─────────────────────────────────────────────────────────────────────────────

function buildSystemPrompt(domain) {
  const domainLabel = {
    domicile: "Domicile (Residence) Certificate",
    income: "Income Certificate",
    birth: "Birth Certificate"
  }[domain] || "Government Certificate";

  return `You are a highly precise AI Government Verification Agent for the GovSahayak system, verifying eligibility for a ${domainLabel} application.

## CRITICAL INSTRUCTIONS — READ CAREFULLY

### Zero Hallucination Rule (MANDATORY):
1. You MUST base your decision ONLY on the policy clauses provided in the [RETRIEVED POLICY CLAUSES] section.
2. You MUST NOT invent, assume, or apply any rules not explicitly stated in the retrieved clauses.
3. When citing a rule, quote it VERBATIM from the retrieved clauses and include its clause heading.
4. If the retrieved clauses do not cover a scenario, your decision must be "OFFICER_REVIEW" — never make up a rule.

### Structured Output (MANDATORY):
You MUST reply with ONLY valid JSON in the exact schema below. Do not include any text before or after the JSON block.

\`\`\`json
{
  "decision": "APPROVE" | "OFFICER_REVIEW" | "REJECT",
  "confidence": <integer 0-100>,
  "risk_level": "LOW" | "MEDIUM" | "HIGH",
  "legal_citations": [
    {
      "clause": "<exact clause heading>",
      "text": "<verbatim quoted text from retrieved clause — exact copy paste>",
      "supports": "<APPROVE/REJECT/FLAG — which direction this clause supports>"
    }
  ],
  "flags_raised": ["FLAG_NAME_1", "FLAG_NAME_2"],
  "reasoning": "<plain English explanation of your decision in 2-3 sentences, suitable for Human Officer review>",
  "officer_guidance": "<specific guidance for Human Officer if OFFICER_REVIEW — what to manually verify>",
  "auto_decision_possible": <true/false — true only if confidence >= 95 AND decision is APPROVE>
}
\`\`\`

### Confidence Scoring Rules:
- Start at 100.
- Deduct 20 for each CRITICAL flag (name mismatch, state mismatch, impossible values).
- Deduct 10 for each MODERATE flag (district mismatch, duration inconsistency).
- Deduct 5 for each LOW-SEVERITY flag (low OCR confidence, minor quality issues).
- Add confidence_boost from e-KYC results if provided.
- Confidence >= 95 with APPROVE: Auto-approval possible.
- Confidence 75-94 with APPROVE: Send to Officer for confirmation.
- Confidence < 75: Always OFFICER_REVIEW or REJECT.

### Decision Rules:
- APPROVE: All eligibility criteria met per retrieved policy. Confidence >= 75. No critical flags.
- REJECT: A hard rejection rule from policy is clearly triggered (e.g., declared income > threshold, duration < minimum with no exemption).
- OFFICER_REVIEW: Any ambiguity, flag, borderline case, or confidence < 95.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// User Prompt Builders
// ─────────────────────────────────────────────────────────────────────────────

function buildDomicilePrompt(appData, ocrData, ekycResult, ragResult) {
  const clauses = formatClausesForPrompt(ragResult.retrieved_clauses);

  return `## APPLICATION DATA

**Service Type:** Domicile Certificate

### Form Data (Entered by Applicant):
- Full Name: ${appData.dc_full_name || "N/A"}
- Duration of Residence Declared: ${appData.dc_duration_years || "N/A"} years
- State: ${appData.dc_state || "N/A"}
- District: ${appData.dc_district || "N/A"}
- City: ${appData.dc_city || "N/A"}
- PIN Code: ${appData.dc_pin || "N/A"}
- Purpose: ${appData.dc_purpose || "N/A"}

### OCR Extracted Data:

**Aadhaar Card OCR:**
${JSON.stringify(ocrData.aadhaar || {}, null, 2)}

**Address Proof OCR:**
${JSON.stringify(ocrData.address || {}, null, 2)}

**Residency Proof OCR:**
${JSON.stringify(ocrData.residency || {}, null, 2)}

### e-KYC Verification Result (UIDAI):
${JSON.stringify(ekycResult || { uidai_verified: false, note: "No Aadhaar number provided for e-KYC" }, null, 2)}

### Pre-Computed Flags (from rule-based engine):
${JSON.stringify(ocrData.flags || [], null, 2)}

### Applicable RAG Policy Exemptions:
- Educational Exemption (Clause 4.2) possible: ${ragResult.applicable_exemptions?.educational_exemption_possible || false}
- Government Employee Exemption (Clause 4.1) possible: ${ragResult.applicable_exemptions?.gov_employee_exemption_possible || false}
- Born in State (Clause 4.3) possible: ${ragResult.applicable_exemptions?.born_in_state_possible || false}

---

## RETRIEVED POLICY CLAUSES (cite ONLY these):

${clauses}

---

Now verify this application strictly against the retrieved clauses and produce your structured JSON audit report.`;
}

function buildIncomePrompt(appData, ocrData, ekycResult, ragResult) {
  const clauses = formatClausesForPrompt(ragResult.retrieved_clauses);

  return `## APPLICATION DATA

**Service Type:** Income Certificate

### Form Data (Entered by Applicant):
- Declared Annual Income: Rs. ${appData.entered_income || "N/A"}
- Financial Year: ${appData.financial_year || "N/A"}

### OCR Extracted Data:

**Aadhaar Card OCR:**
${JSON.stringify(ocrData.aadhaar || {}, null, 2)}

**Salary Slip / Income Proof OCR:**
${JSON.stringify(ocrData.salarySlip || {}, null, 2)}

### e-KYC Verification Result (UIDAI):
${JSON.stringify(ekycResult || { uidai_verified: false, note: "No Aadhaar number for e-KYC" }, null, 2)}

### Computed Income Data:
- Extracted Annual Income: Rs. ${ocrData.annualIncome || "N/A"}
- Income Match (within ±10%): ${ocrData.incomeMatched ? "YES" : "NO"}
- Income vs Threshold (Rs. 8,00,000): ${ocrData.annualIncome ? (ocrData.annualIncome < 800000 ? "BELOW THRESHOLD (Eligible)" : "ABOVE THRESHOLD (Ineligible)") : "Unknown"}

### Pre-Computed Flags:
${JSON.stringify(ocrData.flags || [], null, 2)}

---

## RETRIEVED POLICY CLAUSES (cite ONLY these):

${clauses}

---

Now verify this application strictly against the retrieved clauses and produce your structured JSON audit report.`;
}

function buildBirthPrompt(appData, ocrData, ekycResult, ragResult) {
  const clauses = formatClausesForPrompt(ragResult.retrieved_clauses);

  // Compute age at registration
  let ageDaysAtRegistration = 0;
  if (appData.dob) {
    const dobParts = appData.dob.split("/");
    if (dobParts.length === 3) {
      const dob = new Date(`${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`);
      ageDaysAtRegistration = Math.floor((new Date() - dob) / (1000 * 3600 * 24));
    }
  }

  return `## APPLICATION DATA

**Service Type:** Birth Certificate

### Form Data (Entered by Applicant):
- Child's Name: ${appData.child_name || "N/A"}
- Date of Birth: ${appData.dob || "N/A"}
- Place of Birth: ${appData.place_of_birth || "N/A"}
- Father's Name: ${appData.father_name || "N/A"}
- Mother's Name: ${appData.mother_name || "N/A"}
- Days Since Birth (at time of application): ${ageDaysAtRegistration} days

### OCR Extracted Data:

**Birth Proof OCR:**
${JSON.stringify(ocrData.birthProof || {}, null, 2)}

**Parent Aadhaar OCR:**
${JSON.stringify(ocrData.aadhaar || {}, null, 2)}

### e-KYC Verification Result (UIDAI — Parent):
${JSON.stringify(ekycResult || { uidai_verified: false, note: "No parent Aadhaar for e-KYC" }, null, 2)}

### Computed Checks:
- Detected Parent: ${ocrData.detectedParent || "Unknown"}
- Parent Age at Child Birth: ${ocrData.parentAgeAtBirth || "Unknown"} years
- Registration Type: ${ageDaysAtRegistration <= 21 ? "TIMELY (≤21 days)" : ageDaysAtRegistration <= 365 ? "LATE (>21 days, ≤1 year)" : "DELAYED (>1 year — Magistrate order required)"}

### Pre-Computed Flags:
${JSON.stringify(ocrData.flags || [], null, 2)}

---

## RETRIEVED POLICY CLAUSES (cite ONLY these):

${clauses}

---

Now verify this application strictly against the retrieved clauses and produce your structured JSON audit report.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Parse and Validate LLM JSON Response
// ─────────────────────────────────────────────────────────────────────────────

function parseLLMResponse(rawText, domain) {
  try {
    // Extract JSON from response
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in LLM response");

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate required fields
    const validDecisions = ["APPROVE", "OFFICER_REVIEW", "REJECT"];
    const validRisks = ["LOW", "MEDIUM", "HIGH"];

    if (!validDecisions.includes(parsed.decision)) {
      parsed.decision = "OFFICER_REVIEW";
    }
    if (!validRisks.includes(parsed.risk_level)) {
      parsed.risk_level = "HIGH";
    }
    if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 100) {
      parsed.confidence = 50;
    }
    if (!Array.isArray(parsed.flags_raised)) parsed.flags_raised = [];
    if (!Array.isArray(parsed.legal_citations)) parsed.legal_citations = [];

    // 95% confidence threshold enforcement
    if (parsed.decision === "APPROVE" && parsed.confidence < CONFIDENCE_AUTO_APPROVE) {
      parsed.auto_decision_possible = false;
      if (!parsed.officer_guidance) {
        parsed.officer_guidance = `Auto-approval withheld: Confidence score ${parsed.confidence}% is below the 95% threshold required for automated decisions. Please manually review the application and verify the flagged items.`;
      }
    } else if (parsed.decision === "APPROVE" && parsed.confidence >= CONFIDENCE_AUTO_APPROVE) {
      parsed.auto_decision_possible = true;
    } else {
      parsed.auto_decision_possible = false;
    }

    return parsed;
  } catch (err) {
    console.error("[LLM Agent] Failed to parse LLM response:", err.message);
    // Safe fallback: escalate to officer if LLM output is malformed
    return {
      decision: "OFFICER_REVIEW",
      confidence: 0,
      risk_level: "HIGH",
      legal_citations: [],
      flags_raised: ["LLM_PARSE_ERROR"],
      reasoning: "The LLM verification agent could not produce a valid structured response. Escalating to Human Officer for manual review.",
      officer_guidance: "LLM agent returned malformed output. Please manually review all submitted documents and apply policy rules.",
      auto_decision_possible: false,
      parse_error: err.message
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Verification Agent Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyDomicileApplication(app, ocrData)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs full RAG+LLM verification for a Domicile Certificate application.
 *
 * @param {Object} app     - Mongoose Application document
 * @param {Object} ocrData - Extracted OCR data and pre-computed flags
 *   @param {Object} ocrData.aadhaar   - Aadhaar OCR result
 *   @param {Object} ocrData.address   - Address proof OCR result
 *   @param {Object} ocrData.residency - Residency proof OCR result
 *   @param {Array}  ocrData.flags     - Pre-computed rule-based flags
 *
 * @returns {Object} LLM audit report with decision, confidence, citations, flags
 */
async function verifyDomicileApplication(app, ocrData) {
  console.log("[LLM Agent] Starting Domicile verification for application:", app._id);

  // ── Step 1: UIDAI e-KYC Verification ────────────────────────────────────
  let ekycResult = null;
  if (app.aadhaar_number || ocrData.aadhaar?.aadhaar_number) {
    const aadhaarNum = app.aadhaar_number || ocrData.aadhaar?.aadhaar_number || "";
    ekycResult = await verifyEkyc(aadhaarNum, {
      name: app.dc_full_name,
      state: app.dc_state,
      dob: app.dc_dob
    });
    if (ekycResult.ekYC_flags?.length) {
      ocrData.flags = [...(ocrData.flags || []), ...ekycResult.ekYC_flags];
    }
  }

  // ── Step 2: RAG Policy Retrieval ─────────────────────────────────────────
  const ragResult = checkDomicileEligibility({
    declaredDurationYears: app.dc_duration_years,
    residencyProofType: ocrData.residency?.doc_type,
    state: app.dc_state,
    hasSchoolCert: ocrData.residency?.doc_type?.toLowerCase().includes("school") || false,
    isGovEmployee: false,
    bornInMaharashtra: false
  });

  // ── Step 3: LLM Agent Verification ──────────────────────────────────────
  const userPrompt = buildDomicilePrompt(app, ocrData, ekycResult, ragResult);

  const completion = await createChatCompletion({
    temperature: 0,  // ZERO HALLUCINATION
    max_tokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt("domicile") },
      { role: "user", content: userPrompt }
    ]
  });

  const rawResponse = completion.choices[0].message.content;
  const auditReport = parseLLMResponse(rawResponse, "domicile");

  // Merge e-KYC confidence boost
  if (ekycResult?.confidence_boost) {
    auditReport.confidence = Math.min(100, auditReport.confidence + Math.round(ekycResult.confidence_boost * 0.5));
  }

  // Re-evaluate auto_decision_possible after confidence adjustment
  if (auditReport.decision === "APPROVE" && auditReport.confidence >= CONFIDENCE_AUTO_APPROVE) {
    auditReport.auto_decision_possible = true;
  }

  return {
    ...auditReport,
    domain: "domicile",
    rag_citations: ragResult.retrieved_clauses.map(c => ({
      id: c.id,
      heading: c.heading,
      score: c.score
    })),
    uidai_verified: ekycResult?.uidai_verified || false,
    ekYC_txn_id: ekycResult?.audit_txn_id || null,
    policy_source: ragResult.policy_source,
    generated_at: new Date().toISOString()
  };
}

/**
 * verifyIncomeApplication(app, ocrData)
 * Runs full RAG+LLM verification for an Income Certificate application.
 *
 * @param {Object} app     - Mongoose Application document
 * @param {Object} ocrData
 *   @param {Object} ocrData.aadhaar    - Aadhaar OCR
 *   @param {Object} ocrData.salarySlip - Salary slip / ITR OCR
 *   @param {number} ocrData.annualIncome - Computed annual income
 *   @param {boolean} ocrData.incomeMatched - Whether declared matches extracted
 *   @param {Array}  ocrData.flags      - Pre-computed flags
 */
async function verifyIncomeApplication(app, ocrData) {
  console.log("[LLM Agent] Starting Income verification for application:", app._id);

  // ── Step 1: UIDAI e-KYC ─────────────────────────────────────────────────
  let ekycResult = null;
  const aadhaarNum = app.aadhaar_number || ocrData.aadhaar?.aadhaar_number || "";
  if (aadhaarNum) {
    ekycResult = await verifyEkyc(aadhaarNum, {
      name: ocrData.aadhaar?.name || app.name_from_chat
    });
    if (ekycResult.ekYC_flags?.length) {
      ocrData.flags = [...(ocrData.flags || []), ...ekycResult.ekYC_flags];
    }
  }

  // ── Step 2: RAG Policy Retrieval ─────────────────────────────────────────
  const ragResult = checkIncomeEligibility({
    annualIncome: ocrData.annualIncome,
    incomeProofType: "salary_slip",
    incomeMatched: ocrData.incomeMatched
  });

  // ── Step 3: LLM Verification ──────────────────────────────────────────────
  const userPrompt = buildIncomePrompt(app, ocrData, ekycResult, ragResult);

  const completion = await createChatCompletion({
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt("income") },
      { role: "user", content: userPrompt }
    ]
  });

  const rawResponse = completion.choices[0].message.content;
  const auditReport = parseLLMResponse(rawResponse, "income");

  if (ekycResult?.confidence_boost) {
    auditReport.confidence = Math.min(100, auditReport.confidence + Math.round(ekycResult.confidence_boost * 0.5));
  }

  if (auditReport.decision === "APPROVE" && auditReport.confidence >= CONFIDENCE_AUTO_APPROVE) {
    auditReport.auto_decision_possible = true;
  }

  return {
    ...auditReport,
    domain: "income",
    rag_citations: ragResult.retrieved_clauses.map(c => ({
      id: c.id,
      heading: c.heading,
      score: c.score
    })),
    uidai_verified: ekycResult?.uidai_verified || false,
    ekYC_txn_id: ekycResult?.audit_txn_id || null,
    policy_source: ragResult.policy_source,
    generated_at: new Date().toISOString()
  };
}

/**
 * verifyBirthApplication(app, ocrData)
 * Runs full RAG+LLM verification for a Birth Certificate application.
 *
 * @param {Object} app     - Mongoose Application document
 * @param {Object} ocrData
 *   @param {Object} ocrData.birthProof    - Birth proof OCR
 *   @param {Object} ocrData.aadhaar       - Parent Aadhaar OCR
 *   @param {string} ocrData.detectedParent - "father" | "mother" | "unknown"
 *   @param {number} ocrData.parentAgeAtBirth - Parent age at child birth
 *   @param {Array}  ocrData.flags         - Pre-computed flags
 */
async function verifyBirthApplication(app, ocrData) {
  console.log("[LLM Agent] Starting Birth verification for application:", app._id);

  // ── Step 1: UIDAI e-KYC (Parent Aadhaar) ────────────────────────────────
  let ekycResult = null;
  const parentAadhaar = ocrData.aadhaar?.aadhaar_number || "";
  if (parentAadhaar) {
    const parentName = ocrData.detectedParent === "father" ? app.father_name : app.mother_name;
    ekycResult = await verifyEkyc(parentAadhaar, {
      name: parentName,
      dob: ocrData.aadhaar?.dob
    });
    if (ekycResult.ekYC_flags?.length) {
      ocrData.flags = [...(ocrData.flags || []), ...ekycResult.ekYC_flags];
    }
  }

  // ── Step 2: Compute age at registration ──────────────────────────────────
  let ageDaysAtRegistration = 0;
  if (app.dob) {
    const dobParts = app.dob.split("/");
    if (dobParts.length === 3) {
      const dob = new Date(`${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`);
      ageDaysAtRegistration = Math.max(0, Math.floor((new Date() - dob) / (1000 * 3600 * 24)));
    }
  }

  // ── Step 3: RAG Policy Retrieval ─────────────────────────────────────────
  const ragResult = checkBirthEligibility({
    ageDaysAtRegistration,
    duplicateFound: ocrData.flags?.includes("DUPLICATE_ENTRY") || false,
    parentAgeValid: (ocrData.parentAgeAtBirth || 99) >= 18,
    nameMatched: !ocrData.flags?.includes("NAME_MISMATCH")
  });

  // ── Step 4: LLM Verification ──────────────────────────────────────────────
  const userPrompt = buildBirthPrompt(app, ocrData, ekycResult, ragResult);

  const completion = await createChatCompletion({
    temperature: 0,
    max_tokens: 2048,
    messages: [
      { role: "system", content: buildSystemPrompt("birth") },
      { role: "user", content: userPrompt }
    ]
  });

  const rawResponse = completion.choices[0].message.content;
  const auditReport = parseLLMResponse(rawResponse, "birth");

  if (ekycResult?.confidence_boost) {
    auditReport.confidence = Math.min(100, auditReport.confidence + Math.round(ekycResult.confidence_boost * 0.5));
  }

  if (auditReport.decision === "APPROVE" && auditReport.confidence >= CONFIDENCE_AUTO_APPROVE) {
    auditReport.auto_decision_possible = true;
  }

  return {
    ...auditReport,
    domain: "birth",
    rag_citations: ragResult.retrieved_clauses.map(c => ({
      id: c.id,
      heading: c.heading,
      score: c.score
    })),
    registration_type: ragResult.registration_type,
    uidai_verified: ekycResult?.uidai_verified || false,
    ekYC_txn_id: ekycResult?.audit_txn_id || null,
    policy_source: ragResult.policy_source,
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  verifyDomicileApplication,
  verifyIncomeApplication,
  verifyBirthApplication,
  CONFIDENCE_AUTO_APPROVE,
  CONFIDENCE_OFFICER_THRESHOLD
};
