/**
 * mockResidencyVerificationPortal.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Source Residency Document Authentication for Domicile Certificate
 *
 * KEY QUESTION: "How do we know someone actually lived in Maharashtra for
 * the claimed duration and didn't just fabricate documents?"
 *
 * Documents accepted as Address Proof / Residency Proof:
 *   1. Electricity Bill (MSEB/DISCOM portal)
 *   2. Property Tax Receipt (BMC/PMC/Municipal Corporation)
 *   3. Ration Card (State PDS — Public Distribution System)
 *   4. Voter ID (ECI — Election Commission of India)
 *   5. Driving License (SARATHI — MoRTH portal)
 *   6. Registered Rent Agreement (State Registration Dept)
 *   7. School Leaving Certificate (State Board / CBSE)
 *
 * Anti-Fraud Logic:
 *   A. Duration Check: Document issue year → years since issuance
 *      If claimed 20 years stay but electricity connection made 3 years ago → FRAUD
 *   B. Name Match: Name on document vs Aadhaar name
 *   C. Address Match: State/District on document vs claimed state/district
 *   D. Document Freshness: Address proof must be recent (< 3 months old)
 *   E. Cross-Document Consistency: All 3 documents must show SAME address
 *   F. PIN Code State Check: PIN must belong to claimed state
 *
 * Real Production Equivalent:
 *   - MSEB: https://www.mahadiscom.in/consumer/
 *   - BESCOM/State DISCOMs: State electricity board portals
 *   - BMC Property Tax: https://mcgm.gov.in/irj/portal/anonymous
 *   - PDS/Ration: https://mahafood.gov.in/
 *   - EPIC (Voter ID): https://electoralsearch.eci.gov.in/
 *   - SARATHI (DL): https://sarathi.parivahan.gov.in/
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─────────────────────────────────────────────────────────────────────────────
// PIN Code → State Mapping (India)
// ─────────────────────────────────────────────────────────────────────────────

// PIN code ranges per state (first 2-3 digits)
const PIN_STATE_MAP = {
  "40": "Maharashtra", "41": "Maharashtra", "42": "Maharashtra",
  "43": "Maharashtra", "44": "Maharashtra",
  "38": "Gujarat", "39": "Gujarat",
  "56": "Karnataka", "57": "Karnataka", "58": "Karnataka",
  "60": "Tamil Nadu", "61": "Tamil Nadu", "62": "Tamil Nadu",
  "63": "Tamil Nadu", "64": "Tamil Nadu",
  "50": "Telangana", "51": "Telangana", "52": "Andhra Pradesh",
  "53": "Andhra Pradesh",
  "11": "Delhi",
  "70": "West Bengal", "71": "West Bengal", "72": "West Bengal",
  "73": "West Bengal",
  "30": "Rajasthan", "31": "Rajasthan", "32": "Rajasthan",
  "33": "Rajasthan", "34": "Rajasthan",
  "20": "Uttar Pradesh", "21": "Uttar Pradesh", "22": "Uttar Pradesh",
  "23": "Uttar Pradesh", "24": "Uttar Pradesh", "25": "Uttar Pradesh",
  "26": "Uttar Pradesh", "27": "Uttar Pradesh", "28": "Uttar Pradesh",
  "48": "Madhya Pradesh", "47": "Madhya Pradesh", "46": "Madhya Pradesh",
  "45": "Madhya Pradesh",
  "13": "Punjab", "14": "Punjab",
  "15": "Haryana", "12": "Haryana",
  "16": "Himachal Pradesh",
};

/**
 * getPINState(pinCode)
 * Determines which state a PIN code belongs to.
 */
function getPINState(pinCode) {
  if (!pinCode) return null;
  const pin = String(pinCode).replace(/\s/g, "");
  if (pin.length !== 6 || !/^\d{6}$/.test(pin)) return null;

  // Check 2-digit prefix
  const prefix2 = pin.substring(0, 2);
  if (PIN_STATE_MAP[prefix2]) return PIN_STATE_MAP[prefix2];

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded Random
// ─────────────────────────────────────────────────────────────────────────────
function seededRand(seed) {
  let s = 0;
  for (let i = 0; i < seed.length; i++) {
    s = Math.imul(31, s) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ELECTRICITY BILL — DISCOM/MSEB Portal Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyElectricityBill(consumerNumber, consumerName, state, district)
 *
 * Real: MSEB (Maharashtra State Electricity Distribution Company)
 *   Consumer Number → fetch consumer name, address, connection date, tariff
 *   Consumer connection date = PROOF of residency from that year
 *   If connection was made in 2005 → 20 years of residency proof!
 *
 * Anti-tampering: Consumer number is linked to a specific address.
 *   Editing the bill image doesn't change the MSEB database record.
 */
function verifyElectricityBill(consumerNumber, consumerName, state, district) {
  if (!consumerNumber || consumerNumber.trim().length < 6) {
    return {
      verified: false,
      source: "MSEB / State DISCOM Portal",
      flag: "CONSUMER_NUMBER_MISSING_OR_TOO_SHORT",
      risk: "HIGH",
      note: "Electricity bill consumer number not provided or unreadable from OCR."
    };
  }

  const hash = seededRand((consumerNumber || "") + (state || "").toLowerCase());

  // 88% records found (most genuine bills have valid consumer numbers)
  if (hash % 100 >= 88) {
    return {
      verified: false,
      source: "MSEB / State DISCOM Portal",
      consumer_number: consumerNumber,
      flag: "CONSUMER_NOT_FOUND_IN_DISCOM",
      risk: "HIGH",
      note: "Consumer number not found in electricity board database. Bill may be fabricated or consumer number misread by OCR."
    };
  }

  // Deterministic consumer data
  const connectionYears = [2, 3, 5, 7, 10, 12, 15, 18, 20, 22];
  const yearsConnected = connectionYears[hash % connectionYears.length];
  const connectionYear = new Date().getFullYear() - yearsConnected;

  // Name match check
  const consumerNameFromDB = (consumerName || "").split(" ")[0]; // First token match
  const nameMatchScore = consumerName ? (hash % 10 < 8 ? "MATCH" : "MISMATCH") : "NOT_VERIFIED";

  // State match (does the consumer's address state match claimed state?)
  const stateInDB = hash % 10 < 9 ? (state || "Maharashtra") : "Other State";
  const stateMatch = stateInDB === (state || "Maharashtra");

  return {
    verified: true,
    source: "MSEB / State DISCOM Portal",
    consumer_number: consumerNumber,
    connection_status: "ACTIVE",
    connection_year: connectionYear,
    years_since_connection: yearsConnected,
    // KEY RESIDENCY TRUTH SIGNAL:
    residency_proof_since: `${connectionYear} (${yearsConnected} years)`,
    consumer_name_match: nameMatchScore,
    state_on_record: stateInDB,
    state_matches_claim: stateMatch,
    district_on_record: stateMatch ? (district || "Pune") : "Other District",
    flag: !stateMatch ? "ELECTRICITY_BILL_STATE_MISMATCH" :
          nameMatchScore === "MISMATCH" ? "ELECTRICITY_BILL_NAME_MISMATCH" : null,
    risk: !stateMatch ? "HIGH" : nameMatchScore === "MISMATCH" ? "MEDIUM" : "LOW",
    note: `Connection active since ${connectionYear}. This proves minimum ${yearsConnected} years of residency at this address.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROPERTY TAX — Municipal Corporation Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyPropertyTaxReceipt(propertyId, ownerName, state, district)
 *
 * Real: BMC (Brihanmumbai Municipal Corporation) / PMC (Pune Municipal Corp)
 *   Property ID → owner name, address, tax history, property registration year
 *   Property ownership from 2003 → 22+ years of residency evidence!
 *
 * Anti-tampering: Property records are in municipal database.
 *   Photoshopping a property tax receipt doesn't change BMC database.
 */
function verifyPropertyTaxReceipt(propertyId, ownerName, state, district) {
  if (!propertyId || propertyId.trim().length < 4) {
    return {
      verified: false,
      source: "Municipal Corporation Property Tax Portal",
      flag: "PROPERTY_ID_NOT_FOUND_IN_OCR",
      risk: "MEDIUM",
      note: "Property ID not extractable from document OCR. Manual verification needed."
    };
  }

  const hash = seededRand((propertyId || "") + (ownerName || "").toLowerCase());

  if (hash % 100 >= 82) {
    return {
      verified: false,
      source: "Municipal Corporation Property Tax Portal",
      property_id: propertyId,
      flag: "PROPERTY_ID_NOT_IN_MUNICIPAL_DB",
      risk: "HIGH",
      note: "Property ID not found in municipal database. Receipt may be fabricated."
    };
  }

  const registrationYears = [1998, 2000, 2003, 2005, 2008, 2010, 2012, 2015, 2018, 2020];
  const regYear = registrationYears[hash % registrationYears.length];
  const yearsOwned = new Date().getFullYear() - regYear;

  const ownerMatch = ownerName ? (hash % 10 < 7 ? "MATCH" : "MISMATCH") : "NOT_VERIFIED";
  const stateMatch = hash % 10 < 9;

  return {
    verified: true,
    source: "Municipal Corporation Property Tax Portal",
    property_id: propertyId,
    property_registration_year: regYear,
    years_owned: yearsOwned,
    // KEY RESIDENCY TRUTH SIGNAL:
    residency_proof_since: `${regYear} (${yearsOwned} years of ownership)`,
    tax_payment_status: hash % 10 < 8 ? "UP_TO_DATE" : "DUES_PENDING",
    owner_name_match: ownerMatch,
    state_match: stateMatch,
    corporation: district?.toLowerCase().includes("mumbai") ? "BMC" :
                 district?.toLowerCase().includes("pune") ? "PMC" :
                 `${district} Municipal Corporation`,
    flag: !stateMatch ? "PROPERTY_TAX_STATE_MISMATCH" :
          ownerMatch === "MISMATCH" ? "PROPERTY_OWNER_NAME_MISMATCH" : null,
    risk: !stateMatch ? "HIGH" : ownerMatch === "MISMATCH" ? "MEDIUM" : "LOW"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. RATION CARD — State PDS Database Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyRationCard(rationCardNumber, holderName, state)
 *
 * Real: Maharashtra PDS Portal (mahafood.gov.in)
 *   Card Number → holder name, address, family members, issue date, card type
 *   Ration Card issued in 2001 → 24 years of residency evidence!
 *
 * Anti-tampering: PDS is state-controlled database.
 *   Editing ration card image → card number won't match state database.
 */
function verifyRationCard(rationCardNumber, holderName, state) {
  if (!rationCardNumber) {
    return {
      verified: false,
      source: "State PDS / Ration Card Portal",
      flag: "RATION_CARD_NUMBER_MISSING",
      risk: "MEDIUM"
    };
  }

  const hash = seededRand((rationCardNumber || "") + (state || "").toLowerCase());

  if (hash % 100 >= 90) {
    return {
      verified: false,
      source: "State PDS / Ration Card Portal",
      ration_card_number: rationCardNumber,
      flag: "RATION_CARD_NOT_IN_PDS_DATABASE",
      risk: "HIGH",
      note: "Ration card number not found in state PDS database. Card may be fabricated."
    };
  }

  const issueYears = [1995, 1998, 2001, 2004, 2007, 2010, 2013, 2016, 2019, 2022];
  const issueYear = issueYears[hash % issueYears.length];
  const yearsActive = new Date().getFullYear() - issueYear;
  const cardTypes = ["APL", "BPL", "Antyodaya", "Priority Household"];
  const cardType = cardTypes[hash % cardTypes.length];
  const holderMatch = holderName ? (hash % 10 < 8 ? "MATCH" : "MISMATCH") : "NOT_VERIFIED";

  return {
    verified: true,
    source: "State PDS / Ration Card Portal",
    ration_card_number: rationCardNumber,
    card_type: cardType,
    issue_year: issueYear,
    years_active: yearsActive,
    // KEY RESIDENCY TRUTH SIGNAL:
    residency_proof_since: `${issueYear} (${yearsActive} years registered in state PDS)`,
    holder_name_match: holderMatch,
    state_on_record: state || "Maharashtra",
    family_members: 2 + (hash % 5),
    card_status: "ACTIVE",
    flag: holderMatch === "MISMATCH" ? "RATION_CARD_HOLDER_NAME_MISMATCH" : null,
    risk: holderMatch === "MISMATCH" ? "MEDIUM" : "LOW"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. VOTER ID (EPIC) — Election Commission Verification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyVoterID(epicNumber, voterName, state, district)
 *
 * Real: ECI EPIC Portal (electoralsearch.eci.gov.in)
 *   EPIC Number → name, address, constituency, enrollment date
 *   Voter enrollment date = residency proof at that address
 */
function verifyVoterID(epicNumber, voterName, state, district) {
  if (!epicNumber || epicNumber.length < 8) {
    return {
      verified: false,
      source: "ECI — Voter ID (EPIC) Portal",
      flag: "EPIC_NUMBER_NOT_READABLE",
      risk: "MEDIUM"
    };
  }

  // EPIC format: 2-3 letters + 7 digits e.g. MH/14/123/456789
  const epicRegex = /^[A-Z]{2,3}\d{7}$|^[A-Z]{2}\/\d+\/\d+\/\d+$/;
  if (!epicRegex.test(epicNumber.toUpperCase())) {
    return {
      verified: false,
      source: "ECI — Voter ID (EPIC) Portal",
      epic_number: epicNumber,
      flag: "EPIC_NUMBER_FORMAT_INVALID",
      risk: "HIGH",
      note: `EPIC number format invalid: ${epicNumber}. Expected format: XX1234567`
    };
  }

  const hash = seededRand((epicNumber || "").toUpperCase() + (state || ""));

  if (hash % 100 >= 85) {
    return {
      verified: false,
      source: "ECI — Voter ID (EPIC) Portal",
      flag: "EPIC_NOT_IN_ELECTORAL_ROLL",
      risk: "HIGH",
      note: "EPIC number not found in electoral rolls. Voter ID may be fabricated."
    };
  }

  const enrollmentYears = [2000, 2004, 2007, 2010, 2012, 2014, 2017, 2019, 2022];
  const enrollYear = enrollmentYears[hash % enrollmentYears.length];
  const nameMatch = voterName ? (hash % 10 < 8 ? "MATCH" : "MISMATCH") : "NOT_VERIFIED";

  // Verify state prefix in EPIC matches claimed state
  const statePrefixes = { "Maharashtra": "MH", "Gujarat": "GJ", "Karnataka": "KA",
    "Tamil Nadu": "TN", "Delhi": "DL" };
  const expectedPrefix = statePrefixes[state] || "";
  const epicStateMatch = expectedPrefix
    ? epicNumber.toUpperCase().startsWith(expectedPrefix)
    : true;

  return {
    verified: true,
    source: "ECI — Voter ID (EPIC) Portal",
    epic_number: epicNumber,
    enrollment_year: enrollYear,
    years_on_roll: new Date().getFullYear() - enrollYear,
    residency_proof_since: `${enrollYear} (voter enrolled at this address)`,
    voter_name_match: nameMatch,
    state_match: epicStateMatch,
    constituency: `${district || "Pune"} Assembly Constituency`,
    flag: !epicStateMatch ? "EPIC_STATE_MISMATCH_WITH_CLAIM" :
          nameMatch === "MISMATCH" ? "VOTER_ID_NAME_MISMATCH" : null,
    risk: !epicStateMatch ? "HIGH" : nameMatch === "MISMATCH" ? "MEDIUM" : "LOW"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. DRIVING LICENSE — SARATHI Portal (MoRTH)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyDrivingLicense(dlNumber, holderName, state)
 *
 * Real: SARATHI (parivahan.gov.in) — National DL database
 *   DL Number → name, DOB, address, issue date, validity, transport authority
 *   DL issued in state X = registered address in state X
 */
function verifyDrivingLicense(dlNumber, holderName, state) {
  if (!dlNumber) {
    return { verified: false, source: "SARATHI — MoRTH DL Portal", flag: "DL_NUMBER_MISSING" };
  }

  // DL Format: MH-14-20100012345 (State-RTO-Year-Number)
  const dlRegex = /^[A-Z]{2}-?\d{1,2}-?\d{4}-?\d{7}$|^[A-Z]{2}\d{13}$/;
  if (!dlRegex.test(dlNumber.toUpperCase().replace(/\s/g, ""))) {
    return {
      verified: false,
      source: "SARATHI — MoRTH DL Portal",
      dl_number: dlNumber,
      flag: "DL_FORMAT_INVALID",
      risk: "HIGH",
      note: `Invalid DL format: ${dlNumber}. Expected: MH-14-2010-0012345`
    };
  }

  const hash = seededRand(dlNumber.toUpperCase() + (holderName || ""));
  if (hash % 100 >= 85) {
    return {
      verified: false, source: "SARATHI — MoRTH DL Portal",
      flag: "DL_NOT_IN_SARATHI", risk: "HIGH",
      note: "DL number not found in SARATHI national database."
    };
  }

  // Extract state code from DL
  const dlState = dlNumber.toUpperCase().substring(0, 2);
  const stateFromDL = Object.entries({ MH: "Maharashtra", GJ: "Gujarat", KA: "Karnataka",
    TN: "Tamil Nadu", DL: "Delhi", UP: "Uttar Pradesh", RJ: "Rajasthan" })
    .find(([k]) => k === dlState)?.[1] || dlState;

  const issueYear = 2005 + (hash % 18);
  const nameMatch = holderName ? (hash % 10 < 8 ? "MATCH" : "MISMATCH") : "NOT_VERIFIED";
  const stateMatch = stateFromDL === (state || "Maharashtra");

  return {
    verified: true,
    source: "SARATHI — MoRTH DL Portal",
    dl_number: dlNumber,
    issue_year: issueYear,
    state_from_dl: stateFromDL,
    rto: `${stateFromDL} RTO`,
    holder_name_match: nameMatch,
    state_matches_claim: stateMatch,
    validity: `${issueYear + 20}`,
    flag: !stateMatch ? "DL_STATE_MISMATCH" : nameMatch === "MISMATCH" ? "DL_NAME_MISMATCH" : null,
    risk: !stateMatch ? "HIGH" : nameMatch === "MISMATCH" ? "MEDIUM" : "LOW",
    note: `DL issued ${issueYear} by ${stateFromDL} RTO. Confirms residency in ${stateFromDL} since at least ${issueYear}.`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. DURATION FRAUD DETECTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkResidencyDurationAuthenticity(claimedYears, documentResults, applicantName)
 *
 * THE KEY DOMICILE ANTI-FRAUD CHECK.
 *
 * Cross-references claimed years of stay against the OLDEST document's
 * connection/registration year. If documents only go back 5 years but
 * applicant claims 20 years → LIKELY FRAUD.
 *
 * @param {number} claimedYears     - Years of stay claimed on form
 * @param {Array}  documentResults  - Array of verification results from above functions
 */
function checkResidencyDurationAuthenticity(claimedYears, documentResults) {
  const flags = [];
  const provenYears = [];

  for (const doc of documentResults) {
    if (doc.verified) {
      // Extract proven years from each verified document
      if (doc.years_since_connection) provenYears.push(doc.years_since_connection);
      if (doc.years_owned) provenYears.push(doc.years_owned);
      if (doc.years_active) provenYears.push(doc.years_active);
      if (doc.years_on_roll) provenYears.push(doc.years_on_roll);
    }
  }

  if (provenYears.length === 0) {
    return {
      duration_verified: false,
      flags: ["NO_DOCUMENTS_VERIFIED_FOR_DURATION"],
      risk: "HIGH",
      note: "Cannot verify duration of stay — no documents successfully verified."
    };
  }

  // The BEST (oldest) document gives the maximum provable years
  const maxProvenYears = Math.max(...provenYears);
  const minProvenYears = Math.min(...provenYears);

  // Compare against claim
  const claimedVsProven = claimedYears - maxProvenYears;

  if (claimedYears > maxProvenYears + 3) {
    // Claiming significantly more years than any document proves
    flags.push({
      flag: "DURATION_OVERCLAIM",
      severity: claimedVsProven > 10 ? "CRITICAL" : "HIGH",
      claimed_years: claimedYears,
      max_document_proven_years: maxProvenYears,
      gap_years: claimedVsProven,
      implication: `Applicant claims ${claimedYears} years of stay, but the oldest verified document only proves ${maxProvenYears} years of connection to this address. Gap of ${claimedVsProven} years is unexplained.`
    });
  }

  // Check if ANY document proves minimum required (15 years or 10 for Clause 4.2)
  const proves15Years = maxProvenYears >= 15;
  const proves10Years = maxProvenYears >= 10;

  return {
    duration_verified: maxProvenYears >= 10,  // At least 10 years provable
    claimed_years: claimedYears,
    max_proven_years: maxProvenYears,
    min_proven_years: minProvenYears,
    proves_15_year_rule: proves15Years,
    proves_10_year_educational_exemption: proves10Years,
    flags,
    risk: flags.length === 0 ? "LOW" :
          flags.some(f => f.severity === "CRITICAL") ? "HIGH" : "MEDIUM",
    verdict: flags.length === 0
      ? `✅ Duration claim of ${claimedYears} years is supported by documents (oldest proves ${maxProvenYears} years).`
      : `⚠️ Duration claim of ${claimedYears} years exceeds what documents prove (${maxProvenYears} years max).`
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ADDRESS CROSS-DOCUMENT CONSISTENCY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * checkAddressConsistency(aadhaarOCR, addressProofOCR, residencyOCR, claimedState, claimedDistrict)
 *
 * Checks that ALL three uploaded documents show the SAME address.
 * A fraudster might use one genuine document and two edited ones —
 * but if addresses don't match across all three, tampering is detected.
 */
function checkAddressConsistency(aadhaarOCR, addressProofOCR, residencyOCR, claimedState, claimedDistrict, claimedPIN) {
  const flags = [];

  // State consistency check
  const states = [
    aadhaarOCR?.state?.toLowerCase(),
    addressProofOCR?.state?.toLowerCase(),
    residencyOCR?.state?.toLowerCase()
  ].filter(Boolean);

  const targetState = (claimedState || "maharashtra").toLowerCase();
  const stateMismatches = states.filter(s => !s.includes(targetState.substring(0, 5)));
  if (stateMismatches.length > 0) {
    flags.push({
      flag: "CROSS_DOCUMENT_STATE_MISMATCH",
      severity: "CRITICAL",
      claimed_state: claimedState,
      states_found: states,
      implication: `Documents show conflicting states. At least one document shows a different state from the claimed ${claimedState}. This is a strong indicator of document fraud.`
    });
  }

  // PIN Code state validation
  if (claimedPIN) {
    const pinState = getPINState(claimedPIN);
    if (pinState && pinState !== claimedState) {
      flags.push({
        flag: "PIN_CODE_STATE_MISMATCH",
        severity: "HIGH",
        pin_code: claimedPIN,
        pin_belongs_to: pinState,
        claimed_state: claimedState,
        implication: `PIN code ${claimedPIN} belongs to ${pinState}, not ${claimedState}. Applicant may be using a false address.`
      });
    }
  }

  // Address proof freshness check (should be < 3 months old)
  if (addressProofOCR?.issue_date) {
    const issueDate = new Date(addressProofOCR.issue_date);
    const monthsAgo = (new Date() - issueDate) / (1000 * 3600 * 24 * 30);
    if (monthsAgo > 3) {
      flags.push({
        flag: "ADDRESS_PROOF_OUTDATED",
        severity: "MEDIUM",
        issue_date: addressProofOCR.issue_date,
        months_old: Math.round(monthsAgo),
        implication: `Address proof (${Math.round(monthsAgo)} months old) exceeds the 3-month validity requirement for Maharashtra Domicile Certificate.`
      });
    }
  }

  return {
    is_consistent: flags.length === 0,
    flags,
    risk: flags.some(f => f.severity === "CRITICAL") ? "HIGH" :
          flags.some(f => f.severity === "HIGH") ? "MEDIUM" :
          flags.length > 0 ? "LOW" : "LOW"
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER FUNCTION — Full Domicile Document Authenticity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * verifyDomicileDocumentsAuthenticity(aadhaarOCR, addressProofOCR, residencyOCR, appData)
 * ─────────────────────────────────────────────────────────────────────────────
 * Runs all residency verification layers for a Domicile application.
 *
 * @param {Object} aadhaarOCR    - Extracted Aadhaar OCR data
 * @param {Object} addressProofOCR - Extracted address proof OCR data
 * @param {Object} residencyOCR  - Extracted residency proof OCR data
 * @param {Object} appData       - Application form data (state, district, pin, duration, name)
 */
async function verifyDomicileDocumentsAuthenticity(aadhaarOCR, addressProofOCR, residencyOCR, appData) {
  const report = {
    document_type: "Domicile Certificate — Address & Residency Proof",
    verification_layers: {},
    all_flags: [],
    overall_risk: "LOW",
    is_authentic: true,
    authenticity_score: 100,
    recommendation: "PROCEED"
  };

  const claimedState = appData.dc_state || "Maharashtra";
  const claimedDistrict = appData.dc_district || "";
  const claimedPIN = appData.dc_pin || "";
  const claimedYears = Number(appData.dc_duration_years) || 0;
  const applicantName = appData.dc_full_name || aadhaarOCR?.name || "";

  const docResults = [];

  // ── Verify Address Proof ──────────────────────────────────────────────────
  const docType = (addressProofOCR?.doc_type || "").toLowerCase();

  if (docType.includes("electric") || docType.includes("mseb") || docType.includes("bill")) {
    const r = verifyElectricityBill(
      addressProofOCR?.consumer_number || addressProofOCR?.bill_number,
      applicantName, claimedState, claimedDistrict
    );
    report.verification_layers.address_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }

  } else if (docType.includes("property") || docType.includes("tax")) {
    const r = verifyPropertyTaxReceipt(
      addressProofOCR?.property_id || addressProofOCR?.reference_number,
      applicantName, claimedState, claimedDistrict
    );
    report.verification_layers.address_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }

  } else if (docType.includes("voter") || docType.includes("epic")) {
    const r = verifyVoterID(
      addressProofOCR?.epic_number || addressProofOCR?.voter_id,
      applicantName, claimedState, claimedDistrict
    );
    report.verification_layers.address_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }

  } else if (docType.includes("driving") || docType.includes("license") || docType.includes("licence")) {
    const r = verifyDrivingLicense(
      addressProofOCR?.dl_number,
      applicantName, claimedState
    );
    report.verification_layers.address_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }
  }

  // ── Verify Residency Proof ────────────────────────────────────────────────
  const residencyType = (residencyOCR?.doc_type || "").toLowerCase();

  if (residencyType.includes("ration")) {
    const r = verifyRationCard(
      residencyOCR?.ration_card_number || residencyOCR?.card_number,
      applicantName, claimedState
    );
    report.verification_layers.residency_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }

  } else if (residencyType.includes("property") || residencyType.includes("tax")) {
    const r = verifyPropertyTaxReceipt(
      residencyOCR?.property_id || residencyOCR?.reference_number,
      applicantName, claimedState, claimedDistrict
    );
    report.verification_layers.residency_proof = r;
    docResults.push(r);
    if (r.flag) { report.all_flags.push(r.flag); report.authenticity_score -= r.risk === "HIGH" ? 30 : 15; }
  }

  // ── Duration Authenticity Check ───────────────────────────────────────────
  if (claimedYears > 0) {
    const durationCheck = checkResidencyDurationAuthenticity(claimedYears, docResults);
    report.verification_layers.duration_verification = durationCheck;
    if (durationCheck.flags.length > 0) {
      durationCheck.flags.forEach(f => {
        report.all_flags.push(f.flag);
        report.authenticity_score -= f.severity === "CRITICAL" ? 40 : 20;
      });
    }
  }

  // ── Cross-Document Address Consistency ────────────────────────────────────
  const consistencyCheck = checkAddressConsistency(
    aadhaarOCR, addressProofOCR, residencyOCR,
    claimedState, claimedDistrict, claimedPIN
  );
  report.verification_layers.address_consistency = consistencyCheck;
  if (!consistencyCheck.is_consistent) {
    consistencyCheck.flags.forEach(f => {
      report.all_flags.push(f.flag);
      report.authenticity_score -= f.severity === "CRITICAL" ? 35 : 15;
    });
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
    report.recommendation = "OFFICER_MANUAL_DOCUMENT_VERIFICATION";
  } else {
    report.overall_risk = "HIGH";
    report.is_authentic = false;
    report.recommendation = "REJECT_LIKELY_FRAUDULENT_DOCUMENTS";
  }

  return report;
}

module.exports = {
  verifyElectricityBill,
  verifyPropertyTaxReceipt,
  verifyRationCard,
  verifyVoterID,
  verifyDrivingLicense,
  checkResidencyDurationAuthenticity,
  checkAddressConsistency,
  verifyDomicileDocumentsAuthenticity,
  getPINState
};
