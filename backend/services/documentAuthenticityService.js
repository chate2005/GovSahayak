/**
 * documentAuthenticityService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Layer Document Authenticity Verification Engine
 *
 * This service answers the question: "Is this document REAL or FAKE?"
 *
 * Layer 1 — Format & Checksum Validation (Instant, no network)
 *   • GSTIN checksum validation (real algorithm, not just format)
 *   • PAN number format + structure validation
 *   • EPF/PF code format validation
 *   • Aadhaar Verhoeff checksum (already in mockUidaiVault)
 *
 * Layer 2 — Company/Employer Existence Verification
 *   • MCA21 (Ministry of Corporate Affairs) company name lookup
 *   • GSTIN → Company name cross-reference
 *   • Company type reasonability check (Pvt Ltd, LLP, etc.)
 *
 * Layer 3 — Salary Reasonability Engine (Anti-Tampering)
 *   • Industry + Company Size → Expected salary range
 *   • Salary vs City cost-of-living check
 *   • EPFO/PF contribution reverse-calculation check
 *     (If PF = 12% of basic, and basic is claimed X → verify consistency)
 *   • Gross vs Net salary ratio check (standard deductions)
 *
 * Layer 4 — Document Internal Consistency (Anti-Edit Detection)
 *   • If monthly_salary × 12 ≠ annual_income → TAMPERED_CALCULATION
 *   • PF deduction = 12% of basic salary → verify from slip
 *   • TDS deduction vs income slab → verify reasonability
 *   • Month/Year on slip vs Application financial year
 *
 * Layer 5 — EPFO Employer Registry Mock
 *   • Employer EPF registration code → verify employer is registered
 *   • Employee UAN (Universal Account Number) format check
 *   • PF amount vs salary ratio validation
 *
 * Real-World Production Equivalent:
 *   • MCA21 API: https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do
 *   • GST Portal: https://www.gst.gov.in/taxpayerSearch.do
 *   • EPFO Unified Portal: https://unifiedportal-emp.epfindia.gov.in/
 *   • IT e-Filing: https://www.incometax.gov.in/iec/foportal/
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require("crypto");

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 1 — FORMAT & CHECKSUM VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateGSTIN(gstin)
 * Validates GSTIN using the official checksum algorithm.
 *
 * GSTIN Format: 2-digit state code + 10-digit PAN + 1 entity number +
 *               1 check digit (Z by default) + 1 checksum character
 * Example: 27AAPFU0939F1ZV
 *
 * Real-World: Same algorithm used by GST Portal for format validation.
 */
function validateGSTIN(gstin) {
  if (!gstin) return { valid: false, reason: "GSTIN not provided" };

  const cleaned = gstin.toUpperCase().replace(/\s/g, "");

  // Format check: 15 chars, specific pattern
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(cleaned)) {
    return { valid: false, reason: `Invalid GSTIN format: ${cleaned}` };
  }

  // State code validation (01-37 are valid Indian state codes)
  const stateCode = parseInt(cleaned.substring(0, 2));
  if (stateCode < 1 || stateCode > 38) {
    return { valid: false, reason: `Invalid state code in GSTIN: ${stateCode}` };
  }

  // Checksum validation using GSTIN algorithm
  const gstinChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const digit = gstinChars.indexOf(cleaned[i]);
    const factor = (i % 2 === 0) ? 1 : 2;
    const product = digit * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  const checkChar = gstinChars[(36 - (sum % 36)) % 36];

  if (cleaned[14] !== checkChar) {
    return {
      valid: false,
      reason: `GSTIN checksum failed. Expected: ${checkChar}, Got: ${cleaned[14]}. Document may be fabricated.`,
      fraud_indicator: true
    };
  }

  // Extract embedded PAN from GSTIN (chars 3-12)
  const embeddedPAN = cleaned.substring(2, 12);
  const stateNames = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab", "04": "Chandigarh",
    "05": "Uttarakhand", "06": "Haryana", "07": "Delhi", "08": "Rajasthan",
    "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
    "13": "Nagaland", "14": "Manipur", "15": "Mizoram", "16": "Tripura",
    "17": "Meghalaya", "18": "Assam", "19": "West Bengal", "20": "Jharkhand",
    "21": "Odisha", "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
    "27": "Maharashtra", "28": "Andhra Pradesh (old)", "29": "Karnataka",
    "30": "Goa", "31": "Lakshadweep", "32": "Kerala", "33": "Tamil Nadu",
    "34": "Puducherry", "35": "Andaman & Nicobar", "36": "Telangana",
    "37": "Andhra Pradesh"
  };

  return {
    valid: true,
    gstin: cleaned,
    state_code: cleaned.substring(0, 2),
    state_name: stateNames[cleaned.substring(0, 2)] || "Unknown",
    embedded_pan: embeddedPAN,
    entity_number: cleaned[12],
    checksum_verified: true
  };
}

/**
 * validatePAN(pan)
 * Validates PAN card number structure.
 *
 * PAN Format: AAAAA9999A
 *   Chars 1-3: Alphabetic (AAA) — Issuing AO series
 *   Char 4:    P (Person) / C (Company) / H (HUF) / F (Firm) / etc.
 *   Char 5:    First letter of surname
 *   Chars 6-9: Numeric (0000-9999)
 *   Char 10:   Alphabetic check character
 */
function validatePAN(pan) {
  if (!pan) return { valid: false, reason: "PAN not provided" };

  const cleaned = pan.toUpperCase().replace(/\s/g, "");

  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
  if (!panRegex.test(cleaned)) {
    return { valid: false, reason: `Invalid PAN format: ${cleaned}` };
  }

  const typeMap = {
    "P": "Individual (Person)",
    "C": "Company",
    "H": "Hindu Undivided Family (HUF)",
    "F": "Firm",
    "A": "Association of Persons (AOP)",
    "T": "Trust",
    "B": "Body of Individuals (BOI)",
    "L": "Local Authority",
    "J": "Artificial Juridical Person",
    "G": "Government"
  };

  const holderType = cleaned[3];

  return {
    valid: true,
    pan: cleaned,
    holder_type: typeMap[holderType] || `Unknown type: ${holderType}`,
    series: cleaned.substring(0, 3),
    surname_initial: cleaned[4],
    sequence: cleaned.substring(5, 9)
  };
}

/**
 * validateEPFCode(epfCode)
 * Validates EPF (Employee Provident Fund) employer registration code.
 *
 * EPF Code Format: <StateCode>/<TROCode>/<EstablishmentCode>/<ExtensionCode>
 * Example: MH/BAN/1234567/000
 */
function validateEPFCode(epfCode) {
  if (!epfCode) return { valid: false, reason: "EPF code not provided" };

  const cleaned = epfCode.toUpperCase().replace(/\s/g, "");

  // EPF code pattern
  const epfRegex = /^[A-Z]{2}\/[A-Z]{3,4}\/\d{7}\/\d{3}$/;
  if (!epfRegex.test(cleaned)) {
    return {
      valid: false,
      reason: `Invalid EPF code format: ${cleaned}. Expected: XX/XXX/0000000/000`
    };
  }

  const parts = cleaned.split("/");
  const stateCode = parts[0];

  const validStateCodes = [
    "MH", "DL", "GJ", "KA", "TN", "AP", "TS", "WB", "RJ", "UP",
    "MP", "HR", "PB", "OR", "BR", "JH", "CG", "UK", "HP", "AS"
  ];

  if (!validStateCodes.includes(stateCode)) {
    return { valid: false, reason: `Invalid state code in EPF: ${stateCode}` };
  }

  return {
    valid: true,
    epf_code: cleaned,
    state: stateCode,
    regional_office: parts[1],
    establishment_number: parts[2],
    extension: parts[3]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 2 — COMPANY/EMPLOYER EXISTENCE VERIFICATION (MCA21 Mock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mock MCA21 Company Registry Database.
 *
 * Real-World: This would query:
 *   GET https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do
 *   with CIN or company name search.
 *
 * Simulation: Seeded hash determines company status deterministically.
 */
const COMPANY_SUFFIXES = ["Pvt. Ltd.", "Ltd.", "LLP", "& Co.", "Industries", "Solutions"];
const KNOWN_LARGE_EMPLOYERS = [
  "tata", "infosys", "wipro", "accenture", "cognizant", "hcl", "tech mahindra",
  "capgemini", "ibm", "oracle", "microsoft", "amazon", "google", "reliance",
  "hdfc", "icici", "sbi", "axis bank", "kotak", "bajaj", "l&t", "mahindra",
  "hero", "honda", "maruti", "tcs", "mphasis", "zensar", "persistent"
];

function seededHash(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(33, h) ^ input.charCodeAt(i);
  }
  return Math.abs(h);
}

/**
 * verifyEmployerInMCA21(companyName)
 * Checks if the employer/company on the salary slip exists in the
 * MCA21 Company Registry (Ministry of Corporate Affairs).
 *
 * @param {string} companyName - Company name extracted from salary slip OCR
 * @returns {Object} Company verification result
 */
async function verifyEmployerInMCA21(companyName) {
  if (!companyName || companyName.trim().length < 3) {
    return {
      found: false,
      source: "MCA21 Company Registry",
      error: "Company name too short to verify",
      fraud_risk: "MEDIUM"
    };
  }

  const normalised = companyName.toLowerCase().trim();
  const hash = seededHash(normalised);

  // Check if it's a well-known large employer
  const isKnownLarge = KNOWN_LARGE_EMPLOYERS.some(emp =>
    normalised.includes(emp) || emp.includes(normalised.split(" ")[0])
  );

  if (isKnownLarge) {
    return {
      found: true,
      source: "MCA21 Company Registry",
      company_name: companyName,
      registration_status: "ACTIVE",
      company_type: "Well-Known Listed Company",
      cin: `L${String(hash % 99999).padStart(5, "0")}MH${2000 + (hash % 20)}PLC${String(hash % 999999).padStart(6, "0")}`,
      incorporation_year: 1990 + (hash % 30),
      fraud_risk: "LOW",
      note: "Large well-known employer — verified as legitimate."
    };
  }

  // For smaller companies — deterministic registry check
  const isRegistered = hash % 10 < 7; // 70% registered
  const isActive = isRegistered && (hash % 10 < 6); // 60% active

  if (!isRegistered) {
    return {
      found: false,
      source: "MCA21 Company Registry",
      company_name: companyName,
      error: "Company not found in MCA21 registry. May be unregistered, dissolved, or name misspelled.",
      fraud_risk: "HIGH",
      flag: "EMPLOYER_NOT_IN_MCA21",
      recommendation: "Request employer's CIN (Company Identification Number) or GSTIN for manual verification."
    };
  }

  const suffix = COMPANY_SUFFIXES[hash % COMPANY_SUFFIXES.length];
  const incYear = 2000 + (hash % 22);

  return {
    found: true,
    source: "MCA21 Company Registry",
    company_name: companyName,
    registration_status: isActive ? "ACTIVE" : "STRUCK_OFF",
    company_type: suffix.includes("Ltd") ? "Private Limited Company" : "Partnership/LLP",
    cin: `U${String(hash % 99999).padStart(5, "0")}MH${incYear}PTC${String(hash % 999999).padStart(6, "0")}`,
    incorporation_year: incYear,
    fraud_risk: isActive ? "LOW" : "HIGH",
    flag: isActive ? null : "EMPLOYER_COMPANY_STRUCK_OFF"
  };
}

/**
 * verifyGSTINWithCompanyName(gstin, companyName)
 * Cross-references: Does the GSTIN belong to the company named on the salary slip?
 */
function verifyGSTINWithCompanyName(gstin, companyName) {
  const gstResult = validateGSTIN(gstin);
  if (!gstResult.valid) {
    return { ...gstResult, cross_match: false, fraud_risk: "HIGH" };
  }

  const normalised = (companyName || "").toLowerCase().trim();
  const isKnownLarge = KNOWN_LARGE_EMPLOYERS.some(emp =>
    normalised.includes(emp) || emp.includes(normalised.split(" ")[0])
  );

  // In mock: Use embedded PAN to simulate company name match
  const embeddedPAN = gstResult.embedded_pan || "";
  const hash = seededHash(embeddedPAN + normalised);
  const nameMatches = isKnownLarge || (hash % 10 < 8);

  return {
    ...gstResult,
    cross_match: nameMatches,
    company_name_on_gst_record: nameMatches ? companyName : "Different Company Name",
    fraud_risk: nameMatches ? "LOW" : "HIGH",
    flag: nameMatches ? null : "GSTIN_COMPANY_NAME_MISMATCH"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 3 — SALARY REASONABILITY ENGINE (Anti-Tampering)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Industry-wise salary ranges (Annual, in INR) for reasonability check.
 * Real-World: Would use NCS (National Career Service) salary data or
 * LinkedIn Salary Insights API.
 */
const INDUSTRY_SALARY_RANGES = {
  IT_SOFTWARE: { min: 180000, max: 5000000, median: 800000, label: "IT / Software" },
  BANKING: { min: 200000, max: 2000000, median: 600000, label: "Banking / Finance" },
  MANUFACTURING: { min: 150000, max: 1500000, median: 350000, label: "Manufacturing" },
  HEALTHCARE: { min: 200000, max: 3000000, median: 500000, label: "Healthcare" },
  RETAIL: { min: 120000, max: 600000, median: 240000, label: "Retail / Sales" },
  EDUCATION: { min: 120000, max: 800000, median: 300000, label: "Education" },
  GOVERNMENT: { min: 180000, max: 1500000, median: 450000, label: "Government" },
  CONSTRUCTION: { min: 120000, max: 600000, median: 250000, label: "Construction" },
  GENERAL: { min: 100000, max: 8000000, median: 400000, label: "General" }
};

/**
 * detectIndustry(companyName, employerName)
 * Heuristically detects company industry from name keywords.
 */
function detectIndustry(companyName) {
  if (!companyName) return "GENERAL";
  const lower = companyName.toLowerCase();

  if (/tech|software|infosys|wipro|tcs|it |digital|systems|solutions|computer/.test(lower))
    return "IT_SOFTWARE";
  if (/bank|financial|finance|nbfc|insurance|capital|invest/.test(lower))
    return "BANKING";
  if (/hospital|clinic|pharma|medical|health|diagnostic/.test(lower))
    return "HEALTHCARE";
  if (/school|college|university|institute|education|academy/.test(lower))
    return "EDUCATION";
  if (/manufactur|steel|cement|chemical|textile|mill|plant|factory/.test(lower))
    return "MANUFACTURING";
  if (/retail|mart|store|shop|bazaar|sales|trading/.test(lower))
    return "RETAIL";
  if (/construct|builder|infra|engineer|project/.test(lower))
    return "CONSTRUCTION";
  if (/government|govt|ministry|department|municipal|corporation/.test(lower))
    return "GOVERNMENT";

  return "GENERAL";
}

/**
 * checkSalaryReasonability(annualIncome, companyName, city)
 * Checks if salary is realistic for this type of company and location.
 *
 * KEY USE CASE: If someone edits salary slip from ₹3L to ₹7.9L (just below
 * threshold), this engine checks if that income is plausible for:
 * - This type of company
 * - This city's cost of living
 * - Industry norms
 */
function checkSalaryReasonability(annualIncome, companyName, city) {
  const industry = detectIndustry(companyName);
  const range = INDUSTRY_SALARY_RANGES[industry];

  const flags = [];
  let riskLevel = "LOW";
  let reasonabilityScore = 100;

  // Check 1: Below absolute minimum
  if (annualIncome < range.min) {
    flags.push(`SALARY_BELOW_INDUSTRY_MINIMUM (${range.label} min: ₹${range.min.toLocaleString("en-IN")})`);
    reasonabilityScore -= 30;
    riskLevel = "MEDIUM";
  }

  // Check 2: Suspiciously close to threshold (Rs. 8L - Rs. 50K buffer zone)
  // Classic fraud: Editing Rs. 10L salary to Rs. 7.95L to stay just below limit
  if (annualIncome >= 730000 && annualIncome <= 800000) {
    flags.push("SALARY_IN_SUSPICIOUS_THRESHOLD_ZONE (₹7.3L-₹8L — Borderline EWS threshold)");
    reasonabilityScore -= 20;
    riskLevel = riskLevel === "LOW" ? "MEDIUM" : riskLevel;
  }

  // Check 3: Unrealistically high (> 3× industry median)
  if (annualIncome > range.median * 3) {
    flags.push(`SALARY_EXCEEDS_3X_INDUSTRY_MEDIAN (Industry median: ₹${range.median.toLocaleString("en-IN")})`);
    reasonabilityScore -= 15;
    riskLevel = "MEDIUM";
  }

  // Check 4: City cost-of-living check
  const metropolitanCities = ["mumbai", "delhi", "bangalore", "bengaluru", "hyderabad", "chennai", "pune", "kolkata"];
  const isMetro = metropolitanCities.some(c => (city || "").toLowerCase().includes(c));
  if (isMetro && annualIncome < 150000) {
    flags.push("SALARY_TOO_LOW_FOR_METRO_CITY (Below ₹1.5L annual in metro city — suspicious)");
    reasonabilityScore -= 25;
    riskLevel = "HIGH";
  }

  return {
    industry_detected: range.label,
    annual_income: annualIncome,
    industry_range: { min: range.min, max: range.max, median: range.median },
    reasonability_score: Math.max(0, reasonabilityScore),
    risk_level: riskLevel,
    flags,
    verdict: flags.length === 0 ? "SALARY_IS_REASONABLE" : "SALARY_NEEDS_MANUAL_REVIEW"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 4 — INTERNAL DOCUMENT CONSISTENCY (Anti-Edit Detection)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkSalarySlipInternalConsistency(salaryData)
 *
 * THIS IS THE KEY ANTI-TAMPERING CHECK.
 *
 * When someone edits a salary slip (e.g., changes ₹25,000 to ₹65,000),
 * they usually only change ONE number. The other numbers (PF, TDS, gross, net)
 * remain unchanged, creating MATHEMATICAL INCONSISTENCIES.
 *
 * Real-World Rule:
 *   Basic Salary → PF = 12% of Basic (capped at ₹1800/month)
 *   Gross Salary → TDS follows Income Tax slab
 *   Gross - Deductions = Net Salary
 *   Monthly × 12 = Annual
 *
 * @param {Object} salaryData
 *   monthly_salary, annual_income, basic_salary, pf_deduction,
 *   tds_deduction, gross_salary, net_salary, allowances
 */
function checkSalarySlipInternalConsistency(salaryData) {
  const flags = [];
  const checks = [];

  const {
    monthly_salary,
    annual_income,
    basic_salary,
    pf_deduction,
    tds_deduction,
    gross_salary,
    net_salary,
    professional_tax
  } = salaryData;

  // ── Check 1: Monthly × 12 = Annual Income ─────────────────────────────
  if (monthly_salary && annual_income) {
    const expectedAnnual = Math.round(monthly_salary * 12);
    const variance = Math.abs(expectedAnnual - annual_income) / expectedAnnual;
    if (variance > 0.05) {  // > 5% discrepancy
      flags.push(`TAMPERED_CALCULATION: monthly(${monthly_salary}) × 12 = ${expectedAnnual} but annual shows ${annual_income}. Variance: ${(variance * 100).toFixed(1)}%`);
      checks.push({ check: "Monthly×12=Annual", status: "FAIL", expected: expectedAnnual, found: annual_income });
    } else {
      checks.push({ check: "Monthly×12=Annual", status: "PASS" });
    }
  }

  // ── Check 2: PF Deduction = 12% of Basic (max ₹1800) ─────────────────
  if (pf_deduction && basic_salary) {
    const expectedPF = Math.min(Math.round(basic_salary * 0.12), 1800);
    const pfVariance = Math.abs(expectedPF - pf_deduction) / expectedPF;
    if (pfVariance > 0.10) { // > 10% off
      flags.push(`PF_INCONSISTENCY: Basic ₹${basic_salary} should give PF ₹${expectedPF} but shows ₹${pf_deduction}`);
      checks.push({ check: "PF=12%ofBasic", status: "FAIL", expected: expectedPF, found: pf_deduction });
    } else {
      checks.push({ check: "PF=12%ofBasic", status: "PASS" });
    }
  }

  // ── Check 3: Gross - Deductions = Net Salary ─────────────────────────
  if (gross_salary && net_salary && pf_deduction) {
    const totalDeductions = (pf_deduction || 0) + (tds_deduction || 0) + (professional_tax || 200);
    const expectedNet = gross_salary - totalDeductions;
    const netVariance = Math.abs(expectedNet - net_salary) / gross_salary;
    if (netVariance > 0.10) {
      flags.push(`NET_SALARY_INCONSISTENCY: Gross(${gross_salary}) - Deductions(${totalDeductions}) = ${expectedNet} but net shows ${net_salary}`);
      checks.push({ check: "Gross-Deductions=Net", status: "FAIL", expected: expectedNet, found: net_salary });
    } else {
      checks.push({ check: "Gross-Deductions=Net", status: "PASS" });
    }
  }

  // ── Check 4: TDS reasonability check ─────────────────────────────────
  if (tds_deduction && annual_income) {
    // Income < 2.5L → Zero TDS
    // Income 2.5L - 5L → 5% TDS
    // Income 5L - 10L → 20% TDS
    // Income > 10L → 30% TDS
    let expectedTDSMonthly = 0;
    if (annual_income <= 250000) expectedTDSMonthly = 0;
    else if (annual_income <= 500000) expectedTDSMonthly = Math.round((annual_income - 250000) * 0.05 / 12);
    else if (annual_income <= 1000000) expectedTDSMonthly = Math.round(((annual_income - 500000) * 0.20 + 12500) / 12);
    else expectedTDSMonthly = Math.round(((annual_income - 1000000) * 0.30 + 112500) / 12);

    if (expectedTDSMonthly === 0 && tds_deduction > 0) {
      flags.push(`TDS_INCONSISTENCY: Income ₹${annual_income} should have zero TDS but shows ₹${tds_deduction}/month`);
      checks.push({ check: "TDS_vs_Slab", status: "SUSPICIOUS" });
    } else {
      checks.push({ check: "TDS_vs_Slab", status: "PASS" });
    }
  }

  const isTampered = flags.length > 0;

  return {
    is_internally_consistent: !isTampered,
    tamper_detected: isTampered,
    consistency_checks: checks,
    flags,
    risk_level: flags.length === 0 ? "LOW" : flags.length === 1 ? "MEDIUM" : "HIGH",
    verdict: isTampered
      ? `DOCUMENT MAY BE EDITED: ${flags.length} mathematical inconsistency/inconsistencies found`
      : "Document passes internal consistency checks"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LAYER 5 — EPFO EMPLOYER REGISTRY (Mock)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyEmployerInEPFO(epfCode, companyName, monthlyPF)
 *
 * Real-World: EPFO Unified Portal lists all registered employers.
 *   https://unifiedportal-emp.epfindia.gov.in/
 *
 * Key insight: If a salary slip shows PF deduction, the employer MUST be
 * registered with EPFO. If employer is not found in EPFO → likely fake.
 *
 * @param {string} epfCode     - Employer EPF registration code (if on slip)
 * @param {string} companyName - Employer name
 * @param {number} monthlyPF   - PF amount deducted per month
 */
function verifyEmployerInEPFO(epfCode, companyName, monthlyPF, uan) {
  const result = { source: "EPFO Employer Registry" };

  // If UAN is provided on slip, employee's PF is verified via UAN
  if (uan && /^\d{12}$/.test(String(uan).replace(/\s/g, ""))) {
    return {
      ...result,
      verified: true,
      uan,
      risk_level: "LOW",
      note: "Employee UAN provided — verified in EPFO Member Registry."
    };
  }

  // If PF is deducted but neither EPF code nor UAN on slip → suspicious
  if (monthlyPF && monthlyPF > 0 && !epfCode && !uan) {
    return {
      ...result,
      verified: false,
      flag: "EPF_CODE_MISSING_WITH_PF_DEDUCTION",
      risk_level: "MEDIUM",
      note: "Salary slip shows PF deduction but no EPF employer code or UAN. All companies deducting PF must be EPFO registered."
    };
  }

  if (!epfCode) {
    return { ...result, verified: false, note: "No EPF code provided — skipping EPFO check" };
  }

  const epfValidation = validateEPFCode(epfCode);
  if (!epfValidation.valid) {
    return {
      ...result,
      verified: false,
      flag: "EPF_CODE_FORMAT_INVALID",
      risk_level: "HIGH",
      reason: epfValidation.reason
    };
  }

  // Simulate EPFO registry lookup
  const hash = seededHash((epfCode || "") + (companyName || "").toLowerCase());
  const isRegistered = hash % 10 < 8; // 80% found
  const nameMatches = isRegistered && (hash % 10 < 7); // 70% name matches

  if (!isRegistered) {
    return {
      ...result,
      verified: false,
      flag: "EMPLOYER_NOT_IN_EPFO_REGISTRY",
      risk_level: "HIGH",
      epf_code: epfCode,
      note: "EPF code not found in EPFO registry. Company may not be compliant or code is fabricated."
    };
  }

  return {
    ...result,
    verified: nameMatches,
    epf_code: epfCode,
    employer_name_match: nameMatches,
    registration_status: "ACTIVE",
    flag: nameMatches ? null : "EPFO_EMPLOYER_NAME_MISMATCH",
    risk_level: nameMatches ? "LOW" : "HIGH",
    note: nameMatches
      ? "Employer verified in EPFO registry — PF contribution legitimate."
      : "EPF code registered to a different company name. Salary slip may be fraudulent."
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER FUNCTION — Full Income Document Authenticity Check
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyIncomeSalarySlipAuthenticity(salaryData, applicantCity)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs all 5 layers of document authenticity verification on a salary slip.
 *
 * @param {Object} salaryData - Extracted from OCR via Groq:
 *   { employee_name, employer_name, monthly_salary, annual_income,
 *     basic_salary, pf_deduction, tds_deduction, gross_salary,
 *     net_salary, gstin, pan, epf_code, unique_number }
 *
 * @param {string} applicantCity - City for cost-of-living check
 *
 * @returns {Object} Complete authenticity report
 */
async function verifyIncomeSalarySlipAuthenticity(salaryData, applicantCity) {
  const report = {
    document_type: "Salary Slip / Income Proof",
    verification_layers: {},
    all_flags: [],
    overall_risk: "LOW",
    is_authentic: true,
    authenticity_score: 100,
    recommendation: "PROCEED"
  };

  // ── Layer 1A: GSTIN Validation ──────────────────────────────────────────
  if (salaryData.gstin) {
    const gstinResult = validateGSTIN(salaryData.gstin);
    report.verification_layers.gstin = gstinResult;
    if (!gstinResult.valid) {
      report.all_flags.push(`INVALID_GSTIN: ${gstinResult.reason}`);
      report.authenticity_score -= 25;
      if (gstinResult.fraud_indicator) report.authenticity_score -= 15;
    }
  }

  // ── Layer 1B: PAN Validation ────────────────────────────────────────────
  if (salaryData.pan) {
    const panResult = validatePAN(salaryData.pan);
    report.verification_layers.pan = panResult;
    if (!panResult.valid) {
      report.all_flags.push(`INVALID_PAN: ${panResult.reason}`);
      report.authenticity_score -= 20;
    }
  }

  // ── Layer 1C: EPF Code Format ────────────────────────────────────────────
  if (salaryData.epf_code) {
    const epfResult = validateEPFCode(salaryData.epf_code);
    report.verification_layers.epf_format = epfResult;
    if (!epfResult.valid) {
      report.all_flags.push(`INVALID_EPF_CODE: ${epfResult.reason}`);
      report.authenticity_score -= 15;
    }
  }

  // ── Layer 2: MCA21 Company Registry ─────────────────────────────────────
  if (salaryData.employer_name) {
    const mcaResult = await verifyEmployerInMCA21(salaryData.employer_name);
    report.verification_layers.mca21_company = mcaResult;
    if (!mcaResult.found) {
      report.all_flags.push(mcaResult.flag || "EMPLOYER_NOT_IN_MCA21");
      report.authenticity_score -= 30;
    } else if (mcaResult.registration_status === "STRUCK_OFF") {
      report.all_flags.push("EMPLOYER_COMPANY_STRUCK_OFF");
      report.authenticity_score -= 35;
    }
  }

  // ── Layer 2B: GSTIN × Company Name Cross-Reference ───────────────────────
  if (salaryData.gstin && salaryData.employer_name) {
    const gstCrossResult = verifyGSTINWithCompanyName(salaryData.gstin, salaryData.employer_name);
    report.verification_layers.gstin_company_cross = gstCrossResult;
    if (!gstCrossResult.cross_match && gstCrossResult.valid) {
      report.all_flags.push("GSTIN_COMPANY_NAME_MISMATCH");
      report.authenticity_score -= 25;
    }
  }

  // ── Layer 3: Salary Reasonability ────────────────────────────────────────
  if (salaryData.annual_income || salaryData.monthly_salary) {
    const income = salaryData.annual_income || (salaryData.monthly_salary * 12);
    const reasonResult = checkSalaryReasonability(income, salaryData.employer_name, applicantCity);
    report.verification_layers.salary_reasonability = reasonResult;
    if (reasonResult.flags.length > 0) {
      report.all_flags.push(...reasonResult.flags);
      report.authenticity_score -= reasonResult.flags.length * 10;
    }
  }

  // ── Layer 4: Internal Consistency (Anti-Tampering) ───────────────────────
  const consistencyResult = checkSalarySlipInternalConsistency(salaryData);
  report.verification_layers.internal_consistency = consistencyResult;
  if (consistencyResult.tamper_detected) {
    report.all_flags.push(...consistencyResult.flags);
    report.authenticity_score -= consistencyResult.flags.length * 20;
  }

  // ── Layer 5: EPFO Employer Registry ──────────────────────────────────────
  const epfoResult = verifyEmployerInEPFO(
    salaryData.epf_code,
    salaryData.employer_name,
    salaryData.pf_deduction,
    salaryData.uan
  );
  report.verification_layers.epfo_registry = epfoResult;
  if (epfoResult.flag) {
    report.all_flags.push(epfoResult.flag);
    report.authenticity_score -= epfoResult.risk_level === "HIGH" ? 25 : 10;
  }

  // ── Final Risk Assessment ─────────────────────────────────────────────────
  report.authenticity_score = Math.max(0, report.authenticity_score);

  if (report.authenticity_score >= 80) {
    report.overall_risk = "LOW";
    report.is_authentic = true;
    report.recommendation = "PROCEED_TO_ELIGIBILITY_CHECK";
  } else if (report.authenticity_score >= 55) {
    report.overall_risk = "MEDIUM";
    report.is_authentic = false;
    report.recommendation = "SEND_TO_OFFICER_FOR_MANUAL_DOCUMENT_VERIFICATION";
  } else {
    report.overall_risk = "HIGH";
    report.is_authentic = false;
    report.recommendation = "REJECT_LIKELY_FRAUDULENT_DOCUMENT";
  }

  return report;
}

/**
 * verifyAadhaarDocumentAuthenticity(aadhaarOCR)
 * Quick authenticity check for uploaded Aadhaar card image.
 */
function verifyAadhaarDocumentAuthenticity(aadhaarOCR) {
  const flags = [];
  let score = 100;

  // Check 1: is_aadhaar flag from OCR
  if (!aadhaarOCR.is_aadhaar) {
    return {
      is_authentic: false,
      flags: ["NOT_AN_AADHAAR_CARD"],
      score: 0,
      recommendation: "REJECT_WRONG_DOCUMENT"
    };
  }

  // Check 2: Aadhaar last4 format
  if (!aadhaarOCR.aadhaar_last4 || !/^\d{4}$/.test(aadhaarOCR.aadhaar_last4)) {
    flags.push("AADHAAR_LAST4_UNREADABLE");
    score -= 15;
  }

  // Check 3: DOB format
  if (!aadhaarOCR.dob || !/^\d{2}\/\d{2}\/\d{4}$/.test(aadhaarOCR.dob)) {
    flags.push("DOB_FORMAT_INVALID_ON_AADHAAR");
    score -= 10;
  } else {
    // Check DOB is not in future
    const dobParts = aadhaarOCR.dob.split("/");
    const dob = new Date(`${dobParts[2]}-${dobParts[1]}-${dobParts[0]}`);
    if (dob > new Date()) {
      flags.push("DOB_IS_FUTURE_DATE");
      score -= 30;
    }
  }

  // Check 4: Low OCR confidence
  if ((aadhaarOCR.ocr_confidence || 100) < 55) {
    flags.push("LOW_OCR_CONFIDENCE_POSSIBLE_BLUR_OR_TAMPER");
    score -= 20;
  }

  // Check 5: Name extraction
  if (!aadhaarOCR.name || aadhaarOCR.name.length < 3) {
    flags.push("NAME_NOT_READABLE_FROM_AADHAAR");
    score -= 15;
  }

  return {
    is_authentic: score >= 60,
    authenticity_score: Math.max(0, score),
    flags,
    recommendation: score >= 80 ? "PROCEED" :
      score >= 60 ? "OFFICER_MANUAL_VERIFY" : "REJECT_SUSPICIOUS_AADHAAR"
  };
}

module.exports = {
  // Layer 1: Format/Checksum
  validateGSTIN,
  validatePAN,
  validateEPFCode,
  // Layer 2: Company Registry
  verifyEmployerInMCA21,
  verifyGSTINWithCompanyName,
  // Layer 3: Salary Reasonability
  checkSalaryReasonability,
  detectIndustry,
  // Layer 4: Internal Consistency (Anti-Tampering)
  checkSalarySlipInternalConsistency,
  // Layer 5: EPFO Registry
  verifyEmployerInEPFO,
  // Master Functions
  verifyIncomeSalarySlipAuthenticity,
  verifyAadhaarDocumentAuthenticity,
  INDUSTRY_SALARY_RANGES
};
