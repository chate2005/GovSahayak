/**
 * mockUidaiVault.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulated UIDAI e-KYC Vault API for GovSahayak (RAG-LLM Architecture).
 *
 * Real-World Equivalent: UIDAI e-KYC Vault — a government-secured biometric /
 * OTP-based e-KYC system that directly verifies Aadhaar demographics from the
 * UIDAI central database using official government API licenses.
 *
 * Project Simulation: This module simulates the e-KYC response by:
 *  1. Validating Aadhaar format using Verhoeff checksum algorithm.
 *  2. Generating deterministic mock demographic data seeded from the Aadhaar number.
 *  3. Returning structured e-KYC verification flags (NAME_MATCH, ADDRESS_HASH, etc.)
 *     in the same format a real UIDAI API would return.
 *
 * Why we can't use the real API:
 *  - Requires official UIDAI/MeitY license (restricted to government agencies).
 *  - Requires registered sub-AUA/AUA entity and biometric hardware.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto = require("crypto");

// ─── Verhoeff checksum tables ──────────────────────────────────────────────
const VERHOEFF_D = [
  [0,1,2,3,4,5,6,7,8,9],[1,2,3,4,0,6,7,8,9,5],[2,3,4,0,1,7,8,9,5,6],
  [3,4,0,1,2,8,9,5,6,7],[4,0,1,2,3,9,5,6,7,8],[5,9,8,7,6,0,4,3,2,1],
  [6,5,9,8,7,1,0,4,3,2],[7,6,5,9,8,2,1,0,4,3],[8,7,6,5,9,3,2,1,0,4],
  [9,8,7,6,5,4,3,2,1,0]
];
const VERHOEFF_P = [
  [0,1,2,3,4,5,6,7,8,9],[1,5,7,6,2,8,3,0,9,4],[5,8,0,3,7,9,6,1,4,2],
  [8,9,1,6,0,4,3,5,2,7],[9,4,5,3,1,2,6,8,7,0],[4,2,8,6,5,7,3,9,0,1],
  [2,7,9,3,8,0,6,4,1,5],[7,0,4,6,9,1,3,2,5,8]
];

function verhoeffValidate(num) {
  const digits = num.toString().replace(/\s/g, "").split("").reverse().map(Number);
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][digits[i]]];
  }
  return c === 0;
}

// ─── Mock demographic seed database (simulates UIDAI vault records) ────────
// In real UIDAI: Records fetched from encrypted central biometric DB.
// Here: Deterministic pseudo-random generation seeded from Aadhaar number.

const MOCK_STATES = [
  "Maharashtra", "Gujarat", "Karnataka", "Tamil Nadu", "Delhi",
  "Uttar Pradesh", "Rajasthan", "West Bengal", "Bihar", "Telangana"
];
const MOCK_DISTRICTS = {
  Maharashtra: ["Mumbai", "Pune", "Nagpur", "Thane", "Nashik"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Gandhinagar"],
  Karnataka: ["Bengaluru Urban", "Mysuru", "Hubballi-Dharwad", "Belagavi", "Mangaluru"],
  "Tamil Nadu": ["Chennai", "Coimbatore", "Madurai", "Tiruchirappalli", "Salem"],
  Delhi: ["New Delhi", "North Delhi", "South Delhi", "East Delhi", "West Delhi"],
  "Uttar Pradesh": ["Lucknow", "Kanpur Nagar", "Agra", "Varanasi", "Allahabad"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer"],
  "West Bengal": ["Kolkata", "Howrah", "Murshidabad", "Bardhaman", "Nadia"],
  Bihar: ["Patna", "Gaya", "Muzaffarpur", "Bhagalpur", "Darbhanga"],
  Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Khammam", "Karimnagar"]
};

function seededRandom(seed) {
  // Simple deterministic LCG seeded from string
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(h);
}

function generateMockDemographics(aadhaarNumber) {
  const cleaned = aadhaarNumber.replace(/\s/g, "");
  const seed = seededRandom(cleaned);
  const stateIndex = seed % MOCK_STATES.length;
  const state = MOCK_STATES[stateIndex];
  const districts = MOCK_DISTRICTS[state];
  const districtIndex = seededRandom(cleaned + "district") % districts.length;
  const district = districts[districtIndex];

  const dobYear = 1970 + (seed % 35);
  const dobMonth = (seededRandom(cleaned + "month") % 12) + 1;
  const dobDay = (seededRandom(cleaned + "day") % 28) + 1;
  const dob = `${String(dobDay).padStart(2,"0")}/${String(dobMonth).padStart(2,"0")}/${dobYear}`;

  const firstNames = ["Rajesh","Sunita","Avinash","Priya","Mohan","Lakshmi","Suresh","Anita","Ramesh","Kavita"];
  const lastNames = ["Sharma","Patil","Kumar","Gupta","Singh","Rao","Verma","Nair","Mehta","Joshi"];
  const firstName = firstNames[seededRandom(cleaned + "fname") % firstNames.length];
  const lastName = lastNames[seededRandom(cleaned + "lname") % lastNames.length];

  const houseNo = `${seededRandom(cleaned + "house") % 999 + 1}`;
  const streets = ["Gandhi Nagar", "Nehru Road", "MG Road", "Tilak Nagar", "Shivaji Colony"];
  const street = streets[seededRandom(cleaned + "street") % streets.length];

  const pinBase = { Maharashtra:"400", Gujarat:"380", Karnataka:"560", "Tamil Nadu":"600",
    Delhi:"110", "Uttar Pradesh":"226", Rajasthan:"302", "West Bengal":"700", Bihar:"800", Telangana:"500" };
  const pin = `${pinBase[state] || "400"}${String(seededRandom(cleaned + "pin") % 1000).padStart(3,"0")}`;

  return { firstName, lastName, fullName:`${firstName} ${lastName}`, dob, state, district, houseNo, street, pin };
}

/**
 * verifyEkyc(aadhaarNumber, submittedData)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates UIDAI e-KYC vault verification.
 *
 * @param {string} aadhaarNumber - 12-digit Aadhaar number (with or without spaces)
 * @param {Object} submittedData - Data submitted by applicant for cross-verification
 *   @param {string} [submittedData.name]     - Applicant name (from form / OCR)
 *   @param {string} [submittedData.dob]      - Date of birth DD/MM/YYYY
 *   @param {string} [submittedData.state]    - State of residence
 *   @param {string} [submittedData.district] - District
 *   @param {string} [submittedData.pin]      - PIN code
 *
 * @returns {Object} e-KYC result:
 *   {
 *     success: true,
 *     aadhaar_verified: true,           // Aadhaar number is valid format
 *     name_match: "EXACT"|"FUZZY"|"FAIL",
 *     address_hash: "<sha256 of mock address>",
 *     dob_match: true|false,
 *     state_match: true|false,
 *     uidai_verified: true|false,       // Overall UIDAI e-KYC pass/fail
 *     vault_record: { ...mock demographics },
 *     ekYC_flags: [...],                // Array of flag strings
 *     confidence_boost: <number>        // Confidence points to add if verified
 *   }
 */
async function verifyEkyc(aadhaarNumber, submittedData = {}) {
  const cleaned = (aadhaarNumber || "").replace(/\s/g, "");

  // ── Validate Aadhaar format ────────────────────────────────────────────
  if (!/^\d{12}$/.test(cleaned)) {
    return {
      success: false,
      uidai_verified: false,
      error: "Invalid Aadhaar format — must be exactly 12 digits.",
      ekYC_flags: ["AADHAAR_FORMAT_INVALID"],
      vault_record: null
    };
  }
  if (cleaned[0] === "0" || cleaned[0] === "1") {
    return {
      success: false,
      uidai_verified: false,
      error: "Aadhaar number cannot start with 0 or 1.",
      ekYC_flags: ["AADHAAR_FORMAT_INVALID"],
      vault_record: null
    };
  }
  if (!verhoeffValidate(cleaned)) {
    return {
      success: false,
      uidai_verified: false,
      error: "Aadhaar checksum validation failed.",
      ekYC_flags: ["AADHAAR_CHECKSUM_FAIL"],
      vault_record: null
    };
  }

  // ── Generate mock vault record (simulates real UIDAI DB lookup) ─────────
  const vault = generateMockDemographics(cleaned);
  const ekYC_flags = [];
  let confidenceBoost = 0;

  // ADDRESS_HASH: SHA256 of vault address (real UIDAI returns encrypted hash)
  const addressString = `${vault.houseNo},${vault.street},${vault.district},${vault.state},${vault.pin}`;
  const addressHash = crypto.createHash("sha256").update(addressString).digest("hex");

  // ── Name Match ─────────────────────────────────────────────────────────
  let nameMatch = "NOT_PROVIDED";
  if (submittedData.name) {
    const submitted = submittedData.name.toLowerCase().trim().replace(/\s+/g, " ");
    const vaultName = vault.fullName.toLowerCase().trim();

    // Exact match
    if (submitted === vaultName) {
      nameMatch = "EXACT";
      confidenceBoost += 15;
    } else {
      // Partial / fuzzy: check if major tokens match
      const submittedTokens = submitted.split(" ");
      const vaultTokens = vaultName.split(" ");
      const commonTokens = submittedTokens.filter(t => t.length > 1 && vaultTokens.includes(t));
      const matchRatio = commonTokens.length / Math.max(submittedTokens.length, vaultTokens.length);

      if (matchRatio >= 0.5) {
        nameMatch = "FUZZY";
        confidenceBoost += 8;
      } else {
        nameMatch = "FAIL";
        ekYC_flags.push("UIDAI_NAME_MISMATCH");
      }
    }
  }

  // ── DOB Match ──────────────────────────────────────────────────────────
  let dobMatch = false;
  if (submittedData.dob) {
    dobMatch = submittedData.dob === vault.dob;
    if (dobMatch) confidenceBoost += 10;
    else ekYC_flags.push("UIDAI_DOB_MISMATCH");
  }

  // ── State Match ────────────────────────────────────────────────────────
  let stateMatch = false;
  if (submittedData.state) {
    stateMatch = submittedData.state.toLowerCase().trim() === vault.state.toLowerCase().trim();
    if (stateMatch) confidenceBoost += 5;
    else ekYC_flags.push("UIDAI_STATE_MISMATCH");
  }

  // ── Overall UIDAI verification result ─────────────────────────────────
  const uidaiVerified = nameMatch !== "FAIL" && ekYC_flags.length === 0;

  return {
    success: true,
    aadhaar_verified: true,
    name_match: nameMatch,
    address_hash: addressHash,
    dob_match: dobMatch,
    state_match: stateMatch,
    uidai_verified: uidaiVerified,
    vault_record: {
      masked_aadhaar: `XXXX-XXXX-${cleaned.slice(-4)}`,
      full_name: vault.fullName,
      dob: vault.dob,
      state: vault.state,
      district: vault.district,
      pin: vault.pin
    },
    ekYC_flags,
    confidence_boost: confidenceBoost,
    // Real UIDAI also returns OTP reference for audit
    audit_txn_id: `MOCK-UIDAI-${Date.now()}-${cleaned.slice(-4)}`
  };
}

/**
 * getMaskedVaultRecord(aadhaarNumber)
 * Returns just the masked vault record without full e-KYC verification.
 * Used for display / audit report purposes.
 */
function getMaskedVaultRecord(aadhaarNumber) {
  const cleaned = (aadhaarNumber || "").replace(/\s/g, "");
  if (!/^\d{12}$/.test(cleaned)) return null;
  const vault = generateMockDemographics(cleaned);
  return {
    masked_aadhaar: `XXXX-XXXX-${cleaned.slice(-4)}`,
    full_name: vault.fullName,
    dob: vault.dob,
    state: vault.state,
    district: vault.district,
    pin: vault.pin
  };
}

module.exports = { verifyEkyc, getMaskedVaultRecord };
