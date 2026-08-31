# Unified Implementation Plan: National (All-India) Core Infrastructure + Maharashtra State Citizen Protocols

This plan establishes the **Hybrid Government Architecture** for GovSahayak:
1. **National (Pan-India) Digital Infrastructure Layer**: Preserves all mandatory central systems (UIDAI, EPFO, Form 26AS, MCA21, GSTN, DigiLocker, e-Shram, SARATHI, CRS ORGI) common across India.
2. **State-Specific (Maharashtra) Administrative Layer**: Implements specialized land, revenue, and municipal protocols under the **Maharashtra Land Revenue Code (MLRC) 1966**, **MahaBhulekh (7/12 & 8A)**, **MahaFood (PDS)**, **MahaVitaran (MSEB)**, and **Aaple Sarkar**.

---

## 🏛️ Two-Tier Government Verification Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            PAN-INDIA NATIONAL CORE LAYER (All-India)                         │
│  • UIDAI (Aadhaar e-KYC)    • EPFO (UAN & PF Records)     • IT Dept (Form 26AS & ITR)        │
│  • MCA21 / GSTN Registry     • e-Shram National Portal     • DigiLocker / API Setu Gateway    │
│  • MoRTH (SARATHI DL)       • ECI (Voter ID - EPIC)       • CRS ORGI (Central Birth Portal)  │
└──────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                               │
                                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                         MAHARASHTRA STATE-SPECIFIC PROTOCOLS LAYER                          │
│  • MahaBhulekh (7/12 & 8A)   • e-Pik Pahani (Crops)        • MLRC 1966 Crop Yield Matrix     │
│  • MahaFood (PDS Ration)     • MahaVitaran (MSEB Power)    • e-Janma Maharashtra Birth       │
│  • Maharashtra Gumasta (Shop)• MahaBOCW Kamgar Board       • BMC / PMC / Municipal Tax       │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 📋 Comprehensive Category-Wise Verification Flow

| Citizen Category | Uploaded Documents | National (All-India) Databases Checked | Maharashtra State Databases Checked | Decision & Approval Rule |
|---|---|---|---|---|
| **1. Salaried Employees** | • Aadhaar Card<br>• Salary Slip / Form 16 / ITR | **UIDAI** (e-KYC)<br>**EPFO** (PF 12% check)<br>**Form 26AS** (TDS check)<br>**MCA21 / GSTN** (Company) | **MahaVitaran** (Address)<br>**MahaGST** (Employer) | If Annual Income $< ₹8,00,000$ and zero tampering $\rightarrow$ **Auto-Approve** 🎉 |
| **2. Farmers (*Kisan / Shetkari*)** | • Aadhaar Card<br>• 7/12 Extract (*Saat-Baara*)<br>• 8A Khate Pustika / Pik Pahani | **UIDAI** (e-KYC)<br>**PM-KISAN** (DBT Registry)<br>**Kisan Credit Card (KCC)** | **MahaBhulekh** (7/12 Gat No)<br>**e-Pik Pahani** (Crop register)<br>**MLRC 1966 Yield Table** | Formula: $\text{Acres} \times \text{Crop Rate} < ₹8\text{L}$ $\rightarrow$ **Auto-Approve** 🌾 |
| **3. Workers & Laborers (*Majdoor / Kamgar*)** | • Aadhaar Card<br>• e-Shram Card / BPL Yellow Ration / MGNREGA | **UIDAI** (e-KYC)<br>**e-Shram National Portal** (UAN)<br>**MGNREGA National Registry** | **MahaFood** (Yellow BPL RC)<br>**MahaBOCW** (Kamgar Board)<br>**Gram Sevak Registry** | Valid BPL / e-Shram worker $\rightarrow$ Legal Presumption $< ₹1\text{ Lakh}$ $\rightarrow$ **Auto-Approve** 👷 |
| **4. Small Business & Vendors (*Vyapari / MSME*)** | • Aadhaar Card<br>• Udyam MSME / PM-SVANidhi / Gumasta | **UIDAI** (e-KYC)<br>**MSME Udyam National Portal**<br>**PM-SVANidhi Registry** | **Maharashtra Gumasta License**<br>**Local Municipal Vendor ID** (BMC/PMC)<br>**MahaGST Composition** | Presumptive Net Profit ($8\%$ of Turnover) $< ₹8\text{L}$ $\rightarrow$ **Auto-Approve** 🏪 |
| **5. Domicile Applicants (All Citizens)** | • Aadhaar Card<br>• Address Proof<br>• Residency Proof | **UIDAI** (e-KYC)<br>**ECI Voter ID (EPIC)**<br>**SARATHI Driving License** | **MahaVitaran (MSEB)** Connection Date<br>**MahaBhulekh / BMC Property Tax**<br>**MahaFood Ration Card** | 15+ years connection in Maharashtra $\rightarrow$ **Auto-Approve** (10 yrs for School Exemption Cl. 4.2) |
| **6. Birth Certificate Applicants** | • Parent Aadhaar<br>• Hospital Birth Slip / Discharge Summary | **UIDAI** (Parent e-KYC)<br>**CRS ORGI** (Central Register)<br>**ABDM Health Facility Registry** | **e-Janma Maharashtra**<br>**Municipal Birth Register** (PMC/BMC) | 0–21 days: **Auto-Approve**<br>21–365 days: **Late Fee**<br>> 1 year: **SDM Order Mandatory** |

---

## 🛠️ Technology Stack (Final Confirmed Architecture)

1. **Backend**: Node.js + Express (High-concurrency parallel API orchestrator).
2. **Database**: MongoDB Atlas (Flexible multi-category document model: Farmer vs Salaried vs Worker).
3. **AI / LLM**: Groq `llama-3.3-70b-versatile` with `temperature=0` (Zero-hallucination deterministic legal engine).
4. **RAG Knowledge Base**: In-memory Hybrid BM25 + Maharashtra Legal Synonym Scorer (Sub-5ms citation retrieval).
5. **Frontend**: Flutter (Dart) with English, Hindi, and Marathi (मराठी) localization.

---

## 📂 File Architecture Plan

### Services (`backend/services/`)
- `mockUidaiVault.js` — **National**: Aadhaar Verhoeff checksum & demographic e-KYC.
- `mockEPFOPortal.js` — **National**: EPFO UAN lookup & 12% PF salary reverse-calculation.
- `mockIncomeTaxPortal.js` — **National**: Form 26AS TDS & ITR e-Filing cross-check.
- `mockBhulekhPortal.js` — **Maharashtra**: MahaBhulekh 7/12, 8A, e-Pik Pahani, and MLRC 1966 crop yield formula.
- `mockLabourPortal.js` — **Hybrid**: National e-Shram UAN + MahaFood Yellow BPL Ration Card + MahaBOCW.
- `mockMsmePortal.js` — **Hybrid**: National Udyam MSME + Maharashtra Gumasta (Shop Act) + PM-SVANidhi.
- `mockResidencyVerificationPortal.js` — **Hybrid**: National EPIC/SARATHI + MahaVitaran MSEB electricity connection year.
- `mockCivilRegistrationPortal.js` — **Hybrid**: National CRS ORGI + e-Janma Maharashtra birth register.
- `ragEligibilityService.js` — Hybrid RAG retrieval engine indexing all policy gazettes.
- `llmVerificationAgent.js` — Multi-category Groq AI Verification Agent.

### Policy Corpus (`backend/data/policies/`)
- `domicile_policy.md` — Maharashtra Domicile Guidelines (15-year rule, Clause 4.2 Schooling Exemption).
- `income_policy.md` — General Income Certificate & EWS ₹8 Lakh threshold rules.
- `maharashtra_farmer_income_policy.md` — MLRC 1966 agricultural yield valuation rules.
- `maharashtra_labour_income_policy.md` — Unorganized workers & BPL ration card presumption rules.
- `maharashtra_business_income_policy.md` — Micro-enterprise presumptive turnover rules.
- `birth_policy.md` — Registration of Births and Deaths Act 1969 & Maharashtra Rules 2000.

---

## 🚀 Verification Plan

### Automated Verification
```bash
# 1. National UIDAI & EPFO
node -e "const uidai = require('./services/mockUidaiVault'); const epfo = require('./services/mockEPFOPortal'); console.log('UIDAI & EPFO Ready');"

# 2. Maharashtra MahaBhulekh & MahaFood
node -e "const bhulekh = require('./services/mockBhulekhPortal'); const labour = require('./services/mockLabourPortal'); console.log('Maharashtra Portals Ready');"

# 3. RAG Retrieval across National & Maharashtra Gazettes
node -e "const rag = require('./services/ragEligibilityService'); console.log('RAG Ready');"
```

### Manual Verification
- End-to-end multi-language chat testing for Salaried, Farmer, Worker, Business, and Self-Declaration applicants.
- Ensure generated certificates display appropriate issuing authorities (e.g. *Tahsildar & Executive Magistrate, Haveli, District Pune*).
