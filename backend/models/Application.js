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
    certificate_url: String
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);