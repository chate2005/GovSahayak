/**
 * mockEPFOPortal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * EPFO (Employees' Provident Fund Organisation) Portal Simulation
 *
 * WHY EPFO IS THE STRONGEST SALARY TRUTH SIGNAL:
 * ─────────────────────────────────────────────────────────────────────────────
 * Every salaried employee in India earning > ₹15,000/month MUST have PF
 * deducted. The employer deposits this DIRECTLY to EPFO — the employee
 * has ZERO control over EPFO records.
 *
 * The Math:
 *   PF Contribution = 12% of Basic Salary (employer deposits this to EPFO)
 *   → If EPFO shows PF = ₹5,400/month → Basic Salary = ₹45,000/month
 *   → If salary slip claims Basic = ₹15,000 → PF should be ₹1,800/month
 *   → MISMATCH = SALARY SLIP TAMPERED!
 *
 * Real Production Implementation:
 *   EPFO Unified Member Portal: https://unifiedportal-mem.epfindia.gov.in/
 *   With UAN + Aadhaar OTP → PF Passbook accessible (monthly contributions)
 *   APIs available for authorized agencies via EPFO e-Connect integration.
 *
 * Simulation:
 *   UAN number → Seeded deterministic PF history generated
 *   Same UAN always returns same PF records (consistent verification)
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// UAN Format Validator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * validateUAN(uan)
 * UAN (Universal Account Number): 12-digit number assigned by EPFO.
 * Every PF member has a unique UAN for life.
 */
function validateUAN(uan) {
  if (!uan) return { valid: false, reason: "UAN not provided" };
  const cleaned = String(uan).replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleaned)) {
    return { valid: false, reason: `Invalid UAN format: ${cleaned}. Must be 12 digits.` };
  }
  // UAN starts with specific regional codes (10–99)
  const prefix = parseInt(cleaned.substring(0, 2));
  if (prefix < 10) {
    return { valid: false, reason: `UAN prefix ${prefix} is invalid (must be 10+).` };
  }
  return { valid: true, uan: cleaned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded Random (for deterministic mock data)
// ─────────────────────────────────────────────────────────────────────────────

function seededRand(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = Math.imul(31, s) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFICIAL EPFO REGISTERED MEMBERS DATABASE (MOCK REGISTRY)
// ─────────────────────────────────────────────────────────────────────────────
const MOCK_EPFO_MEMBER_DATABASE = {
  "100000000008": {
    member_name: "Lakshmi Patil",
    employer_name: "TATA CONSULTANCY SERVICES LTD",
    employer_epf_code: "MH/PUN/0012345/000",
    basic_salary: 15000,
    monthly_pf: 1800,
    annual_basic: 180000,
    account_status: "ACTIVE",
    joined_date: "15/07/2021"
  },
  "100000000015": {
    member_name: "Priya Joshi",
    employer_name: "INFOSYS LIMITED",
    employer_epf_code: "MH/PUN/0023456/000",
    basic_salary: 28000,
    monthly_pf: 1800,
    annual_basic: 336000,
    account_status: "ACTIVE",
    joined_date: "10/03/2022"
  },
  "100000000022": {
    member_name: "Kavita Gupta",
    employer_name: "WIPRO LIMITED",
    employer_epf_code: "MH/BAN/0034567/000",
    basic_salary: 35000,
    monthly_pf: 1800,
    annual_basic: 420000,
    account_status: "ACTIVE",
    joined_date: "01/01/2020"
  },
  "100000000030": {
    member_name: "Anita Patil",
    employer_name: "TECH MAHINDRA LTD",
    employer_epf_code: "MH/PUN/0045678/000",
    basic_salary: 28000,
    monthly_pf: 1800,
    annual_basic: 336000,
    account_status: "ACTIVE",
    joined_date: "12/08/2023"
  },
  "100000000045": {
    member_name: "Rajesh Sharma",
    employer_name: "RELIANCE INDUSTRIES LTD",
    employer_epf_code: "MH/MUM/0056789/000",
    basic_salary: 70000,
    monthly_pf: 1800,
    annual_basic: 840000,
    account_status: "ACTIVE",
    joined_date: "05/05/2018"
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Core EPFO Lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * lookupEPFOByUAN(uan, employerEPFCode, employeeName)
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches PF contribution history for an employee by UAN.
 *
 * Key Output: monthly_pf_employee — the PF deducted from employee each month.
 * Since PF = 12% of Basic Salary, we can REVERSE-CALCULATE actual basic salary:
 *   actual_basic = monthly_pf_employee / 0.12
 *
 * @param {string} uan            - Employee's 12-digit UAN
 * @param {string} employerEPFCode - Employer's EPF registration code (optional)
 * @param {string} employeeName   - Employee name (for cross-verification)
 * @returns {Object} EPFO record with PF history
 */
function lookupEPFOByUAN(uan, employerEPFCode, employeeName) {
  const validation = validateUAN(uan);
  if (!validation.valid) {
    return {
      found: false,
      source: "EPFO Unified Member Portal",
      error: validation.reason,
      flag: "INVALID_UAN_FORMAT"
    };
  }

  const cleanedUAN = validation.uan;

  // ── 1. Check Explicit Registered Members Database First ───────────────────
  if (MOCK_EPFO_MEMBER_DATABASE[cleanedUAN]) {
    const rec = MOCK_EPFO_MEMBER_DATABASE[cleanedUAN];
    const nameMatches = employeeName
      ? (rec.member_name.toLowerCase().includes(employeeName.toLowerCase().split(" ")[0]) ||
         employeeName.toLowerCase().includes(rec.member_name.toLowerCase().split(" ")[0]))
      : true;

    const months = ["Feb 2026", "Jan 2026", "Dec 2025", "Nov 2025", "Oct 2025", "Sep 2025"];
    const pfHistory = months.map(m => ({
      month: m,
      employee_contribution: rec.monthly_pf,
      employer_contribution: rec.monthly_pf,
      total: rec.monthly_pf * 2,
      is_paid: true
    }));

    return {
      found: true,
      source: "EPFO Unified Member Portal",
      uan: cleanedUAN,
      member_name: rec.member_name,
      name_verified_in_epfo: nameMatches,
      employer_epf_code: rec.employer_epf_code,
      employer_name: rec.employer_name,
      account_status: rec.account_status,
      monthly_pf_employee: rec.monthly_pf,
      monthly_pf_employer: rec.monthly_pf,
      epfo_derived_basic_salary: rec.basic_salary,
      epfo_derived_annual_basic: rec.annual_basic,
      pf_history_last6months: pfHistory,
      consistently_paid: true,
      average_monthly_pf: rec.monthly_pf,
      flag: !nameMatches ? "EPFO_MEMBER_NAME_MISMATCH" : null,
      note: nameMatches
        ? `Employee ${rec.member_name} verified with active PF contribution (₹${rec.monthly_pf}/mo) at ${rec.employer_name}.`
        : `UAN ${cleanedUAN} is registered to '${rec.member_name}' in EPFO records, not '${employeeName}'.`
    };
  }

  // ── 2. Fallback: Seeded Generator for any other valid 12-digit UAN ────────
  const hash = seededRand(cleanedUAN + (employerEPFCode || "") + (employeeName || "").toLowerCase());

  if (hash % 100 >= 90) {
    return {
      found: false,
      source: "EPFO Unified Member Portal",
      uan: cleanedUAN,
      flag: "UAN_NOT_IN_EPFO",
      note: "No PF record found for this UAN. Member not registered in EPFO or UAN is incorrect.",
      risk: "HIGH"
    };
  }

  const basicSalaryBrackets = [12000, 15000, 18000, 22000, 28000, 35000, 45000, 55000, 70000, 85000];
  const basicSalary = basicSalaryBrackets[hash % basicSalaryBrackets.length];
  const pfEmployee = Math.min(Math.round(basicSalary * 0.12), 1800);
  const nameMatch = employeeName ? (hash % 10 < 9) : true;
  const memberNameInDB = nameMatch ? employeeName : "Other Employee Name";

  const months = ["Feb 2026", "Jan 2026", "Dec 2025", "Nov 2025", "Oct 2025", "Sep 2025"];
  const pfHistory = months.map((m, i) => ({
    month: m,
    employee_contribution: pfEmployee,
    employer_contribution: pfEmployee,
    total: pfEmployee * 2,
    is_paid: (hash + i) % 10 !== 0
  }));

  return {
    found: true,
    source: "EPFO Unified Member Portal",
    uan: cleanedUAN,
    member_name: memberNameInDB,
    name_verified_in_epfo: nameMatch,
    employer_epf_code: employerEPFCode || `MH/PUN/${String(hash % 9999999).padStart(7, "0")}/000`,
    account_status: "ACTIVE",
    monthly_pf_employee: pfEmployee,
    monthly_pf_employer: pfEmployee,
    epfo_derived_basic_salary: basicSalary,
    epfo_derived_annual_basic: basicSalary * 12,
    pf_history_last6months: pfHistory,
    consistently_paid: pfHistory.filter(h => h.is_paid).length >= 5,
    average_monthly_pf: pfEmployee,
    flag: !nameMatch ? "EPFO_MEMBER_NAME_MISMATCH" : null,
    note: nameMatch
      ? "Employee name and active PF contribution records verified in EPFO database."
      : "UAN exists but is registered to a different employee name in EPFO database."
  };
}

/**
 * crossCheckSalaryWithEPFO(claimedBasicSalary, claimedMonthlySalary, uan, epfCode)
 * ─────────────────────────────────────────────────────────────────────────────
 * THE KEY ANTI-TAMPERING FUNCTION.
 *
 * Compares claimed salary from uploaded salary slip against EPFO records.
 * Since EPFO records are government-controlled and immutable, any discrepancy
 * indicates the salary slip has been edited.
 *
 * @param {number} claimedBasicSalary   - Basic salary on uploaded salary slip
 * @param {number} claimedMonthlySalary - Total monthly salary on slip
 * @param {string} uan                  - Employee UAN (from salary slip or form)
 * @param {string} epfCode              - Employer EPF code
 *
 * @returns {Object} Cross-check result with fraud indicators
 */
function crossCheckSalaryWithEPFO(claimedBasicSalary, claimedMonthlySalary, uan, epfCode, employeeName) {
  const epfoRecord = lookupEPFOByUAN(uan, epfCode, employeeName);

  if (!epfoRecord.found) {
    return {
      cross_check_possible: false,
      epfo_found: false,
      name_verified: false,
      risk: epfoRecord.risk || "HIGH",
      flag: epfoRecord.flag || "UAN_NOT_FOUND_IN_EPFO",
      note: epfoRecord.note,
      recommendation: "EPFO verification failed: UAN not found or not provided. AI auto-approval blocked — sent to officer for manual verification."
    };
  }

  if (!epfoRecord.name_verified_in_epfo) {
    return {
      cross_check_possible: true,
      epfo_found: true,
      name_verified: false,
      tampering_detected: true,
      risk: "HIGH",
      flag: "EPFO_EMPLOYEE_NAME_MISMATCH",
      note: `UAN ${uan} belongs to '${epfoRecord.member_name}' in EPFO records, which does not match applicant '${employeeName}'. Possible identity impersonation.`,
      recommendation: "REJECT / OFFICER_REVIEW"
    };
  }

  const epfoBasic = epfoRecord.epfo_derived_basic_salary;
  const flags = [];
  let tamperingDetected = false;
  let confidenceInSlip = 100;

  // ── Primary Check: Claimed basic vs EPFO-derived basic ────────────────────
  if (claimedBasicSalary) {
    const basicVariance = Math.abs(claimedBasicSalary - epfoBasic) / epfoBasic;

    if (basicVariance > 0.15) {
      // > 15% variance = significant mismatch
      tamperingDetected = true;
      flags.push({
        flag: "EPFO_BASIC_SALARY_MISMATCH",
        severity: basicVariance > 0.50 ? "CRITICAL" : "HIGH",
        claimed_basic: claimedBasicSalary,
        epfo_derived_basic: epfoBasic,
        variance_percent: (basicVariance * 100).toFixed(1) + "%",
        implication: basicVariance > 0.50
          ? `Salary slip shows basic ₹${claimedBasicSalary.toLocaleString("en-IN")} but EPFO records show actual basic ~₹${epfoBasic.toLocaleString("en-IN")}. Likely TAMPERED.`
          : `Minor variance in basic salary. Possible salary revision not yet reflected in EPFO.`
      });
      confidenceInSlip -= basicVariance > 0.50 ? 60 : 30;
    }
  }

  // ── Secondary Check: PF deduction on slip vs EPFO records ─────────────────
  // If salary slip shows a PF deduction, it should match EPFO records
  // (because EPFO records what was actually deposited by employer)
  const expectedPFFromClaimed = claimedBasicSalary
    ? Math.min(Math.round(claimedBasicSalary * 0.12), 1800)
    : null;

  if (expectedPFFromClaimed && epfoRecord.monthly_pf_employee) {
    const pfVariance = Math.abs(expectedPFFromClaimed - epfoRecord.monthly_pf_employee);
    if (pfVariance > 200) {
      // PF amount mismatch > ₹200
      tamperingDetected = true;
      flags.push({
        flag: "PF_CONTRIBUTION_MISMATCH_WITH_EPFO",
        severity: "HIGH",
        pf_from_claimed_basic: expectedPFFromClaimed,
        pf_in_epfo_records: epfoRecord.monthly_pf_employee,
        variance: pfVariance,
        implication: `If claimed basic is ₹${claimedBasicSalary?.toLocaleString("en-IN")}, PF should be ₹${expectedPFFromClaimed}. But EPFO records show employer deposited ₹${epfoRecord.monthly_pf_employee}. These should be identical — discrepancy suggests fraudulent basic salary on slip.`
      });
      confidenceInSlip -= 40;
    }
  }

  // ── Tertiary Check: Gross monthly salary reasonability vs EPFO basic ───────
  if (claimedMonthlySalary && epfoBasic) {
    // Gross typically = Basic + HRA (40-50% of basic) + allowances
    // Usually Gross = 1.5x to 2.5x of basic
    const grossToBasicRatio = claimedMonthlySalary / epfoBasic;
    if (grossToBasicRatio < 1.0) {
      flags.push({
        flag: "GROSS_LESS_THAN_BASIC_IMPOSSIBLE",
        severity: "CRITICAL",
        claimed_gross: claimedMonthlySalary,
        epfo_basic: epfoBasic,
        implication: "Gross salary cannot be less than basic salary. Document is mathematically impossible."
      });
      tamperingDetected = true;
      confidenceInSlip -= 70;
    } else if (grossToBasicRatio > 4.0) {
      flags.push({
        flag: "GROSS_TO_BASIC_RATIO_SUSPICIOUS",
        severity: "MEDIUM",
        ratio: grossToBasicRatio.toFixed(2),
        implication: `Gross salary is ${grossToBasicRatio.toFixed(1)}× the basic salary. Unusual — typically 1.5×-2.5×. Possible inflation of allowances.`
      });
      confidenceInSlip -= 15;
    }
  }

  return {
    cross_check_possible: true,
    epfo_found: true,
    name_verified: epfoRecord.name_verified_in_epfo,
    uan,
    tampering_detected: tamperingDetected,
    confidence_in_slip: Math.max(0, confidenceInSlip),
    epfo_verified_basic: epfoBasic,
    epfo_verified_annual_basic: epfoBasic * 12,
    pf_history_consistent: epfoRecord.consistently_paid,
    flags,
    epfo_record: {
      member_name: epfoRecord.member_name,
      monthly_pf_deposited: epfoRecord.monthly_pf_employee,
      employer_code: epfoRecord.employer_epf_code,
      account_status: epfoRecord.account_status
    },
    verdict: tamperingDetected
      ? `⚠️ SALARY SLIP LIKELY TAMPERED: EPFO records show actual basic salary ~₹${epfoBasic.toLocaleString("en-IN")}/month (₹${(epfoBasic * 12).toLocaleString("en-IN")}/year) which does not match the claimed figure.`
      : `✅ Salary slip consistent with EPFO records. Basic salary claim is credible.`,
    recommendation: tamperingDetected
      ? (flags.some(f => f.severity === "CRITICAL") ? "REJECT" : "OFFICER_REVIEW")
      : "PROCEED"
  };
}

module.exports = {
  validateUAN,
  lookupEPFOByUAN,
  crossCheckSalaryWithEPFO
};
