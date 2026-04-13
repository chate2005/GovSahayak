const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    user_id: String,
    service_type: String,
    status: {
      type: String,
      default: "waiting_for_documents"
    },
    extracted_income: Number,
    eligibility_checked: { type: Boolean, default: false },
    auto_decision: String,
    officer_note: String,
    aadhaar_number: String,          // ← store aadhaar for duplicate check
    financial_year: String,          // ← e.g. "2025-2026"
    certificate_url: String          // ← PDF download URL
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);