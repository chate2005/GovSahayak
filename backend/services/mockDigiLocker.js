/**
 * mockDigiLocker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulated DigiLocker / Government Issuer Repository API for GovSahayak.
 *
 * Real-World Equivalent: DigiLocker National API Gateway — Pulls legally verified
 * documents directly from issuer databases (Income Tax Dept, CBSE, State Boards,
 * Property Tax Departments, Ration Card Authorities) using the applicant's
 * Aadhaar-linked DigiLocker account.
 *
 * Project Simulation: Simulates cross-verification of reference IDs against
 * government issuer databases using deterministic seeded lookups. Returns
 * whether a document reference is authentic and matches the applicant's Aadhaar.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Simulated Issuer Databases ───────────────────────────────────────────
// In real DigiLocker: Each department maintains its own repository.
// Here: Deterministic seed-based generation to simulate lookup results.

const ISSUERS = {
  PROPERTY_TAX: "Municipal Corporation Property Tax Department",
  RATION_CARD: "State Civil Supplies Department (Ration Card Authority)",
  SCHOOL_LEAVING: "State Board of Secondary Education",
  BOARD_CERTIFICATE: "Maharashtra State Board (HSC/SSC)",
  ELECTRICITY_DEPT: "State Electricity Distribution Company",
  BIRTH_REGISTER: "Registrar of Births and Deaths",
  INCOME_TAX: "Income Tax Department of India",
};

/**
 * Deterministic seed hash for consistent mock responses.
 */
function seededHash(input) {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = Math.imul(33, h) ^ input.charCodeAt(i);
  }
  return Math.abs(h);
}

/**
 * verifyPropertyTaxDocument(referenceId, applicantAadhaarLast4)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates lookup in Municipal Property Tax Department.
 * Used for: Domicile Certificate residency proof cross-check.
 *
 * @param {string} referenceId - Property Tax Receipt/Account number
 * @param {string} applicantAadhaarLast4 - Last 4 digits of Aadhaar
 * @returns {Object} Verification result
 */
async function verifyPropertyTaxDocument(referenceId, applicantAadhaarLast4) {
  if (!referenceId || referenceId.length < 4) {
    return {
      verified: false,
      issuer: ISSUERS.PROPERTY_TAX,
      error: "Invalid property tax reference ID",
      flags: ["DIGILOCKER_PROPERTY_TAX_ID_INVALID"]
    };
  }

  // Known mock record for Lakshmi Patil (Aadhaar ending 0239)
  if (applicantAadhaarLast4 === "0239") {
    return {
      verified: true,
      issuer: ISSUERS.PROPERTY_TAX,
      reference_id: referenceId,
      record: {
        registration_year: 2005,
        years_on_record: new Date().getFullYear() - 2005,
        owner_aadhaar_last4: "0239",
        owner_name: "Lakshmi Patil",
        property_type: "Residential",
        city: "Pune",
        state: "Maharashtra"
      },
      aadhaar_match: true,
      flags: [],
      confidence_boost: 15
    };
  }

  const hash = seededHash(referenceId + applicantAadhaarLast4);
  // ~80% of valid reference IDs resolve to a real record
  const recordFound = hash % 10 < 8;
  // ~70% of found records match the Aadhaar
  const aadhaarMatches = recordFound && (hash % 10 < 7);

  if (!recordFound) {
    return {
      verified: false,
      issuer: ISSUERS.PROPERTY_TAX,
      reference_id: referenceId,
      error: "Property Tax reference ID not found in municipal records",
      flags: ["DIGILOCKER_PROPERTY_TAX_NOT_FOUND"]
    };
  }

  const registrationYear = 2000 + (hash % 23); // 2000–2023
  const yearsOld = new Date().getFullYear() - registrationYear;

  return {
    verified: aadhaarMatches,
    issuer: ISSUERS.PROPERTY_TAX,
    reference_id: referenceId,
    record: {
      registration_year: registrationYear,
      years_on_record: yearsOld,
      owner_aadhaar_last4: aadhaarMatches ? applicantAadhaarLast4 : "XXXX",
      property_type: hash % 3 === 0 ? "Residential" : hash % 3 === 1 ? "Commercial" : "Agricultural",
    },
    aadhaar_match: aadhaarMatches,
    flags: aadhaarMatches ? [] : ["DIGILOCKER_PROPERTY_TAX_OWNER_MISMATCH"],
    confidence_boost: aadhaarMatches ? 12 : 0
  };
}

/**
 * verifyRationCard(rationCardNumber, applicantName, applicantState)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates State Civil Supplies Department Ration Card database lookup.
 * Used for: Domicile Certificate address + residency proof.
 *
 * @param {string} rationCardNumber - Ration card number
 * @param {string} applicantName    - Applicant name for cross-check
 * @param {string} applicantState   - State of domicile application
 */
async function verifyRationCard(rationCardNumber, applicantName, applicantState) {
  if (!rationCardNumber || rationCardNumber.length < 6) {
    return {
      verified: false,
      issuer: ISSUERS.RATION_CARD,
      error: "Invalid ration card number",
      flags: ["DIGILOCKER_RATION_CARD_ID_INVALID"]
    };
  }

  const lowerName = (applicantName || "").toLowerCase();
  if (lowerName.includes("lakshmi") && lowerName.includes("patil")) {
    return {
      verified: true,
      issuer: ISSUERS.RATION_CARD,
      reference_id: rationCardNumber,
      record: {
        issuance_year: 2002,
        years_active: new Date().getFullYear() - 2002,
        state: "Maharashtra",
        district: "Pune",
        card_type: "APL",
        holder_name: "Lakshmi Patil",
        holder_name_match: true
      },
      name_match: true,
      flags: [],
      confidence_boost: 12
    };
  }

  const hash = seededHash(rationCardNumber + (applicantState || ""));
  const recordFound = hash % 10 < 9; // 90% chance record found
  const nameMatch = recordFound && (hash % 10 < 8); // 80% chance name matches
  const issuanceYear = 2000 + (hash % 24);
  const yearsActive = new Date().getFullYear() - issuanceYear;

  if (!recordFound) {
    return {
      verified: false,
      issuer: ISSUERS.RATION_CARD,
      error: "Ration Card not found in State Civil Supplies records",
      flags: ["DIGILOCKER_RATION_CARD_NOT_FOUND"]
    };
  }

  return {
    verified: nameMatch,
    issuer: ISSUERS.RATION_CARD,
    reference_id: rationCardNumber,
    record: {
      issuance_year: issuanceYear,
      years_active: yearsActive,
      state: applicantState || "Not Specified",
      card_type: hash % 3 === 0 ? "BPL" : hash % 3 === 1 ? "APL" : "Antyodaya",
      holder_name_match: nameMatch
    },
    name_match: nameMatch,
    flags: nameMatch ? [] : ["DIGILOCKER_RATION_CARD_NAME_MISMATCH"],
    confidence_boost: nameMatch ? 10 : 0
  };
}

/**
 * verifySchoolCertificate(certificateNumber, studentName, boardName)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates State Board SSC/HSC certificate verification.
 * Used for: Domicile Certificate 10-year exemption clause (Clause 4.2 —
 * if applicant studied in Maharashtra from 1st to 10th standard, the 15-year
 * residency rule is relaxed to 10 years).
 *
 * @param {string} certificateNumber - Board certificate / seat number
 * @param {string} studentName       - Student name for cross-check
 * @param {string} boardName         - Board name (CBSE / Maharashtra State Board etc.)
 */
async function verifySchoolCertificate(certificateNumber, studentName, boardName) {
  if (!certificateNumber || certificateNumber.length < 4) {
    return {
      verified: false,
      issuer: ISSUERS.BOARD_CERTIFICATE,
      error: "Invalid certificate number",
      flags: ["DIGILOCKER_BOARD_CERT_INVALID"]
    };
  }

  const lowerStudent = (studentName || "").toLowerCase();
  if (lowerStudent.includes("lakshmi") && lowerStudent.includes("patil")) {
    return {
      verified: true,
      issuer: ISSUERS.SCHOOL_LEAVING,
      reference_id: certificateNumber,
      record: {
        pass_year: 1986,
        years_since_pass: new Date().getFullYear() - 1986,
        board: "Maharashtra State Board of Secondary and Higher Secondary Education, Pune",
        certificate_type: "SSC (10th Standard)",
        student_name: "Lakshmi Patil",
        student_name_match: true,
        qualifies_for_educational_exemption: true
      },
      name_match: true,
      flags: [],
      educational_exemption_eligible: true,
      confidence_boost: 15
    };
  }

  const hash = seededHash(certificateNumber + (studentName || ""));
  const recordFound = hash % 10 < 8;
  const nameMatch = recordFound && (hash % 10 < 7);
  const passYear = 2000 + (hash % 25);

  if (!recordFound) {
    return {
      verified: false,
      issuer: ISSUERS.BOARD_CERTIFICATE,
      error: "Certificate number not found in Board records",
      flags: ["DIGILOCKER_BOARD_CERT_NOT_FOUND"]
    };
  }

  // Determine board — defaults to Maharashtra State Board
  const resolvedBoard = boardName || (hash % 2 === 0 ? "Maharashtra State Board" : "CBSE");
  // HSC (10+2) or SSC (10th)
  const certType = hash % 2 === 0 ? "SSC (10th Standard)" : "HSC (12th Standard)";

  return {
    verified: nameMatch,
    issuer: ISSUERS.SCHOOL_LEAVING,
    reference_id: certificateNumber,
    record: {
      pass_year: passYear,
      years_since_pass: new Date().getFullYear() - passYear,
      board: resolvedBoard,
      certificate_type: certType,
      student_name_match: nameMatch,
      // This field triggers Clause 4.2 Educational Exemption for Domicile
      qualifies_for_educational_exemption: resolvedBoard.toLowerCase().includes("maharashtra") && nameMatch
    },
    name_match: nameMatch,
    flags: nameMatch ? [] : ["DIGILOCKER_BOARD_CERT_NAME_MISMATCH"],
    educational_exemption_eligible: resolvedBoard.toLowerCase().includes("maharashtra") && nameMatch,
    confidence_boost: nameMatch ? 12 : 0
  };
}

/**
 * verifyBirthRegistration(registrationNumber, childName, dob, placeOfBirth)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates Registrar of Births & Deaths database lookup.
 * Used for: Birth Certificate — to verify original registration exists
 * (prevents fraudulent re-registration).
 *
 * @param {string} registrationNumber - Birth registration reference
 * @param {string} childName          - Child's full name
 * @param {string} dob                - Date of birth DD/MM/YYYY
 * @param {string} placeOfBirth       - Place of birth
 */
async function verifyBirthRegistration(registrationNumber, childName, dob, placeOfBirth) {
  if (!registrationNumber || registrationNumber.length < 4) {
    return {
      verified: false,
      issuer: ISSUERS.BIRTH_REGISTER,
      error: "Invalid birth registration number",
      flags: ["DIGILOCKER_BIRTH_REG_INVALID"]
    };
  }

  const lowerChild = (childName || "").toLowerCase();
  if (lowerChild.includes("lakshmi") && lowerChild.includes("patil")) {
    return {
      verified: true,
      issuer: ISSUERS.BIRTH_REGISTER,
      reference_id: registrationNumber,
      record: {
        child_name: "Lakshmi Patil",
        dob: "27/07/1970",
        place_of_birth: placeOfBirth || "Pune, Maharashtra",
        registration_days_after_birth: 5,
        is_late_registration: false,
        requires_magistrate_order: false,
        name_match: true,
        dob_match: true
      },
      name_match: true,
      flags: [],
      confidence_boost: 15
    };
  }

  const hash = seededHash(registrationNumber + (childName || "") + (dob || ""));
  const recordFound = hash % 10 < 7; // 70% chance found
  const detailsMatch = recordFound && (hash % 10 < 6);

  if (!recordFound) {
    return {
      verified: false,
      issuer: ISSUERS.BIRTH_REGISTER,
      error: "Birth registration number not found",
      flags: ["DIGILOCKER_BIRTH_REG_NOT_FOUND"]
    };
  }

  const registrationDaysAfterBirth = hash % 365;
  const isLateRegistration = registrationDaysAfterBirth > 21;

  return {
    verified: detailsMatch,
    issuer: ISSUERS.BIRTH_REGISTER,
    reference_id: registrationNumber,
    record: {
      registration_days_after_birth: registrationDaysAfterBirth,
      is_late_registration: isLateRegistration,
      requires_magistrate_order: registrationDaysAfterBirth > 365,
      name_match: detailsMatch,
      dob_match: detailsMatch
    },
    name_match: detailsMatch,
    flags: [
      ...(!detailsMatch ? ["DIGILOCKER_BIRTH_REG_DETAIL_MISMATCH"] : []),
      ...(isLateRegistration ? ["DIGILOCKER_LATE_BIRTH_REGISTRATION"] : [])
    ],
    confidence_boost: detailsMatch ? 15 : 0
  };
}

/**
 * verifyITReturn(panNumber, financialYear, declaredIncome)
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates Income Tax Department API lookup for ITR filed income.
 * Used for: Income Certificate — cross-reference income from IT returns.
 *
 * @param {string} panNumber      - PAN card number
 * @param {string} financialYear  - e.g. "2024-2025"
 * @param {number} declaredIncome - Annual income declared by applicant
 */
async function verifyITReturn(panNumber, financialYear, declaredIncome) {
  if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber.toUpperCase())) {
    return {
      verified: false,
      issuer: ISSUERS.INCOME_TAX,
      error: "Invalid PAN number format",
      flags: ["DIGILOCKER_PAN_INVALID"]
    };
  }

  const cleanPAN = panNumber.toUpperCase();

  // Known mock record for Lakshmi Patil (Innovex Technologies)
  if (cleanPAN === "AAPFU0939F") {
    const targetIncome = 300000;
    const isCloseMatch = !declaredIncome || Math.abs(targetIncome - declaredIncome) / targetIncome <= 0.15;
    return {
      verified: true,
      issuer: ISSUERS.INCOME_TAX,
      record: {
        pan: "AAPFU0939F",
        financial_year: financialYear || "2025-2026",
        itr_income: targetIncome,
        taxpayer_name: "Lakshmi Patil",
        employer_name: "INNOVEX TECHNOLOGIES PRIVATE LIMITED",
        income_match: isCloseMatch,
        match_variance_percent: declaredIncome ? Math.round(Math.abs(targetIncome - declaredIncome) / declaredIncome * 100) : 0
      },
      income_match: true,
      flags: [],
      confidence_boost: 15
    };
  }

  const hash = seededHash(panNumber.toUpperCase() + (financialYear || ""));
  const itrFiled = hash % 10 < 7; // 70% chance ITR was filed

  if (!itrFiled) {
    return {
      verified: false,
      issuer: ISSUERS.INCOME_TAX,
      error: `No ITR filed for PAN ${panNumber.toUpperCase()} for ${financialYear}`,
      flags: ["DIGILOCKER_ITR_NOT_FILED"]
    };
  }

  // Simulate ITR income (within ±20% of declared income for plausible scenarios)
  const varianceFactor = 0.8 + (hash % 100) / 250; // 0.8 to 1.2
  const itrIncome = Math.round(declaredIncome * varianceFactor);
  const incomeMatch = Math.abs(itrIncome - declaredIncome) / declaredIncome <= 0.10; // ±10% match

  return {
    verified: incomeMatch,
    issuer: ISSUERS.INCOME_TAX,
    record: {
      pan: panNumber.toUpperCase().replace(/.(?=.{4})/g, "X"),
      financial_year: financialYear,
      itr_income: itrIncome,
      income_match: incomeMatch,
      match_variance_percent: Math.round(Math.abs(itrIncome - declaredIncome) / declaredIncome * 100)
    },
    income_match: incomeMatch,
    flags: incomeMatch ? [] : ["DIGILOCKER_ITR_INCOME_MISMATCH"],
    confidence_boost: incomeMatch ? 12 : 0
  };
}

module.exports = {
  verifyPropertyTaxDocument,
  verifyRationCard,
  verifySchoolCertificate,
  verifyBirthRegistration,
  verifyITReturn,
  ISSUERS
};
