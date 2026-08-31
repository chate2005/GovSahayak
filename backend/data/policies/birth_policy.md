# Birth Certificate — Official Registration Policy Corpus

**Source:** Registration of Births and Deaths Act, 1969 (Central Government)
**Reference:** Ministry of Home Affairs — Office of Registrar General, India
**State Rule:** Maharashtra Registration of Births and Deaths Rules, 2000
**Portal:** crsorgi.gov.in / mahaonline.gov.in

---

## Chapter 1 — Certificate Overview

### Section 1.1 — Definition
A Birth Certificate is a vital record that documents the fact of a person's birth, issued by the competent Registration Authority under the Registration of Births and Deaths Act, 1969. It is the primary legal proof of:
- Date and place of birth.
- Identity and parentage (father's and mother's name).
- Indian citizenship (by birth, for most cases).

### Section 1.2 — Legal Basis
- **Registration of Births and Deaths Act, 1969** — Sections 8, 13, 15, and 23.
- **Maharashtra Registration of Births and Deaths Rules, 2000**.
- **Citizenship Act, 1955** — Section 3 (Citizenship by Birth).

### Section 1.3 — Issuing Authority
- Municipal Corporation / Municipal Council (for urban births).
- Gram Panchayat / Village Panchayat (for rural births).
- Registrar of Births and Deaths for the sub-district.
- Chief Registrar, Maharashtra for late registrations exceeding 1 year.

---

## Chapter 2 — Registration Timelines

### Section 2.1 — Timely Registration (Within 21 Days)
**Every birth must be registered within 21 (twenty-one) days of the birth** at the local registration authority of the place of birth.

> **Clause 2.1.1 — Who Must Register:**
> - For institutional births (hospital): The Medical Officer In-charge of the hospital shall report the birth.
> - For non-institutional births: The Head of the household (father/mother/guardian) must register.

> **Clause 2.1.2 — Registration Fee (Within 21 Days):**
> No fee is levied for timely registration (within 21 days).

### Section 2.2 — Late Registration (21 Days to 1 Year)

**If a birth is not registered within 21 days**, a late registration may still be done within **1 year of the birth** with:
- A written application to the Registrar.
- Affidavit from the informant.
- A late fee as prescribed by the State Government.

> **Clause 2.2.1 — Late Fee (Maharashtra):**
> - Rs. 2 for registrations between 22 days and 6 months.
> - Rs. 5 for registrations between 6 months and 1 year.

> **Clause 2.2.2 — Required Documents for Late Registration (within 1 year):**
> - Birth proof from hospital (if institutional birth).
> - Affidavit from parent/guardian.
> - Vaccination record / school admission record (if available).

### Section 2.3 — Delayed Registration (Beyond 1 Year)

**If more than 1 year has elapsed since birth**, registration requires:
- **An order from an Executive Magistrate** under Section 13(3) of the Act.
- A non-judicial stamp paper affidavit.
- Supporting documents: Hospital discharge summary, vaccination records, school admission form.
- May require field verification by the Registrar.

> **Clause 2.3.1 — Magistrate Order Requirement:**
> No registration for birth more than 1 year old can be made without an Executive Magistrate order. This is a statutory requirement under Section 13 of the Registration of Births and Deaths Act, 1969.

> **Clause 2.3.2 — Supporting Evidence Required:**
> The application must be supported by at least TWO independent documentary evidences:
> - Institutional birth record / hospital register extract.
> - School admission register entry.
> - Immunization/vaccination record.
> - Electoral roll entry (if age > 18).

---

## Chapter 3 — Required Documents for Registration

### Section 3.1 — Hospital (Institutional) Birth
- Hospital discharge card / birth intimation form.
- Parents' Aadhaar cards (both father and mother).
- Proof of address of parents.

### Section 3.2 — Non-Institutional (Home) Birth
- Affidavit from parent/guardian (on Rs. 100 stamp paper).
- Certificate from Traditional Birth Attendant (Dai/Midwife) if available.
- Vaccination record (BCG record from Anganwadi/PHC).
- Panchayat / Gram Sevak certificate for rural births.

### Section 3.3 — Parent Identity Verification
- Father's Aadhaar Card — mandatory.
- Mother's Aadhaar Card — mandatory.
- If parent is deceased: Death certificate of deceased parent + surviving parent's Aadhaar.

---

## Chapter 4 — Verification and Eligibility Rules

### Section 4.1 — Child Name and DOB Matching
- Child's name on birth proof document must match the name entered in the application.
- Acceptable similarity: ≥ 80% (to accommodate spelling variations in Indian names).
- Date of birth must exactly match across all documents.

### Section 4.2 — Parent Identity Verification

> **Clause 4.2.1 — Aadhaar-Based Parent Identification:**
> Parent identity is verified by cross-matching the Aadhaar card submitted with the father's name and mother's name entered in the application. The Aadhaar name must match either the father or mother with ≥ 80% similarity.

> **Clause 4.2.2 — Minimum Parent Age:**
> The parent submitting the Aadhaar must have a Date of Birth at least 18 years prior to the child's Date of Birth (i.e., the parent must have been at least 18 years old at the time of the child's birth).
> If parent age at time of child birth < 18 years: Flag INVALID_PARENT_AGE. Application sent to officer.

### Section 4.3 — Place of Birth Verification
- Place of birth declared in the application should match the birth proof document (≥ 70% similarity).
- Minor discrepancies (e.g., "City Hospital, Pune" vs. "City Hospital") are acceptable.

### Section 4.4 — Late Registration Flags

> **Clause 4.4.1 — 21-Day Rule:**
> If the birth registration application is submitted more than 21 days after the child's Date of Birth, it is classified as a LATE REGISTRATION. This is flagged for officer awareness but does not automatically reject the application.

> **Clause 4.4.2 — 1-Year Delayed Registration:**
> If the application is submitted more than 1 year after the child's Date of Birth:
> - Magistrate order is mandatory.
> - Application is escalated to Human Officer for magistrate order verification.
> - Cannot be auto-approved by the system.

### Section 4.5 — Anti-Duplication Check
- Only ONE birth certificate can be registered for the same child (same name + DOB + father's name).
- If a birth certificate with identical child name, DOB, and father's name already exists in the system with "Approved" status, the new application is flagged as DUPLICATE_ENTRY and sent to officer.

---

## Chapter 5 — Decision Framework

### Section 5.1 — Auto-Approval Conditions
A birth certificate application is auto-approved if ALL of:
1. Birth proof document is valid and child name/DOB match (≥80%).
2. Parent identity verified via Aadhaar (≥80% name match to father or mother).
3. Parent was at least 18 years old at time of child's birth.
4. Place of birth matches (≥70%).
5. No duplicate entry exists.
6. Registration is within 1 year of birth (no magistrate order required).

### Section 5.2 — Officer Escalation Criteria
Application is sent to Human Officer Review if:
- LATE_REGISTRATION flag (21 days to 1 year) — officer confirms late fee.
- Any identity/name mismatch flag.
- Birth proof is of low quality / unreadable.
- Parent identity unclear (UNKNOWN_PARENT_DOCUMENT flag).

### Section 5.3 — Direct Rejection
Application is directly rejected if:
- DOB is a future date (impossible).
- Duplicate entry found (same child, same DOB, same father) — flagged as fraudulent re-registration.
- Parent's Aadhaar shows parent age < 18 at time of birth (INVALID_PARENT_AGE + direct reject if magistrate order absent).

---

## Chapter 6 — Certificate Validity

### Section 6.1 — Permanent Record
A Birth Certificate is a permanent legal document with no expiry. Once issued, it remains valid for life.

### Section 6.2 — Corrections
Factual corrections to a birth certificate (name, date, place) must be done through the Registrar under Section 15 of the Registration of Births and Deaths Act by submitting supporting documentary evidence.

---

## Appendix A — Registration Timeline Quick Reference

| Time Elapsed Since Birth | Registration Type | Authority | Fee |
|---|---|---|---|
| ≤ 21 days | Timely Registration | Hospital / Panchayat | Nil |
| 22 days – 6 months | Late Registration | Local Registrar | Rs. 2 |
| 6 months – 1 year | Late Registration | Local Registrar | Rs. 5 |
| > 1 year | Delayed Registration | Registrar + Magistrate Order | Varies |

## Appendix B — Parent Age Eligibility Table

| Parent DOB | Child DOB | Parent Age at Birth | Eligible? |
|---|---|---|---|
| 01/01/1990 | 01/01/2010 | 20 years | ✅ Yes |
| 01/01/1995 | 01/01/2010 | 15 years | ❌ No (< 18 years) |
| 01/06/1992 | 01/01/2010 | 17 years | ❌ No (< 18 years) |
