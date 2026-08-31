# Income Certificate — Official Eligibility Policy Corpus

**Source:** Maharashtra Revenue Department / National Guidelines (Ministry of Finance)
**Reference:** GR No. REV-2018/CR-07/M-3, Maharashtra Revenue and Forest Department
**Portal:** mahaonline.gov.in / india.gov.in

---

## Chapter 1 — Certificate Overview

### Section 1.1 — Definition
An Income Certificate is an official document issued by the Tehsildar or competent Revenue Authority certifying the gross annual family income of the applicant and their family members. It is used for:
- School/college fee concessions.
- Government scheme eligibility (welfare, scholarship).
- OBC/EWS/Non-Creamy Layer certificate issuance.
- Government housing scheme applications.
- Court affidavits and legal proceedings.

### Section 1.2 — Issuing Authority
- Tehsildar of the applicant's residential jurisdiction.
- Sub-Divisional Magistrate (SDM) for online applications.

### Section 1.3 — Legal Basis
- Maharashtra Land Revenue Code, 1966.
- National Scholarship Portal Guidelines (2018).
- Ministry of Social Justice and Empowerment — Non-Creamy Layer Guidelines.

---

## Chapter 2 — Income Eligibility Criteria

### Section 2.1 — General Income Definition
**Gross Annual Family Income** means the total income of the applicant's entire family (including self, spouse, dependent children, and dependent parents) from ALL sources for the relevant Financial Year.

> **Income Sources Included (Section 2.1.1):**
> - Salary / Wages (gross, before any deductions)
> - Business income / Profit from profession
> - Agricultural income (over Rs. 5,000 per year)
> - Rental income from property
> - Interest from savings, fixed deposits, mutual funds
> - Pension income
> - Any other regular income

### Section 2.2 — EWS (Economically Weaker Section) Threshold
**Gross Annual Family Income must be below Rs. 8,00,000 (Eight Lakh Rupees)** for the Economically Weaker Section category.

> **Clause 2.2.1 — EWS Threshold Reference:** Ministry of Social Justice and Empowerment OM dated 19th January 2019.
> Annual family income not exceeding Rs. 8 lakh (Rs. 8,00,000) is the standard EWS income limit for central and state government schemes.

### Section 2.3 — Non-Creamy Layer (NCL) Income Threshold
For OBC / Non-Creamy Layer eligibility:
- **Annual family income not exceeding Rs. 8,00,000** (from all sources, excluding salary and agricultural income per NCL guidelines).
- This limit is revised periodically by the National Commission for Backward Classes (NCBC).

### Section 2.4 — BPL (Below Poverty Line) Threshold
- As per Maharashtra State BPL list: Annual income below Rs. 1,20,000 (rural) or Rs. 1,44,000 (urban).

---

## Chapter 3 — Income Proof Documents

### Section 3.1 — Salaried Employees
Salaried applicants must submit ONE of:
1. **Salary Slip (Payslip)** — must be the latest month's payslip, duly stamped/signed by employer.
2. **Form 16** — issued by employer as per Income Tax Act, covering the relevant financial year.
3. **Bank Statement** — showing salary credits for the last 3 months.

> **Clause 3.1.1 — Payslip Validity:**
> The salary slip must be from the current financial year. A payslip older than 3 months from the date of application is not acceptable as primary income proof.

> **Clause 3.1.2 — Salary Slip Mandatory Fields:**
> A valid salary slip must contain:
> - Employee Name (matching Aadhaar)
> - Employer / Company Name and address
> - Month and Year of payslip
> - Gross Monthly Salary (before deductions)
> - Net Monthly Salary (after deductions like PF, TDS)
> - Employee ID or Payroll Number (for anti-duplication)

### Section 3.2 — Self-Employed / Business Income
Self-employed applicants must submit:
1. **Income Tax Return (ITR-3 or ITR-4)** — filed for the relevant financial year with ITR acknowledgment (from Income Tax Department).
2. **CA-certified Income Statement** — if ITR not filed (with CA registration number).

### Section 3.3 — Agricultural Income
Farmers must submit:
1. 7/12 extract (Satbara Utara) showing cultivated land area.
2. District Agricultural Officer certificate (if income is from agricultural sources).

### Section 3.4 — Multiple Income Sources
If the applicant has income from multiple sources, a consolidated declaration on stamp paper (Rs. 100 value) along with ITR is required.

---

## Chapter 4 — Verification Methodology

### Section 4.1 — Name and Identity Cross-Verification
- Applicant name on income document must match Aadhaar name with at least 80% similarity.
- Middle name discrepancies or initials vs full-name discrepancies are acceptable.
- Significant name differences (below 60% similarity) trigger officer review.

### Section 4.2 — Income Amount Verification
- Declared income (self-reported by applicant) must match document-extracted income within ±10%.
- If variance exceeds 10%: Application sent to officer for manual review.
- If variance exceeds 20%: Risk flag raised (INCOME_DISCREPANCY_HIGH).

### Section 4.3 — Anti-Duplication Check
- Only ONE income certificate per Aadhaar number per financial year.
- Duplicate applications for the same Aadhaar + financial year are rejected.
- Salary slip unique payroll number is cross-checked against issued certificates database.

### Section 4.4 — Salary Slip Calculation Rules

> **Clause 4.4.1 — Monthly to Annual Conversion:**
> If only monthly salary is provided: Annual Income = Monthly Gross Salary × 12.

> **Clause 4.4.2 — Gross vs Net Salary:**
> Income Certificate uses GROSS ANNUAL INCOME (before deductions). Net salary after PF, TDS, insurance deductions is NOT used for eligibility calculation.

> **Clause 4.4.3 — Special OCR Reading Rules (Rupee Symbol):**
> Automated systems must handle OCR artifact where the Indian Rupee symbol ₹ may be misread as digits (e.g., ₹20,000 read as 220000). Cross-reference with text summaries for accuracy.

### Section 4.5 — Financial Year Definition
Financial Year for Income Certificate = April 1 of the year to March 31 of the following year.
Example: FY 2024-2025 = 1st April 2024 to 31st March 2025.
The certificate must reference the most recently completed financial year.

---

## Chapter 5 — Decision Framework

### Section 5.1 — Auto-Approval Conditions
An application is auto-approved if ALL of the following are met:
1. Applicant name on documents matches Aadhaar (≥80% similarity).
2. Declared income matches document income (within ±10%).
3. Gross annual income is below the applicable threshold (Rs. 8,00,000 for EWS).
4. No duplicate for same Aadhaar + financial year exists.
5. Salary slip unique number has not been used in a previous application.

### Section 5.2 — Officer Review Escalation
Application is sent to Officer Review if:
- Income document is ambiguous or unreadable.
- Multiple income sources declared but only one document submitted.
- Name similarity is 60–80% (borderline match).
- Income declared exceeds Rs. 7,20,000 (90% of 8,00,000 threshold — borderline zone).

### Section 5.3 — Direct Rejection
Application is directly rejected if:
- Declared income exceeds Rs. 8,00,000 (EWS threshold).
- Duplicate certificate already issued for same Aadhaar + financial year.
- Submitted document is not a valid income proof (not a salary slip / ITR).
- Aadhaar card is invalid or fails checksum validation.

---

## Chapter 6 — Certificate Validity and Usage

### Section 6.1 — Validity Period
- Income Certificate is valid for **1 Financial Year** from the date of issue.
- Must be renewed annually for ongoing scheme eligibility.

### Section 6.2 — Permissible Uses
- EWS / OBC / SC / ST scheme eligibility.
- School / college fee concession.
- Government housing schemes.
- Court-ordered income verification.

---

## Appendix A — Income Thresholds Quick Reference

| Category | Income Limit | Key Document |
|---|---|---|
| EWS (Economically Weaker Section) | Below Rs. 8,00,000/year | Salary slip / ITR |
| Non-Creamy Layer (NCL-OBC) | Below Rs. 8,00,000/year | ITR or Salary slip |
| BPL (Rural) | Below Rs. 1,20,000/year | District Officer Certificate |
| BPL (Urban) | Below Rs. 1,44,000/year | District Officer Certificate |
| Officer Review Zone | Rs. 7,20,000–8,00,000/year | Additional verification required |
