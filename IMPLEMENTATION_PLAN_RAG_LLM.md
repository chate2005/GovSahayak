# RAG-Powered LLM AI Verification Agent & Real-World Mock Architecture

This document contains the complete technical design and implementation plan for upgrading the **GovSahayak** Certificate Verification Engine (Domicile, Birth, Income Certificates) to an **Enterprise-Grade RAG + LLM Architecture**.

---

## 🏛️ 1. Real-World Architecture vs. Local Project Simulation

| Feature / Component | Real-World Government System | Our Project Level Implementation | Differences & Replacement Strategy |
| :--- | :--- | :--- | :--- |
| **Aadhaar Verification** | **UIDAI e-KYC Vault API**: Direct biometric / OTP e-KYC database lookup. | **`mockUidaiVault.js`**: Simulated e-KYC service. | Real UIDAI API requires official government licenses. We simulate e-KYC JSON responses (`NAME_MATCH`, `ADDRESS_HASH`). |
| **Document Verification** | **DigiLocker / National API Gateway**: Pulls verified documents directly from issuer databases. | **`mockDigiLocker.js`**: Simulated Issuer Repository Service. | Cross-verifies uploaded reference IDs against a simulated government issuer database (Property tax, Ration card DB). |
| **Eligibility Rules Source** | **Government Gazette Web Portals**: Official portals (mahaonline.gov.in, india.gov.in) hosting Gazette Resolutions (GRs). | **Policy Web Scraper (`govPolicyScraper.js`) + Policy Corpus (`data/policies/*.md`)**. | Syncs official government website guidelines and indexes them locally into Markdown & Vector stores. |
| **Eligibility Logic** | **Manual Staff Review or Hardcoded Regex**. | **High-Precision RAG Engine (`ragEligibilityService.js`) + Groq LLM Agent (`llmVerificationAgent.js`)**. | Replaces rigid `if/else` with semantic legal clause retrieval (e.g. *Clause 4.2 Educational Exemption*) and LLM reasoning. |
| **Name & Address Matching** | **Exact String Match / Regex** (fails on minor typos or middle names). | **Tesseract OCR + Groq LLM Transliteration & Address Reasoner**. | Handles regional name formats, middle names, initials, and address formatting variations without false rejections. |
| **Audit Trail & Decision** | **Manual Physical Notes / NIC Portal**. | **LLM Audit Report & Legal Citation Generator**. | Generates a structured JSON audit report for Human Officers containing exact cited RAG policy clauses. |

---

## 🎯 2. High-Precision RAG & Zero-Hallucination Safeguards

For a **Government Certificate Generation System**, 100% precision and zero hallucination are mandatory:

1. **Zero Hallucination Guardrails (`temperature = 0`)**: The LLM is strictly constrained to output quotes directly from retrieved Gazette policies. It cannot invent or makeup rules.
2. **Hybrid Search (Dense Vector + BM25 Keyword Search)**: Combines semantic vector matching with exact keyword search to guarantee section numbers, clause names, and technical terms (e.g., *"Section 4(2)"*, *"Tehsildar"*, *"Non-Creamy Layer"*) are matched with 100% precision.
3. **Legal Hierarchy Indexing**: Gazette PDFs are chunked hierarchically (`Act -> Chapter -> Section -> Subsection -> Exemption Clause`).
4. **95% Confidence Threshold & Officer Fallback**: If RAG match confidence < 95% or if there is any ambiguity, the system does NOT auto-approve; it escalates to **Human Officer Review** with retrieved policy clauses attached for officer guidance.

---

## 📋 3. Component & File Map for Future Implementation

### Component 1: Mock Government API Services
- **[NEW] `backend/services/mockUidaiVault.js`**: Aadhaar e-KYC API simulation (returns demographic verification flags).
- **[NEW] `backend/services/mockDigiLocker.js`**: Government issuer repository simulation (property tax, ration card, board marksheets).

### Component 2: RAG Policy, Web Ingestion & Knowledge Base Engine
- **[NEW] `backend/services/govPolicyScraper.js`**: Fetches/syncs official government web portal eligibility guidelines into the local RAG knowledge store.
- **[NEW] `backend/data/policies/domicile_policy.md`**: Official Gazette Rules for Domicile Certificates (15-year rule, 10th/12th school exemptions).
- **[NEW] `backend/data/policies/income_policy.md`**: Official Income Certificate guidelines (Salary slip vs IT Return, gross family income aggregation rules).
- **[NEW] `backend/data/policies/birth_policy.md`**: Birth Certificate registration rules (21 days rule, 1 year delayed registration rules).
- **[NEW] `backend/services/ragEligibilityService.js`**: High-Precision Hybrid RAG search engine (BM25 + Vector) retrieving exact Gazette policy clauses.

### Component 3: LLM AI Verification Agent Core
- **[NEW] `backend/services/llmVerificationAgent.js`**: Groq LLM Agent (`temperature=0`) combining form data, OCR text, e-KYC result, and RAG policy clauses into structured JSON decisions.

### Component 4: Integration with Controllers & Database
- **[MODIFY] `backend/controllers/domicileController.js`**: Delegate verification to `llmVerificationAgent` and `ragEligibilityService`.
- **[MODIFY] `backend/controllers/birthController.js`**: Attach RAG policy engine and parent identity verification.
- **[MODIFY] `backend/controllers/incomeController.js`**: Attach RAG policy engine and LLM salary calculation.
- **[MODIFY] `backend/models/Application.js`**: Add schema fields for `rag_citations`, `llm_audit_report`, and `uidai_verified`.

---

## 🧪 4. Testing & Verification Steps

1. **Mock e-KYC Test**: Test `mockUidaiVault` with valid vs invalid Aadhaar numbers.
2. **RAG Retrieval Test**: Pass queries (*"10 year stay with HSC in Maharashtra"*) to `ragEligibilityService` to verify it retrieves Exemption Clause 4.2.
3. **LLM Verification Agent Test**: Pass sample OCR data + application input through `llmVerificationAgent` and verify structured JSON output with risk level, confidence score, and legal citations.
4. **End-to-End Test**: Run full certificate application from Flutter UI / API and verify auto-approval with RAG legal citations.
