const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    user_id: String,
    service_type: String,
    status: {
      type: String,
      default: "waiting_for_name"
    },
    name_from_chat: String,
    mobile_from_chat: String,
    entered_income: String,
    extracted_income: Number,
    eligibility_checked: { type: Boolean, default: false },
    auto_decision: String,
    officer_note: String,
    aadhaar_number: String,
    financial_year: String,
    certificate_url: String,

    // Birth Certificate specific fields
    child_name: String,
    dob: String,
    place_of_birth: String,
    father_name: String,
    mother_name: String,
    bc_mobile: String,
    bc_flags: { type: [String], default: [] },
    bc_confidence_score: Number,
    bc_risk_level: String,
    bc_parent_detected: String,
    bc_birth_proof_ocr: Object,
    bc_aadhaar_ocr: Object,

    // Domicile Certificate specific fields
    dc_full_name: String,
    dc_mobile: String,
    dc_house_no: String,
    dc_street: String,
    dc_city: String,
    dc_district: String,
    dc_state: String,
    dc_pin: String,
    dc_duration_years: Number,
    dc_purpose: String,
    dc_flags: { type: [String], default: [] },
    dc_confidence_score: Number,
    dc_risk_level: String,
    dc_aadhaar_last4: String,
    dc_dob: String,
    dc_assigned_officer: String,
    dc_jurisdiction_flag: String,
    dc_aadhaar_ocr: Object,
    dc_address_proof_ocr: Object,
    dc_residency_proof_ocr: Object,
    dc_aadhaar_retry: { type: Number, default: 0 },
    dc_addr_proof_retry: { type: Number, default: 0 },
    dc_residency_proof_retry: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);